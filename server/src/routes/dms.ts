/**
 * Direct messages.
 *
 * The server's part is small and deliberately ignorant. It knows who is in a
 * conversation, it stores sealed bytes, and it hands each person the copies of
 * the message key that were locked for their devices. It is never given a
 * message body and has no column to put one in.
 *
 * What it does hold is everyone's public keys, which makes it the one place a
 * key could be swapped for another. It checks that a published key is signed
 * by the identity it claims and refuses to let a device's key change, but the
 * defence that matters is on the other side: clients remember the identity
 * keys they have seen and say so when one is new. See `web/src/lib/dm-crypto.ts`
 * and `docs/dm-plan.md`.
 */

import { webcrypto } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DeviceKey, DmChannel, DmMessage, DmWrappedKey } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import {
  deviceKeys,
  dmChannels,
  dmMembers,
  dmMessageKeys,
  dmMessages,
  members,
  users,
} from '../db/schema.js';
import type { DeviceKeyRow, DmChannelRow, DmMessageKeyRow, DmMessageRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import { consume } from '../lib/rate-limit.js';
import * as serialize from '../services/serialize.js';

/** Browsers come and go. Past this many, the one unseen longest is forgotten. */
const MAX_DEVICES_PER_USER = 20;

/** Must match `DEVICE_CONTEXT` in web/src/lib/dm-crypto.ts. */
const DEVICE_CONTEXT = 'scryproof/dm/device/v1';

const base64 = z.string().min(1).max(4096).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const deviceIdShape = z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/);

/** Length-prefixed join. The same function the client signs with. */
function concatLabelled(...parts: (string | Uint8Array)[]): Uint8Array {
  const encoded = parts.map((part) => (typeof part === 'string' ? new TextEncoder().encode(part) : part));
  const total = encoded.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of encoded) {
    view.setUint32(at, part.length, false);
    out.set(part, at + 4);
    at += 4 + part.length;
  }
  return out;
}

/**
 * Whether the identity key really signed this device's DM key. It does not say
 * whose identity key it is. Nothing the server checks could: that is the
 * clients' job. It keeps garbage and mismatched pairs out of the table.
 */
async function signatureHolds(userId: string, device: Omit<DeviceKey, 'userId'>): Promise<boolean> {
  try {
    const identityKey = Buffer.from(device.identityKey, 'base64');
    const dmKey = Buffer.from(device.dmKey, 'base64');
    const key = await webcrypto.subtle.importKey(
      'spki',
      identityKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    // The DM key has to be a real P-256 point too, or nobody could use it.
    await webcrypto.subtle.importKey('spki', dmKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Buffer.from(device.signature, 'base64'),
      concatLabelled(DEVICE_CONTEXT, userId, device.deviceId, identityKey, dmKey),
    );
  } catch {
    return false;
  }
}

const toDeviceKey = (row: DeviceKeyRow): DeviceKey => ({
  userId: row.userId,
  deviceId: row.deviceId,
  identityKey: row.identityKey,
  dmKey: row.dmKey,
  signature: row.signature,
});

/**
 * node-postgres hands bytea back as a Buffer; PGlite, which development runs
 * on, hands back a plain Uint8Array, whose toString ignores its argument and
 * prints "12,200,7". Found by `npm run test:dm`, where nothing would open.
 */
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const pairKeyFor = (a: string, b: string): string => [a, b].sort().join(':');

async function sharesAServer(a: string, b: string): Promise<boolean> {
  const mine = await getDb().select({ serverId: members.serverId }).from(members).where(eq(members.userId, a));
  if (mine.length === 0) return false;
  const [shared] = await getDb()
    .select({ serverId: members.serverId })
    .from(members)
    .where(and(eq(members.userId, b), inArray(members.serverId, mine.map((row) => row.serverId))))
    .limit(1);
  return Boolean(shared);
}

/**
 * Everyone in a conversation, or a 404 for anybody who is not one of them. A
 * stranger asking about a real conversation and about a made-up one get the
 * same answer.
 */
async function requireDmMember(dmId: string, userId: string): Promise<{ dm: DmChannelRow; memberIds: string[] }> {
  const db = getDb();
  const rows = await db.select().from(dmMembers).where(eq(dmMembers.dmId, dmId));
  if (!rows.some((row) => row.userId === userId)) {
    throw notFound('That conversation does not exist.', 'unknown_dm');
  }
  const [dm] = await db.select().from(dmChannels).where(eq(dmChannels.id, dmId)).limit(1);
  if (!dm) throw notFound('That conversation does not exist.', 'unknown_dm');
  return { dm, memberIds: rows.map((row) => row.userId) };
}

async function describeDms(rows: DmChannelRow[], forUserId: string): Promise<DmChannel[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const memberRows = await db
    .select()
    .from(dmMembers)
    .where(inArray(dmMembers.dmId, rows.map((row) => row.id)));
  const userRows = await db
    .select()
    .from(users)
    .where(inArray(users.id, [...new Set(memberRows.map((row) => row.userId))]));
  const byId = new Map(userRows.map((row) => [row.id, row]));

  return rows.map((row) => {
    const mine = memberRows.filter((member) => member.dmId === row.id);
    return {
      id: row.id,
      members: mine
        .map((member) => byId.get(member.userId))
        .filter((user): user is NonNullable<typeof user> => user !== undefined)
        .map((user) => serialize.publicUser(user)),
      lastMessageId: row.lastMessageId,
      lastReadMessageId: mine.find((member) => member.userId === forUserId)?.lastReadMessageId ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

function toDmMessage(row: DmMessageRow, keys: DmMessageKeyRow[], forUserId: string): DmMessage {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    dmId: row.dmId,
    authorId: row.authorId,
    senderDeviceId: row.senderDeviceId,
    iv: deleted || !row.iv ? null : b64(row.iv),
    ciphertext: deleted || !row.ciphertext ? null : b64(row.ciphertext),
    // Somebody else's copies are no use to this person and are not theirs to have.
    keys: deleted
      ? []
      : keys
          .filter((key) => key.messageId === row.id && key.userId === forUserId)
          .map(
            (key): DmWrappedKey => ({
              userId: key.userId,
              deviceId: key.deviceId,
              iv: b64(key.iv),
              key: b64(key.wrapped),
            }),
          ),
    reactionTo: row.reactionTo,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deleted,
  };
}

/** What a sealed message looks like on the way in, new or edited. */
const sealedShape = {
  senderDeviceId: deviceIdShape,
  iv: base64.max(64),
  ciphertext: base64.max(64_000),
  keys: z
    .array(z.object({ userId: z.string().max(64), deviceId: deviceIdShape, iv: base64.max(64), key: base64.max(256) }))
    .min(1)
    .max(MAX_DEVICES_PER_USER * 10),
};

type SealedKeys = { userId: string; deviceId: string; iv: string; key: string }[];

/**
 * A copy of the key may only be addressed to somebody in the conversation.
 * Anything else would be a way to hand a third person a readable copy that
 * neither of the two could see had been made.
 */
function checkRecipients(keys: SealedKeys, memberIds: string[]): void {
  const allowed = new Set(memberIds);
  if (keys.some((key) => !allowed.has(key.userId))) {
    throw badRequest('A key was addressed to someone outside this conversation.', 'invalid_recipient');
  }
  const seen = new Set<string>();
  for (const key of keys) {
    const slot = `${key.userId}:${key.deviceId}`;
    if (seen.has(slot)) throw badRequest('A device was addressed twice.', 'invalid_recipient');
    seen.add(slot);
  }
}

/**
 * The other side opens a message with the sender device's public key, so a
 * device nobody has heard of would produce a message nobody can read.
 */
async function requirePublishedDevice(userId: string, deviceId: string): Promise<void> {
  const [sender] = await getDb()
    .select({ deviceId: deviceKeys.deviceId })
    .from(deviceKeys)
    .where(and(eq(deviceKeys.userId, userId), eq(deviceKeys.deviceId, deviceId)))
    .limit(1);
  if (!sender) throw badRequest('This device has not published its keys.', 'unknown_device');
}

/**
 * Leaving every server you share with someone, or being removed from it, ends
 * your ability to write to them. The history stays readable.
 */
async function requireStillConnected(userId: string, memberIds: string[]): Promise<void> {
  for (const memberId of memberIds) {
    if (memberId !== userId && !(await sharesAServer(userId, memberId))) {
      throw forbidden('You no longer share a server with this person.');
    }
  }
}

const keyValues = (messageId: string, keys: SealedKeys) =>
  keys.map((key) => ({
    messageId,
    userId: key.userId,
    deviceId: key.deviceId,
    iv: Buffer.from(key.iv, 'base64'),
    wrapped: Buffer.from(key.key, 'base64'),
  }));

export async function registerDmRoutes(app: FastifyInstance): Promise<void> {
  /* --------------------------------- devices -------------------------------- */

  /** A browser announcing its public keys. Safe to repeat on every sign-in. */
  app.put('/api/devices', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ deviceId: deviceIdShape, identityKey: base64, dmKey: base64, signature: base64 })
      .parse(request.body);

    if (!(await signatureHolds(user.id, body))) {
      throw badRequest('Those keys do not match their signature.', 'invalid_device_key');
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(deviceKeys)
      .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, body.deviceId)))
      .limit(1);

    if (existing) {
      // A device never changes its keys. New keys are a new device, which is
      // something the people they talk to get told about; quietly replacing a
      // key under an id they already trust is what an impostor would want.
      if (existing.identityKey !== body.identityKey || existing.dmKey !== body.dmKey) {
        throw conflict('That device already has different keys.', 'device_key_mismatch');
      }
      await db
        .update(deviceKeys)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, body.deviceId)));
      return { device: toDeviceKey(existing) };
    }

    const [created] = await db
      .insert(deviceKeys)
      .values({ userId: user.id, ...body })
      .returning();
    if (!created) throw badRequest('Could not register this device.', 'device_failed');

    const all = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.userId, user.id))
      .orderBy(desc(deviceKeys.lastSeenAt));
    for (const stale of all.slice(MAX_DEVICES_PER_USER)) {
      await db
        .delete(deviceKeys)
        .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, stale.deviceId)));
    }

    return { device: toDeviceKey(created) };
  });

  /** Every device of everyone in a conversation: who a message must be locked for. */
  app.get('/api/dms/:dmId/devices', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    const { memberIds } = await requireDmMember(dmId, user.id);

    const rows = await getDb().select().from(deviceKeys).where(inArray(deviceKeys.userId, memberIds));
    return { devices: rows.map(toDeviceKey) };
  });

  /* ------------------------------ conversations ----------------------------- */

  app.get('/api/dms', async (request) => {
    const user = requireUser(request);
    const db = getDb();
    const mine = await db.select({ dmId: dmMembers.dmId }).from(dmMembers).where(eq(dmMembers.userId, user.id));
    if (mine.length === 0) return { dms: [] };
    const rows = await db
      .select()
      .from(dmChannels)
      .where(inArray(dmChannels.id, mine.map((row) => row.dmId)));
    return { dms: await describeDms(rows, user.id) };
  });

  /** Open the conversation with someone, making it if this is the first time. */
  app.post('/api/dms', async (request) => {
    const user = requireUser(request);
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.body);
    if (userId === user.id) throw badRequest('That is you.', 'dm_self');

    // No friends list and no directory: you can write to the people you share
    // a server with. Anyone else reports as not existing, so this cannot be
    // used to find out who has an account here.
    if (!(await sharesAServer(user.id, userId))) {
      throw notFound('That person does not exist.', 'unknown_user');
    }

    const db = getDb();
    const pairKey = pairKeyFor(user.id, userId);
    const [existing] = await db.select().from(dmChannels).where(eq(dmChannels.pairKey, pairKey)).limit(1);
    if (existing) {
      const [dm] = await describeDms([existing], user.id);
      return { dm };
    }

    const dmId = uuidv7();
    // Two people opening it at the same moment: the unique index picks one.
    const [created] = await db.insert(dmChannels).values({ id: dmId, pairKey }).onConflictDoNothing().returning();
    if (!created) {
      const [winner] = await db.select().from(dmChannels).where(eq(dmChannels.pairKey, pairKey)).limit(1);
      if (!winner) throw badRequest('Could not open that conversation.', 'dm_failed');
      const [dm] = await describeDms([winner], user.id);
      return { dm };
    }
    await db.insert(dmMembers).values([
      { dmId, userId: user.id },
      { dmId, userId },
    ]);

    for (const memberId of [user.id, userId]) {
      const [dm] = await describeDms([created], memberId);
      if (dm && memberId !== user.id) hub.sendToUser(memberId, { t: 'dm_create', d: dm });
    }
    const [dm] = await describeDms([created], user.id);
    return { dm };
  });

  /* --------------------------------- messages ------------------------------- */

  app.get('/api/dms/:dmId/messages', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    const query = z
      .object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })
      .parse(request.query);
    await requireDmMember(dmId, user.id);

    const db = getDb();
    // Reactions ride along with the messages they belong to, never as rows of their own.
    const conditions = [eq(dmMessages.dmId, dmId), isNull(dmMessages.reactionTo)];
    if (query.before) conditions.push(lt(dmMessages.id, query.before));
    const rows = (
      await db.select().from(dmMessages).where(and(...conditions)).orderBy(desc(dmMessages.id)).limit(query.limit)
    ).reverse();
    if (rows.length === 0) return { messages: [], reactions: [] };

    const reactionRows = await db
      .select()
      .from(dmMessages)
      .where(and(eq(dmMessages.dmId, dmId), inArray(dmMessages.reactionTo, rows.map((row) => row.id))))
      .orderBy(dmMessages.id);

    const keys = await db
      .select()
      .from(dmMessageKeys)
      .where(
        and(
          inArray(dmMessageKeys.messageId, [...rows, ...reactionRows].map((row) => row.id)),
          eq(dmMessageKeys.userId, user.id),
        ),
      );

    return {
      messages: rows.map((row) => toDmMessage(row, keys, user.id)),
      reactions: reactionRows.map((row) => toDmMessage(row, keys, user.id)),
    };
  });

  app.post('/api/dms/:dmId/messages', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    const body = z.object({ ...sealedShape, reactionTo: z.string().max(64).optional() }).parse(request.body);

    const { memberIds } = await requireDmMember(dmId, user.id);

    const limit = consume(`messages:${user.id}`, config.rateLimits.messagesPerMinute, 60_000);
    if (!limit.allowed) throw tooManyRequests('You are sending messages too quickly.', limit.retryAfterSeconds);

    await requireStillConnected(user.id, memberIds);
    checkRecipients(body.keys, memberIds);
    await requirePublishedDevice(user.id, body.senderDeviceId);

    const db = getDb();

    if (body.reactionTo) {
      const [target] = await db
        .select()
        .from(dmMessages)
        .where(and(eq(dmMessages.id, body.reactionTo), eq(dmMessages.dmId, dmId)))
        .limit(1);
      if (!target || target.deletedAt || target.reactionTo) {
        throw badRequest('There is no message there to react to.', 'unknown_message');
      }
    }

    const messageId = uuidv7();
    const [created] = await db
      .insert(dmMessages)
      .values({
        id: messageId,
        dmId,
        authorId: user.id,
        senderDeviceId: body.senderDeviceId,
        iv: Buffer.from(body.iv, 'base64'),
        ciphertext: Buffer.from(body.ciphertext, 'base64'),
        reactionTo: body.reactionTo ?? null,
      })
      .returning();
    if (!created) throw badRequest('Could not send the message.', 'send_failed');

    const keyRows = await db.insert(dmMessageKeys).values(keyValues(messageId, body.keys)).returning();

    // A reaction does not make a conversation unread.
    if (!body.reactionTo) {
      await db.update(dmChannels).set({ lastMessageId: messageId }).where(eq(dmChannels.id, dmId));
      // Your own message is never unread to you.
      await db
        .update(dmMembers)
        .set({ lastReadMessageId: messageId })
        .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, user.id)));
    }

    for (const memberId of memberIds) {
      hub.sendToUser(memberId, { t: 'dm_message_create', d: toDmMessage(created, keyRows, memberId) });
    }

    return { message: toDmMessage(created, keyRows, user.id) };
  });

  /**
   * An edit is the author sealing the message again. The old sealed bytes and
   * every old copy of the key are replaced, not kept beside the new ones.
   */
  app.patch('/api/dms/:dmId/messages/:messageId', async (request) => {
    const user = requireUser(request);
    const { dmId, messageId } = z.object({ dmId: z.string(), messageId: z.string() }).parse(request.params);
    const body = z.object(sealedShape).parse(request.body);
    const { memberIds } = await requireDmMember(dmId, user.id);

    const limit = consume(`messages:${user.id}`, config.rateLimits.messagesPerMinute, 60_000);
    if (!limit.allowed) throw tooManyRequests('You are editing too quickly.', limit.retryAfterSeconds);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(dmMessages)
      .where(and(eq(dmMessages.id, messageId), eq(dmMessages.dmId, dmId)))
      .limit(1);
    if (!existing || existing.deletedAt || existing.reactionTo) {
      throw notFound('That message does not exist.', 'unknown_message');
    }
    if (existing.authorId !== user.id) throw forbidden('You can only edit your own messages.');

    await requireStillConnected(user.id, memberIds);
    checkRecipients(body.keys, memberIds);
    await requirePublishedDevice(user.id, body.senderDeviceId);

    const [updated] = await db
      .update(dmMessages)
      .set({
        senderDeviceId: body.senderDeviceId,
        iv: Buffer.from(body.iv, 'base64'),
        ciphertext: Buffer.from(body.ciphertext, 'base64'),
        editedAt: new Date(),
      })
      .where(eq(dmMessages.id, messageId))
      .returning();
    if (!updated) throw badRequest('Could not save that edit.', 'edit_failed');

    await db.delete(dmMessageKeys).where(eq(dmMessageKeys.messageId, messageId));
    const keyRows = await db.insert(dmMessageKeys).values(keyValues(messageId, body.keys)).returning();

    for (const memberId of memberIds) {
      hub.sendToUser(memberId, { t: 'dm_message_update', d: toDmMessage(updated, keyRows, memberId) });
    }
    return { message: toDmMessage(updated, keyRows, user.id) };
  });

  app.delete('/api/dms/:dmId/messages/:messageId', async (request) => {
    const user = requireUser(request);
    const { dmId, messageId } = z.object({ dmId: z.string(), messageId: z.string() }).parse(request.params);
    const { memberIds } = await requireDmMember(dmId, user.id);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(dmMessages)
      .where(and(eq(dmMessages.id, messageId), eq(dmMessages.dmId, dmId)))
      .limit(1);
    if (!existing) throw notFound('That message does not exist.', 'unknown_message');
    // There is no moderator in a conversation between two people.
    if (existing.authorId !== user.id) throw forbidden('You can only delete your own messages.');

    if (existing.reactionTo) {
      // Taking a reaction back leaves nothing behind. Its keys go with the row.
      await db.delete(dmMessages).where(eq(dmMessages.id, messageId));
    } else {
      // The sealed bytes and every copy of the key go, not just a flag. So do
      // the reactions to it.
      await db
        .update(dmMessages)
        .set({ deletedAt: new Date(), iv: null, ciphertext: null })
        .where(eq(dmMessages.id, messageId));
      await db.delete(dmMessageKeys).where(eq(dmMessageKeys.messageId, messageId));
      await db.delete(dmMessages).where(and(eq(dmMessages.dmId, dmId), eq(dmMessages.reactionTo, messageId)));
    }

    for (const memberId of memberIds) {
      hub.sendToUser(memberId, {
        t: 'dm_message_delete',
        d: { id: messageId, dmId, reactionTo: existing.reactionTo },
      });
    }
    return { ok: true };
  });

  app.put('/api/dms/:dmId/read', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.body);
    await requireDmMember(dmId, user.id);

    const db = getDb();
    const [target] = await db
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .where(and(eq(dmMessages.id, messageId), eq(dmMessages.dmId, dmId)))
      .limit(1);
    if (!target) throw badRequest('That message is not in this conversation.', 'unknown_message');

    // Reading only moves forward. Ids sort by time, so this is a string compare.
    await db
      .update(dmMembers)
      .set({ lastReadMessageId: messageId })
      .where(
        and(
          eq(dmMembers.dmId, dmId),
          eq(dmMembers.userId, user.id),
          sql`(${dmMembers.lastReadMessageId} is null or ${dmMembers.lastReadMessageId} < ${messageId})`,
        ),
      );

    // Every device this person has open. Never the other person: whether you
    // have read something is yours to know.
    hub.sendToUser(user.id, { t: 'dm_read', d: { dmId, lastReadMessageId: messageId } });
    return { ok: true };
  });
}
