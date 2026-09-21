/**
 * How far each person has read, and how many times they have been pinged since.
 *
 * Two rules live here. Reading never goes backwards: ids sort by time, and a
 * slow request from a second device must not un-read what the first device
 * already saw. And a ping creates the row if it has to, with nothing read yet,
 * so someone mentioned in a channel they have never opened still gets a badge.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ReadState } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { readStates } from '../db/schema.js';

/** `mention_count` is a smallint. Past this the badge says "a lot" either way. */
export const MENTION_COUNT_MAX = 32_767;

function toReadState(row: {
  channelId: string;
  lastReadMessageId: string | null;
  mentionCount: number;
}): ReadState {
  return {
    channelId: row.channelId,
    lastReadMessageId: row.lastReadMessageId,
    mentionCount: row.mentionCount,
  };
}

export async function readStatesFor(userId: string): Promise<ReadState[]> {
  const rows = await getDb().select().from(readStates).where(eq(readStates.userId, userId));
  return rows.map(toReadState);
}

/** Mark read up to a message. Returns the state as it now stands, which may be further on than asked. */
export async function markRead(
  userId: string,
  channelId: string,
  messageId: string,
): Promise<ReadState> {
  const [row] = await getDb()
    .insert(readStates)
    .values({ userId, channelId, lastReadMessageId: messageId, mentionCount: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [readStates.userId, readStates.channelId],
      set: {
        lastReadMessageId: sql`case
          when ${readStates.lastReadMessageId} is null or ${readStates.lastReadMessageId} < excluded.last_read_message_id
          then excluded.last_read_message_id
          else ${readStates.lastReadMessageId}
        end`,
        // Catching up with an older device still means the person has looked.
        mentionCount: 0,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error('read state upsert returned nothing');
  return toReadState(row);
}

/** One more ping for each of these people in this channel. Returns their new states. */
export async function bumpMentions(userIds: readonly string[], channelId: string): Promise<Map<string, ReadState>> {
  const result = new Map<string, ReadState>();
  if (userIds.length === 0) return result;

  const db = getDb();
  await db
    .insert(readStates)
    .values(
      userIds.map((userId) => ({
        userId,
        channelId,
        lastReadMessageId: null,
        mentionCount: 1,
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [readStates.userId, readStates.channelId],
      set: {
        mentionCount: sql`least(${readStates.mentionCount} + 1, ${MENTION_COUNT_MAX})`,
        updatedAt: new Date(),
      },
    });

  const rows = await db
    .select()
    .from(readStates)
    .where(and(eq(readStates.channelId, channelId), inArray(readStates.userId, [...userIds])));
  for (const row of rows) result.set(row.userId, toReadState(row));
  return result;
}
