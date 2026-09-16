/**
 * Uploads and downloads.
 *
 * Attachments are served by this process rather than straight from the object
 * store, so every download is permission-checked. A link copied out of a
 * private channel is useless to someone who cannot read that channel, which is
 * not true of a presigned object-store URL.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission } from '@gooffline/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { attachments, messages } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
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

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Upload happens before the message is sent. The file is parked with no
   * message id and claimed when the message is created, which is what lets the
   * composer show a preview before you press enter.
   */
  app.post('/api/channels/:channelId/attachments', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    await requireChannelPermission(
      channelId,
      user.id,
      Permission.SEND_MESSAGES | Permission.ATTACH_FILES,
    );

    const file = await request.file();
    if (!file) throw badRequest('No file was uploaded.', 'no_file');

    const filename = file.filename.slice(0, 200) || 'file';
    // Never trust a client-declared content type for anything but display.
    const contentType = INLINE_TYPES.has(file.mimetype)
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
