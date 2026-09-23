/**
 * Who an encrypted channel's key belongs with, and retiring it when that
 * changes. The server never has the key; what it has is the list of devices
 * holding a locked copy, and it can compare that with who can read the
 * channel now. `docs/channel-e2ee.md`.
 */

import { webcrypto } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { Permission, has } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { channelKeys, channels, deviceKeys, members } from '../db/schema.js';
import type { ChannelRow, DeviceKeyRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { computePermissionsInChannel, loadMemberContext } from './permissions.js';

/** Reading an encrypted channel means what reading any channel means. */
export const READ = Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY;

/** Everyone who can read this channel right now. */
export async function channelReaders(channel: Pick<ChannelRow, 'id' | 'serverId' | 'categoryId'>): Promise<Set<string>> {
  const rows = await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, channel.serverId));
  const readers = new Set<string>();
  for (const { userId } of rows) {
    const ctx = await loadMemberContext(channel.serverId, userId);
    if (!ctx) continue;
    const permissions = await computePermissionsInChannel(ctx, channel.id, channel.categoryId);
    if (has(permissions, READ)) readers.add(userId);
  }
  return readers;
}

/** Every published device of those people: who a new key is locked for. */
export async function devicesOf(userIds: Iterable<string>): Promise<DeviceKeyRow[]> {
  const ids = [...userIds];
  if (ids.length === 0) return [];
  return getDb().select().from(deviceKeys).where(inArray(deviceKeys.userId, ids));
}

const deviceKey = (userId: string, deviceId: string): string => `${userId}/${deviceId}`;

/**
 * The epoch new messages go under, after retiring the current one if a device
 * holding it should no longer have it: its person lost access, or the device
 * itself was dropped. Nothing is retired on a gain: a newcomer is handed the
 * existing key, which is what lets them read history.
 *
 * Two senders arriving at once both see the stale key; the conditional update
 * lets only one of them move the epoch, and the other reads the result.
 */
export async function freshEpoch(channel: ChannelRow): Promise<number> {
  const db = getDb();
  const holders = await db
    .select({ userId: channelKeys.userId, deviceId: channelKeys.deviceId })
    .from(channelKeys)
    .where(and(eq(channelKeys.channelId, channel.id), eq(channelKeys.epoch, channel.keyEpoch)));
  if (holders.length === 0) return channel.keyEpoch;

  const readers = await channelReaders(channel);
  const allowed = new Set((await devicesOf(readers)).map((row) => deviceKey(row.userId, row.deviceId)));
  const stale = holders.some((holder) => !allowed.has(deviceKey(holder.userId, holder.deviceId)));
  if (!stale) return channel.keyEpoch;

  const next = channel.keyEpoch + 1;
  const moved = await db
    .update(channels)
    .set({ keyEpoch: next })
    .where(and(eq(channels.id, channel.id), eq(channels.keyEpoch, channel.keyEpoch)))
    .returning({ keyEpoch: channels.keyEpoch });
  if (moved.length > 0) {
    await hub.broadcastToChannel(channel.serverId, channel.id, {
      t: 'channel_keys',
      d: { channelId: channel.id, current: next, wanted: false },
    }, READ);
    return next;
  }
  const [now] = await db.select({ keyEpoch: channels.keyEpoch }).from(channels).where(eq(channels.id, channel.id)).limit(1);
  return now?.keyEpoch ?? next;
}

/**
 * Whether an identity key signed these bytes. As with devices, this keeps
 * nonsense out of the table; the members check it again for themselves.
 */
export async function identitySigned(identityKey: string, signature: Uint8Array, bytes: Uint8Array): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey(
      'spki',
      Buffer.from(identityKey, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, bytes);
  } catch {
    return false;
  }
}
