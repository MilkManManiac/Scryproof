/**
 * Poll votes.
 *
 * Voting replaces the caller's own votes rather than adding to them, so a
 * click always means "this is my pick now," not "add one more." A tally
 * never says who picked what, only how many, plus the viewer's own picks:
 * that is why this is a separate, smaller answer than reactions give, not the
 * same shape reused. See `gateway.ts`'s `poll_update` for why that also means
 * a vote cannot be broadcast as a plain `message_update`.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { pollVotes } from '../db/schema.js';

export interface PollTally {
  counts: number[];
  mine: number[];
}

function emptyTally(optionCount: number): PollTally {
  return { counts: new Array(optionCount).fill(0), mine: [] };
}

/**
 * Tallies for several polls at once, the way `reactionsForMessages` does for
 * reactions. `optionCount` per message comes from the caller because it lives
 * on the message row already loaded, not from a second query here.
 */
export async function tallyForMessages(
  polls: readonly { messageId: string; optionCount: number }[],
  viewerId: string,
): Promise<Map<string, PollTally>> {
  const result = new Map<string, PollTally>();
  if (polls.length === 0) return result;

  const optionCounts = new Map(polls.map((entry) => [entry.messageId, entry.optionCount]));
  for (const entry of polls) result.set(entry.messageId, emptyTally(entry.optionCount));

  const rows = await getDb()
    .select()
    .from(pollVotes)
    .where(inArray(pollVotes.messageId, polls.map((entry) => entry.messageId)));

  for (const row of rows) {
    const tally = result.get(row.messageId);
    const optionCount = optionCounts.get(row.messageId) ?? 0;
    if (!tally || row.option < 0 || row.option >= optionCount) continue;
    tally.counts[row.option] = (tally.counts[row.option] ?? 0) + 1;
    if (row.userId === viewerId) tally.mine.push(row.option);
  }

  return result;
}

export async function tallyFor(messageId: string, optionCount: number, viewerId: string): Promise<PollTally> {
  return (await tallyForMessages([{ messageId, optionCount }], viewerId)).get(messageId) ?? emptyTally(optionCount);
}

/** Replaces the caller's votes on this poll. An empty list clears them. */
export async function setVotes(messageId: string, userId: string, options: readonly number[]): Promise<void> {
  const db = getDb();
  await db.delete(pollVotes).where(and(eq(pollVotes.messageId, messageId), eq(pollVotes.userId, userId)));
  if (options.length === 0) return;
  await db.insert(pollVotes).values(options.map((option) => ({ messageId, userId, option })));
}
