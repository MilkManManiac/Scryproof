/**
 * Keys for encrypted channels.
 *
 * Like DMs, the server's part is to store what it cannot open and to know who
 * should be able to. Members' devices make each epoch's key, lock copies of it
 * for each other, and sign a commitment to it; the server keeps the locked
 * copies and the commitment, checks the signatures to keep garbage out, and
 * retires an epoch when a device holding it should no longer read the channel.
 * `docs/channel-e2ee.md`, `web/src/lib/channel-crypto.ts`.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';

import { epochSignedBytes } from '@scryproof/shared';
import type { ChannelEpoch, ChannelKeyCopy, ChannelKeyState, ChannelKeyWant, DeviceKey } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { channelEpochs, channelKeys, channels, deviceKeys, messages } from '../db/schema.js';
import type { ChannelEpochRow, ChannelKeyRow, ChannelRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, notFound, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { READ, channelReaders, devicesOf, freshEpoch, identitySigned } from '../services/channel-keys.js';
import { requireChannelPermission } from '../services/permissions.js';
import { requirePublishedDevice, toDeviceKey } from './dms.js';

const RECOVERY_PREFIX = 'recovery-';

const base64 = z.string().min(1).max(4096).regex(/^[A-Za-z0-9+/]+={0,2}$/);
const deviceIdShape = z.string().min(8).max(64).regex(/^[A-Za-z0-9-]+$/);
const copyShape = z.object({
  userId: z.string().max(64),
  deviceId: deviceIdShape,
  iv: base64.max(64),
  key: base64.max(256),
});

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const toEpoch = (row: ChannelEpochRow): ChannelEpoch => ({
  epoch: row.epoch,
  creatorId: row.creatorId,
  creatorDeviceId: row.creatorDeviceId,
  commitment: b64(row.commitment),
  signature: b64(row.signature),
});

const toCopy = (row: ChannelKeyRow): ChannelKeyCopy => ({
  epoch: row.epoch,
  userId: row.userId,
  deviceId: row.deviceId,
  wrapperId: row.wrapperId,
  wrapperDeviceId: row.wrapperDeviceId,
  iv: b64(row.iv),
  key: b64(row.wrapped),
});

/** An encrypted text channel the caller can read, or the error that says why not. */
export async function requireEncryptedChannel(channelId: string, userId: string): Promise<ChannelRow> {
  await requireChannelPermission(channelId, userId, READ);
  const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
  if (!channel.encrypted) throw badRequest('This channel is not encrypted.', 'encryption_not_enabled');
  return channel;
}

const deviceKeyOf = (userId: string, deviceId: string): string => `${userId}/${deviceId}`;

/** The devices of people who can read the channel, keyed "user/device". */
async function readerDevices(channel: ChannelRow): Promise<Map<string, DeviceKey>> {
  const rows = await devicesOf(await channelReaders(channel));
  return new Map(rows.map((row) => [deviceKeyOf(row.userId, row.deviceId), toDeviceKey(row)]));
}

export async function registerChannelKeyRoutes(app: FastifyInstance): Promise<void> {
  /** What this device needs: the epochs, its own copies, and who holds the current key. */
  app.get('/api/channels/:channelId/keys', async (request): Promise<ChannelKeyState> => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { deviceId } = z.object({ deviceId: deviceIdShape }).parse(request.query);
    const channel = await requireEncryptedChannel(channelId, user.id);
    await requirePublishedDevice(user.id, deviceId);
    const current = await freshEpoch(channel);

    const db = getDb();
    const epochs = await db
      .select()
      .from(channelEpochs)
      .where(eq(channelEpochs.channelId, channelId))
      .orderBy(asc(channelEpochs.epoch));

    const [recovery] = await db
      .select({ deviceId: deviceKeys.deviceId })
      .from(deviceKeys)
      .where(and(eq(deviceKeys.userId, user.id), like(deviceKeys.deviceId, `${RECOVERY_PREFIX}%`)))
      .limit(1);
    const mine = [deviceId, ...(recovery ? [recovery.deviceId] : [])];
    const keys = await db
      .select()
      .from(channelKeys)
      .where(and(eq(channelKeys.channelId, channelId), eq(channelKeys.userId, user.id), inArray(channelKeys.deviceId, mine)));

    const holders = await db
      .select({ userId: channelKeys.userId, deviceId: channelKeys.deviceId })
      .from(channelKeys)
      .where(and(eq(channelKeys.channelId, channelId), eq(channelKeys.epoch, current)));

    return { current, epochs: epochs.map(toEpoch), keys: keys.map(toCopy), holders };
  });

  /**
   * Every device of everyone who can read the channel, which is who a new key
   * is locked for, plus the devices of anyone who ever wrote here, made a key
   * or handed one on, so that what they signed can still be checked after
   * they have gone. `readers` says which people are which.
   */
  app.get('/api/channels/:channelId/key-devices', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const channel = await requireEncryptedChannel(channelId, user.id);
    const readers = await channelReaders(channel);

    const db = getDb();
    const [authors, makers, wrappers] = await Promise.all([
      db.selectDistinct({ userId: messages.authorId }).from(messages).where(eq(messages.channelId, channelId)),
      db.selectDistinct({ userId: channelEpochs.creatorId }).from(channelEpochs).where(eq(channelEpochs.channelId, channelId)),
      db.selectDistinct({ userId: channelKeys.wrapperId }).from(channelKeys).where(eq(channelKeys.channelId, channelId)),
    ]);
    const everyone = new Set([...readers, ...[...authors, ...makers, ...wrappers].map((row) => row.userId)]);
    const rows = await devicesOf(everyone);
    return { devices: rows.map(toDeviceKey), readers: [...readers] };
  });

  /**
   * A new epoch's key, made on the caller's device: the signed commitment and
   * a copy locked for each device that can read the channel. Only the current
   * epoch can be made, and only once; whoever loses the race is told to fetch
   * the winner's.
   */
  app.post('/api/channels/:channelId/epochs', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z
      .object({
        epoch: z.number().int().min(1),
        deviceId: deviceIdShape,
        commitment: base64.max(128),
        signature: base64.max(256),
        keys: z.array(copyShape).min(1).max(2000),
      })
      .parse(request.body);
    const channel = await requireEncryptedChannel(channelId, user.id);
    const current = await freshEpoch(channel);
    if (body.epoch !== current) throw conflict('The channel has moved to a newer key.', 'key_rotated');

    const devices = await readerDevices(channel);
    const creator = devices.get(deviceKeyOf(user.id, body.deviceId));
    if (!creator) throw badRequest('This device has not published its keys.', 'unknown_device');

    const commitment = Buffer.from(body.commitment, 'base64');
    const signature = Buffer.from(body.signature, 'base64');
    const signed = epochSignedBytes({ channelId, epoch: body.epoch, creatorId: user.id, creatorDeviceId: body.deviceId, commitment });
    if (!(await identitySigned(creator.identityKey, signature, signed))) {
      throw badRequest('That key is not signed by this device.', 'bad_signature');
    }
    if (!body.keys.some((key) => key.userId === user.id && key.deviceId === body.deviceId)) {
      throw badRequest('The maker of a key keeps a copy of it.', 'missing_own_copy');
    }
    // A copy for someone who cannot read the channel is a way in for them. Refused, not dropped.
    if (body.keys.some((key) => !devices.has(deviceKeyOf(key.userId, key.deviceId)))) {
      throw badRequest('That device cannot read this channel.', 'not_a_reader');
    }

    const db = getDb();
    const made = await db
      .insert(channelEpochs)
      .values({ channelId, epoch: body.epoch, creatorId: user.id, creatorDeviceId: body.deviceId, commitment, signature })
      .onConflictDoNothing()
      .returning();
    if (made.length === 0) throw conflict('Someone else made this key a moment ago.', 'epoch_exists');

    await db
      .insert(channelKeys)
      .values(
        body.keys.map((key) => ({
          channelId,
          epoch: body.epoch,
          userId: key.userId,
          deviceId: key.deviceId,
          wrapperId: user.id,
          wrapperDeviceId: body.deviceId,
          iv: Buffer.from(key.iv, 'base64'),
          wrapped: Buffer.from(key.key, 'base64'),
        })),
      )
      .onConflictDoNothing();

    await hub.broadcastToChannel(channel.serverId, channelId, {
      t: 'channel_keys',
      d: { channelId, current: body.epoch, wanted: false },
    }, READ);
    return { epoch: made[0] ? toEpoch(made[0]) : null };
  });

  /**
   * Copies this device could hand over: every epoch it holds, for every
   * reader's device that lacks one. The caller decides which of those devices
   * it believes; the server only says who is missing what.
   */
  app.get('/api/channels/:channelId/keys/wanted', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { deviceId } = z.object({ deviceId: deviceIdShape }).parse(request.query);
    const channel = await requireEncryptedChannel(channelId, user.id);
    await requirePublishedDevice(user.id, deviceId);

    const db = getDb();
    const held = await db
      .select({ epoch: channelKeys.epoch })
      .from(channelKeys)
      .where(and(eq(channelKeys.channelId, channelId), eq(channelKeys.userId, user.id), eq(channelKeys.deviceId, deviceId)));
    if (held.length === 0) return { wanted: [] as ChannelKeyWant[], devices: [] as DeviceKey[] };

    const devices = await readerDevices(channel);
    const existing = await db
      .select({ epoch: channelKeys.epoch, userId: channelKeys.userId, deviceId: channelKeys.deviceId })
      .from(channelKeys)
      .where(eq(channelKeys.channelId, channelId));
    const has = new Set(existing.map((row) => `${row.epoch}/${deviceKeyOf(row.userId, row.deviceId)}`));

    const wanted: ChannelKeyWant[] = [];
    for (const { epoch } of held) {
      for (const device of devices.values()) {
        if (!has.has(`${epoch}/${deviceKeyOf(device.userId, device.deviceId)}`)) {
          wanted.push({ epoch, userId: device.userId, deviceId: device.deviceId });
        }
      }
    }
    const needed = new Set(wanted.map((want) => deviceKeyOf(want.userId, want.deviceId)));
    return { wanted, devices: [...devices.values()].filter((device) => needed.has(deviceKeyOf(device.userId, device.deviceId))) };
  });

  /**
   * Copies handed over by the caller's device. It must hold each epoch it
   * hands on, and each device it hands to must be able to read the channel.
   * Whether the copy opens, the server cannot tell; one that does not is a
   * copy the recipient ignores, and the first copy stays.
   */
  app.post('/api/channels/:channelId/keys', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z
      .object({
        deviceId: deviceIdShape,
        keys: z.array(copyShape.extend({ epoch: z.number().int().min(1) })).min(1).max(2000),
      })
      .parse(request.body);
    const channel = await requireEncryptedChannel(channelId, user.id);
    await requirePublishedDevice(user.id, body.deviceId);

    const db = getDb();
    const held = new Set(
      (
        await db
          .select({ epoch: channelKeys.epoch })
          .from(channelKeys)
          .where(and(eq(channelKeys.channelId, channelId), eq(channelKeys.userId, user.id), eq(channelKeys.deviceId, body.deviceId)))
      ).map((row) => row.epoch),
    );
    const devices = await readerDevices(channel);
    const rows = body.keys
      .filter((key) => held.has(key.epoch) && devices.has(deviceKeyOf(key.userId, key.deviceId)))
      .map((key) => ({
        channelId,
        epoch: key.epoch,
        userId: key.userId,
        deviceId: key.deviceId,
        wrapperId: user.id,
        wrapperDeviceId: body.deviceId,
        iv: Buffer.from(key.iv, 'base64'),
        wrapped: Buffer.from(key.key, 'base64'),
      }));
    const added = rows.length > 0 ? await db.insert(channelKeys).values(rows).onConflictDoNothing().returning() : [];

    const current = channel.keyEpoch;
    for (const userId of new Set(added.map((row) => row.userId))) {
      hub.sendToUser(userId, { t: 'channel_keys', d: { channelId, current, wanted: false } });
    }
    return { added: added.length };
  });

  /** "This device has no key yet": asks whoever is online and has one to hand it over. */
  app.post('/api/channels/:channelId/keys/request', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const channel = await requireEncryptedChannel(channelId, user.id);
    const limit = consume(`channel-key-request:${user.id}:${channelId}`, 6, 60_000);
    if (!limit.allowed) throw tooManyRequests('Already asked. Someone with the key has to be online.', limit.retryAfterSeconds);
    await hub.broadcastToChannel(channel.serverId, channelId, {
      t: 'channel_keys',
      d: { channelId, current: channel.keyEpoch, wanted: true },
    }, READ);
    return { ok: true };
  });
}
