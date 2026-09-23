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
import { LIMITS } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import {
  deviceKeys,
  dmChannels,
  dmFiles,
  dmMembers,
  dmMessageKeys,
  dmMessages,
  users,
} from '../db/schema.js';
import type { DeviceKeyRow, DmChannelRow, DmMessageKeyRow, DmMessageRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import { consume } from '../lib/rate-limit.js';
import { blockBetween } from '../services/blocks.js';
import * as serialize from '../services/serialize.js';
import { sharesAServer } from '../services/servers.js';
import { buildStorageKey, deleteObject, readFromS3, readStream, saveStream } from '../services/storage.js';

/** Browsers come and go. Past this many, the one unseen longest is forgotten. */
const MAX_DEVICES_PER_USER = 20;

/** Must match `DEVICE_CONTEXT` in web/src/lib/dm-crypto.ts. */
const DEVICE_CONTEXT = 'scryproof/dm/device/v1';
/** Must match `ENDORSE_CONTEXT` in web/src/lib/dm-crypto.ts. */
const ENDORSE_CONTEXT = 'scryproof/dm/endorse/v1';
/**
 * The device a recovery phrase stands for. It never signs in, so it is never
 * "seen", and must not be forgotten for that. One per person.
 */
const RECOVERY_PREFIX = 'recovery-';

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

/**
 * Whether one of this person's devices really vouched for another. Like the
 * check above, this keeps nonsense out of the table. Whether the vouching
 * device is one to believe is for the people reading it to decide.
 */
async function endorsementHolds(
  userId: string,
  endorser: DeviceKeyRow,
  device: { deviceId: string; identityKey: string },
  signature: string,
): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey(
      'spki',
      Buffer.from(endorser.identityKey, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      Buffer.from(signature, 'base64'),
      concatLabelled(ENDORSE_CONTEXT, userId, endorser.deviceId, device.deviceId, Buffer.from(device.identityKey, 'base64')),
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
  endorsedBy: row.endorsedBy && row.endorsement ? { deviceId: row.endorsedBy, signature: row.endorsement } : null,
});

/**
 * node-postgres hands bytea back as a Buffer; PGlite, which development runs
 * on, hands back a plain Uint8Array, whose toString ignores its argument and
 * prints "12,200,7". Found by `npm run test:dm`, where nothing would open.
 */
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const pairKeyFor = (a: string, b: string): string => [a, b].sort().join(':');

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
              wrappedBy: key.wrappedBy,
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

const fileIdsShape = z.array(z.string().max(64)).max(LIMITS.attachmentsPerMessage).optional();

/**
 * Hang uploaded files from a message. Only files this person uploaded, to this
 * conversation, that are not already part of something: the same rule that
 * makes claiming a channel attachment a permission check rather than a guess.
 */
async function claimFiles(fileIds: string[] | undefined, dmId: string, userId: string, messageId: string): Promise<void> {
  if (!fileIds || fileIds.length === 0) return;
  const claimed = await getDb()
    .update(dmFiles)
    .set({ messageId })
    .where(
      and(
        inArray(dmFiles.id, fileIds),
        eq(dmFiles.dmId, dmId),
        eq(dmFiles.uploaderId, userId),
        isNull(dmFiles.messageId),
      ),
    )
    .returning({ id: dmFiles.id });
  if (claimed.length !== new Set(fileIds).size) {
    throw badRequest('One of those files is not yours to send.', 'invalid_file');
  }
}

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

/**
 * A block closes the conversation from both ends. The two refusals are worded
 * differently because they are different facts: the blocker is reminded of
 * what they did, and the person blocked is told only that they cannot write
 * here. Nothing says who blocked whom or when, and the blocker is never told
 * that an attempt was made.
 */
async function requireNotBlocked(userId: string, memberIds: string[]): Promise<void> {
  for (const memberId of memberIds) {
    if (memberId === userId) continue;
    const { mine, theirs } = await blockBetween(userId, memberId);
    if (mine) throw forbidden('You have blocked this person.');
    if (theirs) throw forbidden('This person is not accepting messages from you.');
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
    const { endorsedBy, ...body } = z
      .object({
        deviceId: deviceIdShape,
        identityKey: base64,
        dmKey: base64,
        signature: base64,
        endorsedBy: z.object({ deviceId: deviceIdShape, signature: base64 }).nullish(),
      })
      .parse(request.body);

    if (!(await signatureHolds(user.id, body))) {
      throw badRequest('Those keys do not match their signature.', 'invalid_device_key');
    }

    const db = getDb();
    let vouched: { endorsedBy: string; endorsement: string } | null = null;
    if (endorsedBy) {
      const [endorser] = await db
        .select()
        .from(deviceKeys)
        .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, endorsedBy.deviceId)))
        .limit(1);
      if (!endorser || !(await endorsementHolds(user.id, endorser, body, endorsedBy.signature))) {
        throw badRequest('That endorsement does not hold.', 'invalid_endorsement');
      }
      vouched = { endorsedBy: endorsedBy.deviceId, endorsement: endorsedBy.signature };
    }
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
      // The keys stay; who vouches for them may be added later, which is what
      // happens when a recovery phrase is made or typed in.
      const [updated] = await db
        .update(deviceKeys)
        .set({ lastSeenAt: new Date(), ...(vouched ?? {}) })
        .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, body.deviceId)))
        .returning();
      return { device: toDeviceKey(updated ?? existing) };
    }

    const [created] = await db
      .insert(deviceKeys)
      .values({ userId: user.id, ...body, ...(vouched ?? {}) })
      .returning();
    if (!created) throw badRequest('Could not register this device.', 'device_failed');

    const all = await db
      .select()
      .from(deviceKeys)
      .where(eq(deviceKeys.userId, user.id))
      .orderBy(desc(deviceKeys.lastSeenAt));

    // A new phrase replaces the old one. Two would mean the lost one still opened things.
    if (created.deviceId.startsWith(RECOVERY_PREFIX)) {
      for (const old of all) {
        if (old.deviceId === created.deviceId || !old.deviceId.startsWith(RECOVERY_PREFIX)) continue;
        await db.delete(deviceKeys).where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, old.deviceId)));
      }
    }

    const browsers = all.filter((row) => !row.deviceId.startsWith(RECOVERY_PREFIX));
    for (const stale of browsers.slice(MAX_DEVICES_PER_USER)) {
      await db
        .delete(deviceKeys)
        .where(and(eq(deviceKeys.userId, user.id), eq(deviceKeys.deviceId, stale.deviceId)));
    }

    return { device: toDeviceKey(created) };
  });

  /** This person's own devices. How a browser learns whether a recovery phrase exists. */
  app.get('/api/devices', async (request) => {
    const user = requireUser(request);
    const rows = await getDb().select().from(deviceKeys).where(eq(deviceKeys.userId, user.id));
    return { devices: rows.map(toDeviceKey) };
  });

  /**
   * Copies of message keys made after the fact, by one of the reader's own
   * devices for another of them. Only ever for the person asking: nobody can
   * add a way in for somebody else. The server cannot tell whether a copy
   * opens; a wrong one is a copy that does not.
   */
  app.post('/api/dms/:dmId/keys', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    await requireDmMember(dmId, user.id);
    const body = z
      .object({
        wrappedBy: deviceIdShape,
        deviceId: deviceIdShape,
        keys: z.array(z.object({ messageId: z.string().max(64), iv: base64.max(64), key: base64.max(256) })).min(1).max(200),
      })
      .parse(request.body);
    await requirePublishedDevice(user.id, body.wrappedBy);
    await requirePublishedDevice(user.id, body.deviceId);

    const db = getDb();
    const real = await db
      .select({ id: dmMessages.id })
      .from(dmMessages)
      .where(and(eq(dmMessages.dmId, dmId), inArray(dmMessages.id, body.keys.map((key) => key.messageId))));
    const inThisDm = new Set(real.map((row) => row.id));
    const rows = body.keys
      .filter((key) => inThisDm.has(key.messageId))
      .map((key) => ({
        messageId: key.messageId,
        userId: user.id,
        deviceId: body.deviceId,
        iv: Buffer.from(key.iv, 'base64'),
        wrapped: Buffer.from(key.key, 'base64'),
        wrappedBy: body.wrappedBy,
      }));
    if (rows.length > 0) await db.insert(dmMessageKeys).values(rows).onConflictDoNothing();
    return { added: rows.length };
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
    // Before the row is made or found: a block means there is no conversation
    // to be had, whether or not there was one before it.
    await requireNotBlocked(user.id, [userId]);

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
    const body = z
      .object({ ...sealedShape, reactionTo: z.string().max(64).optional(), fileIds: fileIdsShape })
      .parse(request.body);
    if (body.reactionTo && body.fileIds?.length) throw badRequest('A reaction carries no files.', 'invalid_file');

    const { memberIds } = await requireDmMember(dmId, user.id);

    const limit = consume(`messages:${user.id}`, config.rateLimits.messagesPerMinute, 60_000);
    if (!limit.allowed) throw tooManyRequests('You are sending messages too quickly.', limit.retryAfterSeconds);

    await requireStillConnected(user.id, memberIds);
    await requireNotBlocked(user.id, memberIds);
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
    try {
      await claimFiles(body.fileIds, dmId, user.id, messageId);
    } catch (problem) {
      // Nobody has been told about this message yet. Take it back whole.
      await db.delete(dmMessages).where(eq(dmMessages.id, messageId));
      throw problem;
    }

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
    await requireNotBlocked(user.id, memberIds);
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
      // Its files leave the store as well. Locked bytes nobody can open are still bytes.
      const files = await db.delete(dmFiles).where(eq(dmFiles.messageId, messageId)).returning();
      for (const file of files) await deleteObject(file.storageKey).catch(() => undefined);
    }

    for (const memberId of memberIds) {
      hub.sendToUser(memberId, {
        t: 'dm_message_delete',
        d: { id: messageId, dmId, reactionTo: existing.reactionTo },
      });
    }
    return { ok: true };
  });

  /**
   * "Again" on a jump in a conversation. The server cannot read the message,
   * so it passes on only which one; each side plays it if it is a jump.
   */
  app.post('/api/dms/:dmId/messages/:messageId/replay', async (request) => {
    const user = requireUser(request);
    const { dmId, messageId } = z.object({ dmId: z.string(), messageId: z.string() }).parse(request.params);
    const { memberIds } = await requireDmMember(dmId, user.id);
    await requireNotBlocked(user.id, memberIds);

    const [existing] = await getDb()
      .select({ id: dmMessages.id, deletedAt: dmMessages.deletedAt, reactionTo: dmMessages.reactionTo })
      .from(dmMessages)
      .where(and(eq(dmMessages.id, messageId), eq(dmMessages.dmId, dmId)))
      .limit(1);
    if (!existing || existing.deletedAt || existing.reactionTo) throw notFound('That message does not exist.', 'unknown_message');

    const limit = consume(`replays:${user.id}`, 10, 30_000);
    if (!limit.allowed) throw tooManyRequests('That is a lot of jumping. Wait a moment.', limit.retryAfterSeconds);

    for (const memberId of memberIds) hub.sendToUser(memberId, { t: 'dm_spawn_replay', d: { dmId, messageId } });
    return { ok: true };
  });

  /* ---------------------------------- files --------------------------------- */

  /**
   * Bytes that were locked before they got here. There is nothing to check
   * about them except their size, and nothing to label them with: the name,
   * the type and the key travel inside the sealed message.
   */
  app.post('/api/dms/:dmId/files', async (request) => {
    const user = requireUser(request);
    const { dmId } = z.object({ dmId: z.string() }).parse(request.params);
    const { memberIds } = await requireDmMember(dmId, user.id);
    await requireStillConnected(user.id, memberIds);
    await requireNotBlocked(user.id, memberIds);

    const limit = consume(`dm-files:${user.id}`, config.rateLimits.messagesPerMinute, 60_000);
    if (!limit.allowed) throw tooManyRequests('You are uploading too quickly.', limit.retryAfterSeconds);

    const file = await request.file({ limits: { fileSize: LIMITS.dmFileBytes + 64 } });
    if (!file) throw badRequest('No file was uploaded.', 'no_file');

    const storageKey = buildStorageKey('sealed.bin');
    const stored = await saveStream(storageKey, file.file);
    if (file.file.truncated) {
      await deleteObject(storageKey);
      throw badRequest(`Files here are limited to ${Math.floor(LIMITS.dmFileBytes / (1024 * 1024))} MB.`, 'file_too_large');
    }

    const [created] = await getDb()
      .insert(dmFiles)
      .values({ id: uuidv7(), dmId, uploaderId: user.id, messageId: null, storageKey, size: stored.size })
      .returning();
    if (!created) throw badRequest('Could not save the file.', 'upload_failed');
    return { file: { id: created.id, size: created.size } };
  });

  app.get('/api/dms/:dmId/files/:fileId', async (request, reply) => {
    const user = requireUser(request);
    const { dmId, fileId } = z.object({ dmId: z.string(), fileId: z.string() }).parse(request.params);
    await requireDmMember(dmId, user.id);

    const [row] = await getDb()
      .select()
      .from(dmFiles)
      .where(and(eq(dmFiles.id, fileId), eq(dmFiles.dmId, dmId)))
      .limit(1);
    // Unsent: only whoever uploaded it.
    if (!row || (row.messageId === null && row.uploaderId !== user.id)) {
      throw notFound('That file does not exist.', 'unknown_file');
    }

    void reply.header('Content-Type', 'application/octet-stream');
    void reply.header('Content-Length', String(row.size));
    void reply.header('Content-Disposition', 'attachment');
    void reply.header('Cache-Control', 'private, max-age=86400');
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (config.storage.driver === 's3') return reply.send(await readFromS3(row.storageKey));
    return reply.send(readStream(row.storageKey));
  });

  /** Changing your mind before sending. */
  app.delete('/api/dms/:dmId/files/:fileId', async (request) => {
    const user = requireUser(request);
    const { dmId, fileId } = z.object({ dmId: z.string(), fileId: z.string() }).parse(request.params);
    const [row] = await getDb()
      .delete(dmFiles)
      .where(
        and(eq(dmFiles.id, fileId), eq(dmFiles.dmId, dmId), eq(dmFiles.uploaderId, user.id), isNull(dmFiles.messageId)),
      )
      .returning();
    if (!row) throw forbidden('You can only discard your own unsent uploads.');
    await deleteObject(row.storageKey).catch(() => undefined);
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
