/**
 * Reactions.
 *
 * Adding and removing are both idempotent: the primary key is (message, person,
 * emoji), so a double click or a retried request changes nothing the second
 * time. Every change answers with the message's full set, which is what gets
 * broadcast, so a client that missed an event is corrected by the next one.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { REACTIONS_PER_MESSAGE, REACTION_MAX_LENGTH } from '@gooffline/shared';
import type { Reaction } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { reactions } from '../db/schema.js';
import type { ReactionRow } from '../db/schema.js';
import { badRequest } from '../lib/http-error.js';

/** A length and shape guard. It does not try to decide what counts as an emoji. */
export function isValidEmoji(emoji: string): boolean {
  return emoji.length > 0 && emoji.length <= REACTION_MAX_LENGTH && !/\s/.test(emoji);
}

/** Rows in the order they were made, folded into one entry per emoji. */
export function groupReactions(rows: readonly Pick<ReactionRow, 'emoji' | 'userId'>[]): Reaction[] {
  const byEmoji = new Map<string, Reaction>();
  for (const row of rows) {
    const entry = byEmoji.get(row.emoji) ?? { emoji: row.emoji, userIds: [] };
    entry.userIds.push(row.userId);
    byEmoji.set(row.emoji, entry);
  }
  // A Map keeps insertion order, so emoji come out ordered by first reaction.
  return [...byEmoji.values()];
}

export async function reactionsForMessages(messageIds: readonly string[]): Promise<Map<string, Reaction[]>> {
  const result = new Map<string, Reaction[]>();
  if (messageIds.length === 0) return result;

  const rows = await getDb()
    .select()
    .from(reactions)
    .where(inArray(reactions.messageId, [...messageIds]))
    .orderBy(asc(reactions.createdAt), asc(reactions.userId));

  const byMessage = new Map<string, ReactionRow[]>();
  for (const row of rows) {
    const list = byMessage.get(row.messageId) ?? [];
    list.push(row);
    byMessage.set(row.messageId, list);
  }
  for (const [messageId, list] of byMessage) result.set(messageId, groupReactions(list));
  return result;
}

export async function reactionsFor(messageId: string): Promise<Reaction[]> {
  return (await reactionsForMessages([messageId])).get(messageId) ?? [];
}

export async function addReaction(messageId: string, userId: string, emoji: string): Promise<Reaction[]> {
  if (!isValidEmoji(emoji)) throw badRequest('That is not a reaction.', 'invalid_reaction');

  const existing = await reactionsFor(messageId);
  const isNewEmoji = !existing.some((reaction) => reaction.emoji === emoji);
  if (isNewEmoji && existing.length >= REACTIONS_PER_MESSAGE) {
    throw badRequest('This message has as many different reactions as it can hold.', 'too_many_reactions');
  }

  await getDb().insert(reactions).values({ messageId, userId, emoji }).onConflictDoNothing();
  return reactionsFor(messageId);
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<Reaction[]> {
  await getDb()
    .delete(reactions)
    .where(and(eq(reactions.messageId, messageId), eq(reactions.userId, userId), eq(reactions.emoji, emoji)));
  return reactionsFor(messageId);
}
