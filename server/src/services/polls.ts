/**
 * Poll votes.
 *
 * Voting replaces the caller's own votes rather than adding to them, so a
 * click always means "this is my pick now," not "add one more."
 *
 * What a tally gives away depends on the poll, and is decided here, on the
 * server, so a client can never be sent more than its poll allows:
 *
 * - 'shown' (a new `/poll`): counts, and who picked each option.
 * - 'secret' (`/poll~`): nothing about anyone else until the poll closes,
 *   then counts only. Never who picked what. While it is open the counts go
 *   out as zeros, not null: an app that has not taken its update yet reads
 *   them as numbers, and a null there would take its whole screen down.
 * - 'anonymous' (any poll stored without a `visibility`, which is every poll
 *   made before voters were shown): counts only, for good. People voted on
 *   the promise that nobody would see their pick, and that does not change
 *   under them.
 *
 * The viewer's own picks always come back in `mine`, whatever the poll, so
 * they can see what they chose. See `gateway.ts`'s `poll_update` for why that
 * means a vote cannot be broadcast as a plain `message_update`.
 */

import { and, eq, inArray } from 'drizzle-orm';

import type { PollVisibility } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { pollVotes, type PollBody } from '../db/schema.js';

export interface PollTally {
  visibility: PollVisibility;
  /** All zeros while a secret poll is open: there is nothing the viewer may count yet. */
  counts: number[];
  /** Only on a 'shown' poll: user ids per option, in option order. */
  voters?: string[][];
  mine: number[];
}

/** A stored poll's visibility, with a missing one read as the old promise. */
export function visibilityOf(poll: Pick<PollBody, 'visibility'>): PollVisibility {
  return poll.visibility ?? 'anonymous';
}

/**
 * Tallies for several polls at once, the way `reactionsForMessages` does for
 * reactions. Each poll's body comes from the caller because it lives on the
 * message row already loaded, not from a second query here.
 */
export async function tallyForMessages(
  polls: readonly { messageId: string; poll: PollBody }[],
  /** Whose picks go in `mine`. A hydrate with nobody to ask for leaves it empty. */
  viewerId: string | undefined,
): Promise<Map<string, PollTally>> {
  const result = new Map<string, PollTally>();
  if (polls.length === 0) return result;

  const counted = new Map<string, { counts: number[]; voters: string[][]; mine: number[] }>();
  for (const { messageId, poll } of polls) {
    counted.set(messageId, {
      counts: poll.options.map(() => 0),
      voters: poll.options.map(() => []),
      mine: [],
    });
  }

  const rows = await getDb()
    .select()
    .from(pollVotes)
    .where(inArray(pollVotes.messageId, polls.map((entry) => entry.messageId)));

  for (const row of rows) {
    const tally = counted.get(row.messageId);
    if (!tally || row.option < 0 || row.option >= tally.counts.length) continue;
    tally.counts[row.option] = (tally.counts[row.option] ?? 0) + 1;
    tally.voters[row.option]?.push(row.userId);
    if (row.userId === viewerId) tally.mine.push(row.option);
  }

  // Everything was counted above; this is where it is cut down to what the
  // poll lets anyone see.
  for (const { messageId, poll } of polls) {
    const tally = counted.get(messageId);
    if (!tally) continue;
    const visibility = visibilityOf(poll);
    if (visibility === 'shown') {
      result.set(messageId, { visibility, counts: tally.counts, voters: tally.voters, mine: tally.mine });
    } else if (visibility === 'secret' && !poll.closedAt) {
      result.set(messageId, { visibility, counts: tally.counts.map(() => 0), mine: tally.mine });
    } else {
      result.set(messageId, { visibility, counts: tally.counts, mine: tally.mine });
    }
  }

  return result;
}

/** Replaces the caller's votes on this poll. An empty list clears them. */
export async function setVotes(messageId: string, userId: string, options: readonly number[]): Promise<void> {
  const db = getDb();
  await db.delete(pollVotes).where(and(eq(pollVotes.messageId, messageId), eq(pollVotes.userId, userId)));
  if (options.length === 0) return;
  await db.insert(pollVotes).values(options.map((option) => ({ messageId, userId, option })));
}
