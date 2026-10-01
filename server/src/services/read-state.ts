/**
 * How far each person has read, and how many times they have been pinged since.
 *
 * Two rules live here. Reading never goes backwards: ids sort by time, and a
 * slow request from a second device must not un-read what the first device
 * already saw. And a ping creates the row if it has to, with nothing read yet,
 * so someone mentioned in a channel they have never opened still gets a badge.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import { UNREAD_COUNT_CAP } from '@scryproof/shared';
import type { ReadState } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { blocks, messages, readStates } from '../db/schema.js';
import { blockersOf, withoutBlockers } from './blocks.js';

/** `mention_count` is a smallint. Past this the badge says "a lot" either way. */
export const MENTION_COUNT_MAX = 32_767;

function toReadState(row: {
  channelId: string;
  lastReadMessageId: string | null;
  mentionCount: number;
  unreadCount?: number | null;
}): ReadState {
  const state: ReadState = {
    channelId: row.channelId,
    lastReadMessageId: row.lastReadMessageId,
    mentionCount: row.mentionCount,
  };
  if (row.lastReadMessageId && typeof row.unreadCount === 'number') state.unreadCount = row.unreadCount;
  return state;
}

/**
 * How many messages from other people sit after the last one read, counted in
 * the database and stopped at the cap, so a channel that ran away overnight
 * costs a hundred index steps and no more (`messages_channel_id_idx` is on
 * channel then id). People this person has blocked are not counted: they
 * reach nothing, a number included. Nor is a message since deleted.
 */
function unreadCountOf(userId: string) {
  // Written out in full: drizzle prints a column of the only table in a query
  // without its table name, and inside this subquery a bare "channel_id"
  // would mean the message's own, counting the whole channel.
  return sql<number>`(
    select count(*)::int from (
      select 1 from ${messages} as m
      where m.channel_id = "read_states"."channel_id"
        and m.id > "read_states"."last_read_message_id"
        and m.author_id <> ${userId}
        and m.deleted_at is null
        and not exists (select 1 from ${blocks} as b where b.user_id = ${userId} and b.blocked_id = m.author_id)
      limit ${UNREAD_COUNT_CAP}
    ) as unread
  )`;
}

function withCount(userId: string) {
  return {
    channelId: readStates.channelId,
    lastReadMessageId: readStates.lastReadMessageId,
    mentionCount: readStates.mentionCount,
    unreadCount: unreadCountOf(userId),
  };
}

/**
 * Only for channels this person can see right now. A row outlives the access
 * that made it (a role taken away, a kick), and its count is worked out fresh
 * each time, so handing it back would tell them how busy a channel they were
 * shut out of still is.
 */
export async function readStatesFor(userId: string, visibleChannelIds: ReadonlySet<string>): Promise<ReadState[]> {
  if (visibleChannelIds.size === 0) return [];
  const rows = await getDb()
    .select(withCount(userId))
    .from(readStates)
    .where(and(eq(readStates.userId, userId), inArray(readStates.channelId, [...visibleChannelIds])));
  return rows.map(toReadState);
}

/** One channel's state with its count, after something changed it. */
async function readStateOf(userId: string, channelId: string): Promise<ReadState | null> {
  const [row] = await getDb()
    .select(withCount(userId))
    .from(readStates)
    .where(and(eq(readStates.userId, userId), eq(readStates.channelId, channelId)));
  return row ? toReadState(row) : null;
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
  // Read up to a message is not always read to the end: a second device can
  // be behind. The count says what is still below the line.
  return (await readStateOf(userId, channelId)) ?? toReadState(row);
}

/**
 * One more ping for each of these people in this channel. Returns their new
 * states.
 *
 * The block rule is applied here as well as in `pingTargets`, and on purpose:
 * a badge is written to the database and outlives the request that made it, so
 * this is the gate that must not be the one somebody forgets to go through.
 */
export async function bumpMentions(
  callers: readonly string[],
  channelId: string,
  senderId: string,
): Promise<Map<string, ReadState>> {
  const result = new Map<string, ReadState>();
  if (callers.length === 0) return result;
  const userIds = withoutBlockers(callers, await blockersOf(senderId));
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
