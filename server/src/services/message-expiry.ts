/**
 * Channels whose messages do not last. GAMEPLAN 1b finding 4.
 *
 * A channel with `expireAfterSeconds` above zero keeps a message only that
 * long. Past it the row is deleted outright, not tombstoned like a message
 * someone deletes by hand: "messages here last 30 days" has to mean nothing
 * is left, not an empty row that still says who wrote when. Attachments go
 * with it, row and bytes; reactions, bookmarks and poll votes follow by
 * cascade. A reply to an expired message just loses its preview.
 *
 * Pinned messages expire too. An exception would make the promise false for
 * exactly the messages someone cared enough to pin.
 *
 * What this cannot reach: the nightly backups. They hold a message for as
 * long as they are kept (a week on the box, a month on Wes's PC), and the
 * channel settings say so.
 */

import { and, eq, gt, inArray, lt } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { attachments, channels, messages } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { logger } from '../lib/logger.js';
import { deleteObject } from './storage.js';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const INITIAL_DELAY_MS = 60 * 1000;
/** Rows per delete. Keeps one busy channel from holding a long lock. */
const BATCH = 500;

/**
 * Delete every message older than its channel allows, with its files.
 * Returns how many went, which is what the tests check.
 */
export async function expireMessages(now = new Date()): Promise<number> {
  const db = getDb();
  const expiring = await db
    .select({ id: channels.id, serverId: channels.serverId, seconds: channels.expireAfterSeconds })
    .from(channels)
    .where(gt(channels.expireAfterSeconds, 0));

  let total = 0;
  for (const channel of expiring) {
    const cutoff = new Date(now.getTime() - channel.seconds * 1000);
    for (;;) {
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.channelId, channel.id), lt(messages.createdAt, cutoff)))
        .limit(BATCH);
      if (rows.length === 0) break;
      const ids = rows.map((row) => row.id);

      // Bytes first: if the process dies between the two, a row whose file
      // is already gone is harmless, while a file with no row is never found.
      const files = await db
        .select({ storageKey: attachments.storageKey })
        .from(attachments)
        .where(inArray(attachments.messageId, ids));
      for (const file of files) await deleteObject(file.storageKey);

      await db.delete(messages).where(inArray(messages.id, ids));
      total += ids.length;

      // The newest message expires last, so if it went, they all did. Left
      // pointing at it, the sidebar would show an unread channel with
      // nothing in it that anyone could ever mark read.
      await db
        .update(channels)
        .set({ lastMessageId: null })
        .where(and(eq(channels.id, channel.id), inArray(channels.lastMessageId, ids)));

      await hub.broadcastToChannel(channel.serverId, channel.id, {
        t: 'messages_expire',
        d: { channelId: channel.id, ids },
      });

      if (rows.length < BATCH) break;
    }
  }

  if (total > 0) logger.info({ messages: total }, 'expired messages');
  return total;
}

/** Start the recurring sweep. Returns a function that stops it cleanly. */
export function startMessageExpiry(): () => void {
  const runAndLog = (): void => {
    void expireMessages().catch((error: unknown) => {
      logger.error({ error }, 'message expiry failed');
    });
  };

  const initial = setTimeout(runAndLog, INITIAL_DELAY_MS);
  initial.unref();

  const interval = setInterval(runAndLog, SWEEP_INTERVAL_MS);
  interval.unref();

  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
