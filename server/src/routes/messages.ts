/**
 * Messages.
 *
 * Reads are paginated by id. Because ids are UUIDv7 they sort chronologically,
 * so "the 50 messages before this one" is a plain indexed range scan with no
 * offset and no cursor table.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, has, validateMessageContent } from '@gooffline/shared';
import type { Attachment, Message } from '@gooffline/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { attachments, channels, messages, readStates, users } from '../db/schema.js';
import { badRequest, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import { consume } from '../lib/rate-limit.js';
import { config } from '../config.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import { publicUrlFor } from '../services/storage.js';
import { requireChannelPermission } from '../services/permissions.js';
import type { MessageRow, User } from '../db/schema.js';

/** Load authors and attachments for a page of messages in two queries, not 2N. */
async function hydrate(rows: MessageRow[]): Promise<Message[]> {
  if (rows.length === 0) return [];

  const db = getDb();

  const authorIds = [...new Set(rows.map((row) => row.authorId))];
  const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
  const authors = new Map<string, User>(authorRows.map((row) => [row.id, row]));

  const messageIds = rows.map((row) => row.id);
  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));

  const byMessage = new Map<string, Attachment[]>();
  for (const row of attachmentRows) {
    // messageId is nullable in the schema (an upload exists before its
    // message), but every row returned by the query above is attached.
    if (!row.messageId) continue;
    const list = byMessage.get(row.messageId) ?? [];
    list.push(serialize.attachment(row, publicUrlFor(row.id, row.filename)));
    byMessage.set(row.messageId, list);
  }

  return rows
    .map((row) => {
      const author = authors.get(row.authorId);
      if (!author) return null;
      return serialize.message(row, author, byMessage.get(row.id) ?? []);
    })
    .filter((message): message is Message => message !== null);
}

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/channels/:channelId/messages', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const query = z
      .object({
        before: z.string().optional(),
        after: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    await requireChannelPermission(
      channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    const db = getDb();
    const conditions = [eq(messages.channelId, channelId)];
    if (query.before) conditions.push(lt(messages.id, query.before));
    if (query.after) conditions.push(gt(messages.id, query.after));

    // `after` reads forward from a point; everything else reads backward from
    // the newest, which is what opening a channel does.
    const rows = query.after
      ? await db
          .select()
          .from(messages)
          .where(and(...conditions))
          .orderBy(asc(messages.id))
          .limit(query.limit)
      : (
          await db
            .select()
            .from(messages)
            .where(and(...conditions))
            .orderBy(desc(messages.id))
            .limit(query.limit)
        ).reverse();

    return { messages: await hydrate(rows) };
  });

  app.post('/api/channels/:channelId/messages', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z
      .object({
        content: z.string().max(LIMITS.message.max).optional(),
        ciphertext: z.string().max(64_000).optional(),
        nonce: z.string().max(256).optional(),
        keyEpoch: z.number().int().min(1).optional(),
        replyToId: z.string().optional(),
        attachmentIds: z.array(z.string()).max(LIMITS.attachmentsPerMessage).optional(),
      })
      .parse(request.body);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.SEND_MESSAGES);

    const limit = consume(
      `messages:${user.id}`,
      config.rateLimits.messagesPerMinute,
      60_000,
    );
    if (!limit.allowed) {
      throw tooManyRequests('You are sending messages too quickly.', limit.retryAfterSeconds);
    }

    const db = getDb();
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
    if (channel.type !== 'text') throw badRequest('That is not a text channel.', 'not_text_channel');

    // An encrypted channel must receive ciphertext and a plaintext channel
    // must receive text. Accepting either in both would let a client silently
    // downgrade a private channel to readable-by-the-server.
    if (channel.encrypted) {
      if (!body.ciphertext) {
        throw badRequest('This channel is end-to-end encrypted.', 'encryption_required');
      }
      if (body.content) {
        throw badRequest('Plaintext is not accepted in an encrypted channel.', 'encryption_required');
      }
    } else if (body.ciphertext) {
      throw badRequest('This channel is not encrypted.', 'encryption_not_enabled');
    }

    const content = body.content?.trim() ?? null;
    const attachmentIds = body.attachmentIds ?? [];

    if (!content && !body.ciphertext && attachmentIds.length === 0) {
      throw badRequest('A message needs text or a file.', 'empty_message');
    }

    if (content) {
      const check = validateMessageContent(content);
      if (!check.ok) throw badRequest(check.error, 'message_too_long');
    }

    if (attachmentIds.length > 0 && !has(ctx.channelPermissions, Permission.ATTACH_FILES)) {
      throw forbidden('You cannot attach files in this channel.');
    }

    // Slowmode applies to everyone who cannot manage the channel, which is the
    // behaviour people expect from moderation tools.
    if (
      channel.slowmodeSeconds > 0 &&
      !has(ctx.channelPermissions, Permission.MANAGE_MESSAGES)
    ) {
      const [latest] = await db
        .select({ id: messages.id, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.channelId, channelId), eq(messages.authorId, user.id)))
        .orderBy(desc(messages.id))
        .limit(1);

      if (latest) {
        const elapsed = (Date.now() - new Date(latest.createdAt).getTime()) / 1000;
        if (elapsed < channel.slowmodeSeconds) {
          throw tooManyRequests(
            'Slowmode is on in this channel.',
            Math.ceil(channel.slowmodeSeconds - elapsed),
          );
        }
      }
    }

    if (body.replyToId) {
      const [parent] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, body.replyToId), eq(messages.channelId, channelId)))
        .limit(1);
      if (!parent) throw badRequest('That message is not in this channel.', 'unknown_message');
    }

    const messageId = uuidv7();

    const [created] = await db
      .insert(messages)
      .values({
        id: messageId,
        channelId,
        authorId: user.id,
        content: channel.encrypted ? null : content,
        ciphertext: body.ciphertext ? Buffer.from(body.ciphertext, 'base64') : null,
        nonce: body.nonce ? Buffer.from(body.nonce, 'base64') : null,
        keyEpoch: channel.encrypted ? (body.keyEpoch ?? channel.keyEpoch) : null,
        replyToId: body.replyToId ?? null,
      })
      .returning();

    if (!created) throw badRequest('Could not send the message.', 'send_failed');

    // Attach only files this user uploaded and has not already attached, so an
    // id guessed from someone else's message cannot be re-posted here.
    if (attachmentIds.length > 0) {
      await db
        .update(attachments)
        .set({ messageId })
        .where(
          and(
            inArray(attachments.id, attachmentIds),
            eq(attachments.uploaderId, user.id),
            isNull(attachments.messageId),
          ),
        );
    }

    const [hydrated] = await hydrate([created]);
    if (!hydrated) throw badRequest('Could not send the message.', 'send_failed');

    await hub.broadcastToChannel(
      ctx.serverId,
      channelId,
      { t: 'message_create', d: hydrated },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    return { message: hydrated };
  });

  app.patch('/api/messages/:messageId', async (request) => {
    const user = requireUser(request);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const body = z
      .object({
        content: z.string().max(LIMITS.message.max).optional(),
        ciphertext: z.string().max(64_000).optional(),
        nonce: z.string().max(256).optional(),
      })
      .parse(request.body);

    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing) throw notFound('That message does not exist.', 'unknown_message');
    if (existing.deletedAt) throw badRequest('That message was deleted.', 'message_deleted');

    // Editing is authorship, not moderation. Nobody edits someone else's words,
    // however senior they are.
    if (existing.authorId !== user.id) {
      throw forbidden('You can only edit your own messages.');
    }

    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      Permission.SEND_MESSAGES,
    );

    const content = body.content?.trim() ?? null;
    if (content) {
      const check = validateMessageContent(content);
      if (!check.ok) throw badRequest(check.error, 'message_too_long');
    }

    const [updated] = await db
      .update(messages)
      .set({
        ...(body.ciphertext
          ? {
              ciphertext: Buffer.from(body.ciphertext, 'base64'),
              nonce: body.nonce ? Buffer.from(body.nonce, 'base64') : existing.nonce,
            }
          : { content }),
        editedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    if (!updated) throw notFound('That message does not exist.', 'unknown_message');

    const [hydrated] = await hydrate([updated]);
    if (!hydrated) throw notFound('That message does not exist.', 'unknown_message');

    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'message_update', d: hydrated },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    return { message: hydrated };
  });

  app.delete('/api/messages/:messageId', async (request) => {
    const user = requireUser(request);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);

    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing) throw notFound('That message does not exist.', 'unknown_message');

    const isAuthor = existing.authorId === user.id;
    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      isAuthor ? Permission.VIEW_CHANNEL : Permission.MANAGE_MESSAGES,
    );

    // Soft delete: the row stays so replies still resolve, but the body is
    // cleared immediately rather than merely hidden. A tombstone that still
    // holds the text is not a deletion.
    await db
      .update(messages)
      .set({
        deletedAt: new Date(),
        deletedBy: user.id,
        content: null,
        ciphertext: null,
        nonce: null,
      })
      .where(eq(messages.id, messageId));

    const attachmentRows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.messageId, messageId));

    if (attachmentRows.length > 0) {
      const { deleteObject } = await import('../services/storage.js');
      await Promise.all(attachmentRows.map((row) => deleteObject(row.storageKey)));
      await db.delete(attachments).where(eq(attachments.messageId, messageId));
    }

    if (!isAuthor) {
      await audit.record({
        serverId: ctx.serverId,
        actorId: user.id,
        action: 'message.delete',
        targetType: 'message',
        targetId: messageId,
        changes: { authorId: existing.authorId, channelId: existing.channelId },
      });
    }

    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'message_delete', d: { id: messageId, channelId: existing.channelId } },
      Permission.VIEW_CHANNEL,
    );

    return { ok: true };
  });

  /** Mark a channel read up to a message. Drives unread badges across devices. */
  app.put('/api/channels/:channelId/read', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z.object({ messageId: z.string() }).parse(request.body);

    await requireChannelPermission(channelId, user.id, Permission.VIEW_CHANNEL);

    await getDb()
      .insert(readStates)
      .values({
        userId: user.id,
        channelId,
        lastReadMessageId: body.messageId,
        mentionCount: 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readStates.userId, readStates.channelId],
        set: { lastReadMessageId: body.messageId, mentionCount: 0, updatedAt: new Date() },
      });

    return { ok: true };
  });

  app.get('/api/read-states', async (request) => {
    const user = requireUser(request);
    const rows = await getDb().select().from(readStates).where(eq(readStates.userId, user.id));
    return {
      readStates: rows.map((row) => ({
        channelId: row.channelId,
        lastReadMessageId: row.lastReadMessageId,
        mentionCount: row.mentionCount,
      })),
    };
  });
}
