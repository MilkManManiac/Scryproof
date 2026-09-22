/**
 * Who has blocked whom.
 *
 * Blocking is one-directional and private. The person blocked is never told
 * and never gets a different answer out of the server than they did before,
 * except for one thing they cannot avoid noticing: a direct message to the
 * person who blocked them is refused. Everything else is subtraction on the
 * blocker's side — their messages collapse, their reactions do not count, and
 * their mentions do not ping.
 *
 * It lives in its own service because three unrelated paths ask about it: the
 * routes that keep the list, the ping rules in `mentions.ts` and `read-state.ts`,
 * and the direct message refusals in `routes/dms.ts`.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { blocks } from '../db/schema.js';

/** The people this person has blocked. Their own list, and nobody else's business. */
export async function blockedBy(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ blockedId: blocks.blockedId })
    .from(blocks)
    .where(eq(blocks.userId, userId));
  return rows.map((row) => row.blockedId);
}

/** The people who have blocked this person: who a message from them must not reach. */
export async function blockersOf(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ userId: blocks.userId })
    .from(blocks)
    .where(eq(blocks.blockedId, userId));
  return new Set(rows.map((row) => row.userId));
}

/**
 * Whether either of two people has blocked the other, and which way round.
 * The two directions mean different things to say out loud, so they are not
 * collapsed into one boolean here.
 */
export async function blockBetween(
  userId: string,
  otherId: string,
): Promise<{ mine: boolean; theirs: boolean }> {
  const pair = [userId, otherId];
  const rows = await getDb()
    .select({ userId: blocks.userId, blockedId: blocks.blockedId })
    .from(blocks)
    .where(and(inArray(blocks.userId, pair), inArray(blocks.blockedId, pair)));
  return {
    mine: rows.some((row) => row.userId === userId && row.blockedId === otherId),
    theirs: rows.some((row) => row.userId === otherId && row.blockedId === userId),
  };
}

/**
 * The candidates who have not blocked the sender. Pure, so the rule that
 * decides who hears about a message can be tested without a database.
 */
export function withoutBlockers(
  candidates: readonly string[],
  blockers: ReadonlySet<string>,
): string[] {
  return candidates.filter((userId) => !blockers.has(userId));
}
