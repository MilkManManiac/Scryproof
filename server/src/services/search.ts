/**
 * Message search within a server.
 *
 * The whole point of this module: a search result must never come from a
 * channel the caller could not otherwise open. `computePermissionsForServerChannels`
 * decides the allowed channel ids before any query touches `messages`, so a
 * channel without VIEW_CHANNEL and READ_MESSAGE_HISTORY never has a chance to
 * be searched, let alone returned. Route handlers should not query `messages`
 * for a search directly; go through here so that check cannot be skipped.
 *
 * DMs are end-to-end encrypted and the server cannot read their content, so
 * this never touches them: there would be nothing here for it to search.
 */

import { and, desc, ilike, inArray, isNull, lt } from 'drizzle-orm';

import { Permission, has } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { messages } from '../db/schema.js';
import type { MessageRow } from '../db/schema.js';
import { computePermissionsForServerChannels, type MemberContext } from './permissions.js';

const PAGE_SIZE = 25;

/** The permissions a channel needs before its messages are searchable at all. */
const SEARCHABLE = Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY;

/** Escape ILIKE's wildcard characters so a word is matched literally, not as a pattern. */
function likeTerm(word: string): string {
  return `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** The channels in this server the member is allowed to search. */
export async function searchableChannelIds(ctx: MemberContext): Promise<string[]> {
  const permissions = await computePermissionsForServerChannels(ctx);
  return [...permissions.entries()]
    .filter(([, mask]) => has(mask, SEARCHABLE))
    .map(([channelId]) => channelId);
}

/**
 * Rows matching every word in `q`, case-insensitive, newest first, restricted
 * to channels the member can view and read history in. Deleted messages are
 * excluded, since their body is already gone.
 */
export async function searchMessages(
  ctx: MemberContext,
  q: string,
  before?: string,
): Promise<MessageRow[]> {
  const channelIds = await searchableChannelIds(ctx);
  if (channelIds.length === 0) return [];

  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const conditions = [
    inArray(messages.channelId, channelIds),
    isNull(messages.deletedAt),
    ...words.map((word) => ilike(messages.content, likeTerm(word))),
  ];
  if (before) conditions.push(lt(messages.id, before));

  return getDb()
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.id))
    .limit(PAGE_SIZE);
}
