/**
 * Who may be in the call inside a direct message conversation.
 *
 * A server call is gated by CONNECT, SPEAK, VIDEO and SHARE_SCREEN. A
 * conversation has no roles, so the gate is membership: everyone in
 * `dm_members` may join its call and do all three. Nothing here looks at the
 * pair key, so a group conversation's call works the same way as soon as
 * groups exist.
 *
 * The refusals are the ones writing in the conversation already has, for the
 * same reasons: a call is a way of reaching someone, and a person who may not
 * write to you may not ring through either. Both the token route and the
 * gateway ask this, so neither can be reached around the other.
 */

import { eq } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { dmMembers } from '../db/schema.js';
import { forbidden, notFound } from '../lib/http-error.js';
import { blockBetween } from './blocks.js';
import { sharesAServer } from './servers.js';

/** Everyone in a conversation. Empty for a conversation that does not exist. */
export async function dmMemberIds(dmId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: dmMembers.userId })
    .from(dmMembers)
    .where(eq(dmMembers.dmId, dmId));
  return rows.map((row) => row.userId);
}

/** Every conversation a person is in, for the ready frame. */
export async function dmIdsFor(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ dmId: dmMembers.dmId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId));
  return rows.map((row) => row.dmId);
}

/**
 * The people in the conversation, or an HttpError saying why this person may
 * not be in its call. A stranger asking about a real conversation and about a
 * made-up one get the same 404, as they do for its messages.
 */
export async function requireDmCallAllowed(dmId: string, userId: string): Promise<string[]> {
  const memberIds = await dmMemberIds(dmId);
  if (!memberIds.includes(userId)) {
    throw notFound('That conversation does not exist.', 'unknown_dm');
  }

  for (const memberId of memberIds) {
    if (memberId === userId) continue;
    // Worded as the message refusals in routes/dms.ts are: the blocker is
    // reminded of what they did, the person blocked is told only that they
    // cannot call here, and nothing says who blocked whom.
    const { mine, theirs } = await blockBetween(userId, memberId);
    if (mine) throw forbidden('You have blocked this person.');
    if (theirs) throw forbidden('This person is not accepting calls from you.');
    if (!(await sharesAServer(userId, memberId))) {
      throw forbidden('You no longer share a server with this person.');
    }
  }

  return memberIds;
}
