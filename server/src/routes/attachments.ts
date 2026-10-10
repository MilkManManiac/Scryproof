/**
 * Uploads and downloads.
 *
 * Attachments are served by this process rather than straight from the object
 * store, so every download is permission-checked. A link copied out of a
 * private channel is useless to someone who cannot read that channel, which is
 * not true of a presigned object-store URL.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, sum } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { attachments, channels, messages } from '../db/schema.js';
import { HttpError, badRequest, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { uuidv7 } from '../lib/ids.js';
import * as serialize from '../services/serialize.js';
import { requireChannelPermission } from '../services/permissions.js';
import {
  buildStorageKey,
  deleteObject,
  publicUrlFor,
  readFromS3,
  readStream,
  saveStream,
} from '../services/storage.js';

/**
 * Types we are willing to render inline. Everything else downloads as an
 * attachment, because inline rendering of arbitrary types is how a file upload
 * becomes a cross-site scripting hole.
 */
const INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'text/plain',
  'application/pdf',
]);

/** Uploads a person may start in a minute, channel files and avatars together. */
export const UPLOADS_PER_MINUTE = 10;
/** Bytes one person may have parked and not yet sent. The sweep clears them after a day. */
export const PENDING_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Refuse before the body is read, so a flood costs nothing but the request line. */
export async function guardUpload(userId: string): Promise<void> {
  const limit = consume(`uploads:${userId}`, UPLOADS_PER_MINUTE, 60_000);
  if (!limit.allowed) throw tooManyRequests('You are uploading too quickly.', limit.retryAfterSeconds);
  const [row] = await getDb()
    .select({ bytes: sum(attachments.size) })
    .from(attachments)
    .where(and(eq(attachments.uploaderId, userId), isNull(attachments.messageId)));
  if (Number(row?.bytes ?? 0) >= PENDING_UPLOAD_BYTES) {
    throw new HttpError(413, 'too_much_pending', 'Send or discard the files you have already uploaded first.');
  }
}

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Upload happens before the message is sent. The file is parked with no
   * message id and claimed when the message is created, which is what lets the
   * composer show a preview before you press enter.
   */
  app.post('/api/channels/:channelId/attachments', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const { sealed } = z.object({ sealed: z.literal('1').optional() }).parse(request.query);

    await requireChannelPermission(
      channelId,
      user.id,
      Permission.SEND_MESSAGES | Permission.ATTACH_FILES,
    );

    // An encrypted channel takes only bytes locked in the browser, and a plain
    // one only files it can show. Checked again when the message claims them.
    const [channel] = await getDb()
      .select({ encrypted: channels.encrypted })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
    if (channel.encrypted && !sealed) {
      throw badRequest('This channel is encrypted now. Reload the app to send files here.', 'encryption_required');
    }
    if (!channel.encrypted && sealed) {
      throw badRequest('A locked file can only be sent in an encrypted channel.', 'encryption_not_enabled');
    }

    await guardUpload(user.id);

    const file = await request.file();
    if (!file) throw badRequest('No file was uploaded.', 'no_file');

    // A locked file is told nothing about itself: its name and type are inside
    // the message, where only the people in the channel can read them.
    const filename = sealed ? 'sealed.bin' : file.filename.slice(0, 200) || 'file';
    // Never trust a client-declared content type for anything but display.
    const contentType = !sealed && INLINE_TYPES.has(file.mimetype)
      ? file.mimetype
      : 'application/octet-stream';

    const storageKey = buildStorageKey(filename);
    const stored = await saveStream(storageKey, file.file);

    // @fastify/multipart flags a stream that hit the size limit rather than
    // throwing, so the file must be removed after the fact.
    if (file.file.truncated) {
      await deleteObject(storageKey);
      throw badRequest(
        `Files are limited to ${Math.floor(LIMITS.attachmentBytes / (1024 * 1024))} MB.`,
        'file_too_large',
      );
    }

    const [created] = await getDb()
      .insert(attachments)
      .values({
        id: uuidv7(),
        messageId: null,
        uploaderId: user.id,
        storageKey,
        filename,
        contentType,
        size: stored.size,
        sealed: Boolean(sealed),
      })
      .returning();

    if (!created) throw badRequest('Could not save the file.', 'upload_failed');

    return { attachment: serialize.attachment(created, publicUrlFor(created.id, created.filename)) };
  });

  app.get('/api/attachments/:attachmentId/:filename', async (request, reply) => {
    const user = requireUser(request);
    const { attachmentId } = z
      .object({ attachmentId: z.string(), filename: z.string() })
      .parse(request.params);

    const db = getDb();
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);
    if (!row) throw notFound('That file does not exist.', 'unknown_attachment');

    if (row.messageId === null) {
      // Not attached to anything yet: only the uploader may see it.
      if (row.uploaderId !== user.id) {
        throw notFound('That file does not exist.', 'unknown_attachment');
      }
    } else {
      const [message] = await db
        .select({ channelId: messages.channelId, deletedAt: messages.deletedAt })
        .from(messages)
        .where(eq(messages.id, row.messageId))
        .limit(1);
      if (!message || message.deletedAt) {
        throw notFound('That file does not exist.', 'unknown_attachment');
      }

      // The permission check that makes a leaked link worthless.
      await requireChannelPermission(
        message.channelId,
        user.id,
        Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
      );
    }

    void reply.header('Content-Type', row.contentType);
    void reply.header('Content-Length', String(row.size));
    void reply.header(
      'Content-Disposition',
      `${INLINE_TYPES.has(row.contentType) ? 'inline' : 'attachment'}; filename="${encodeURIComponent(row.filename)}"`,
    );
    // Private: a shared cache must never hold a file from a private channel.
    void reply.header('Cache-Control', 'private, max-age=86400');
    void reply.header('X-Content-Type-Options', 'nosniff');
    // Belt and braces against an uploaded file executing in our origin.
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");

    if (config.storage.driver === 's3') {
      return reply.send(await readFromS3(row.storageKey));
    }
    return reply.send(readStream(row.storageKey));
  });

  app.delete('/api/attachments/:attachmentId', async (request) => {
    const user = requireUser(request);
    const { attachmentId } = z.object({ attachmentId: z.string() }).parse(request.params);

    const db = getDb();
    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.uploaderId, user.id),
          // Once attached, a file is deleted by deleting its message.
          isNull(attachments.messageId),
        ),
      )
      .limit(1);

    if (!row) throw forbidden('You can only discard your own unsent uploads.');

    await deleteObject(row.storageKey);
    await db.delete(attachments).where(eq(attachments.id, attachmentId));

    return { ok: true };
  });
}
