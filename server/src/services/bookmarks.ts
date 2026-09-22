/**
 * Bookmarks: a message saved for later, by one person, for themselves.
 *
 * Nothing here broadcasts anything. A bookmark changes on one device by one
 * person's click, and only that person's own next fetch of the Saved list
 * needs to see it, so there is no gateway event and no cache to invalidate
 * anywhere else.
 *
 * Listing them back out is the part worth being careful with: a bookmark
 * outlives the saver's access to wherever the message lives, so the list has
 * to re-check, for every message, that the channel it is in is still one this
 * person can view and read history in. A channel they lost access to is left
 * off the list quietly rather than turned into an error.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { Permission, has } from '@scryproof/shared';
import type { BookmarkedMessage } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { bookmarks, channels, messages } from '../db/schema.js';
import type { ChannelRow, MessageRow } from '../db/schema.js';
import { computePermissionsForServerChannels, loadMemberContext } from './permissions.js';
import { hydrate } from '../routes/messages.js';

const VIEWABLE = Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY;

/** Which of these messages this person has saved, for stamping `bookmarked` onto them. */
export async function isBookmarked(userId: string, messageIds: readonly string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await getDb()
    .select({ messageId: bookmarks.messageId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.messageId, [...messageIds])));
  return new Set(rows.map((row) => row.messageId));
}

/**
 * Every message this person has saved that they can still see, newest bookmark
 * first, with the server and channel it lives in so a list of them can say
 * where each one is.
 */
export async function bookmarksFor(userId: string): Promise<BookmarkedMessage[]> {
  const db = getDb();

  const saved = await db
    .select({ messageId: bookmarks.messageId })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt));
  if (saved.length === 0) return [];

  const messageIds = saved.map((row) => row.messageId);
  const messageRows = await db.select().from(messages).where(inArray(messages.id, messageIds));
  if (messageRows.length === 0) return [];

  const messageById = new Map(messageRows.map((row) => [row.id, row]));
  const channelIds = [...new Set(messageRows.map((row) => row.channelId))];
  const channelRows = await db.select().from(channels).where(inArray(channels.id, channelIds));
  const channelById = new Map<string, ChannelRow>(channelRows.map((row) => [row.id, row]));

  const serverIds = [...new Set(channelRows.map((row) => row.serverId))];
  const allowedChannelIds = new Set<string>();
  for (const serverId of serverIds) {
    const ctx = await loadMemberContext(serverId, userId);
    if (!ctx) continue; // No longer a member of this server: nothing in it is listed.
    const mask = await computePermissionsForServerChannels(ctx);
    for (const [channelId, channelMask] of mask) {
      if (has(channelMask, VIEWABLE)) allowedChannelIds.add(channelId);
    }
  }

  // Keep bookmark order (newest saved first), not message order.
  const visible = saved
    .map((row) => messageById.get(row.messageId))
    .filter((row): row is MessageRow => row !== undefined && allowedChannelIds.has(row.channelId));

  const hydrated = await hydrate(visible);
  const hydratedById = new Map(hydrated.map((message) => [message.id, message]));

  return visible
    .map((row): BookmarkedMessage | null => {
      const message = hydratedById.get(row.id);
      const channel = channelById.get(row.channelId);
      if (!message || !channel) return null;
      return { ...message, bookmarked: true, serverId: channel.serverId, channelName: channel.name };
    })
    .filter((entry): entry is BookmarkedMessage => entry !== null);
}
