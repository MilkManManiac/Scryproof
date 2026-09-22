/**
 * Unclaimed uploads.
 *
 * A file is written to storage as soon as it is chosen, before the message
 * that carries it exists (see the comment on `attachments.messageId` in
 * `db/schema.ts`). Most of the time the message follows a few seconds later
 * and the row gets claimed. If the person closes the tab first, the row sits
 * with a null `messageId` forever and the bytes sit in storage with it —
 * nothing else ever looks at them again. This sweep is the cleanup for that
 * abandoned half of the upload.
 *
 * A day is a generous grace period: nobody drafts a message with an attached
 * file for 24 hours, but it is long enough that a slow connection or a
 * person who tabbed away and came back never loses a file mid-draft.
 */

import { and, eq, isNull, lt } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { attachments } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { deleteObject } from './storage.js';

const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
// Not zero: give the process a moment to finish coming up before it starts
// doing background work, but there is no reason to make someone wait an hour
// for the first pass after a restart.
const INITIAL_DELAY_MS = 60 * 1000;

/**
 * Delete every attachment row that is still unclaimed and older than the
 * grace period, along with the object it points at. Returns how many were
 * removed, which is also what makes this easy to unit test without touching
 * a clock.
 */
export async function sweepUnclaimedUploads(now = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - UNCLAIMED_TTL_MS);

  const stale = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(isNull(attachments.messageId), lt(attachments.createdAt, cutoff)));

  for (const row of stale) {
    // deleteObject already tolerates a missing object; if someone beat us to
    // it, or the box was rebuilt between upload and sweep, that is fine.
    await deleteObject(row.storageKey);
    await db.delete(attachments).where(eq(attachments.id, row.id));
  }

  if (stale.length > 0) {
    logger.info({ removed: stale.length }, 'swept unclaimed uploads');
  }

  return stale.length;
}

/** Start the recurring sweep. Returns a function that stops it cleanly. */
export function startUploadSweep(): () => void {
  const runAndLog = (): void => {
    void sweepUnclaimedUploads().catch((error: unknown) => {
      logger.error({ error }, 'upload sweep failed');
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
