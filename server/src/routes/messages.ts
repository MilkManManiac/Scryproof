/**
 * Messages.
 *
 * Reads are paginated by id. Because ids are UUIDv7 they sort chronologically,
 * so "the 50 messages before this one" is a plain indexed range scan with no
 * offset and no cursor table.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, formatRoll, has, parseRoll, roll as rollDice, validateMessageContent } from '@scryproof/shared';
import type { Attachment, Message, Reaction, ReplyPreview } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { attachments, channels, messages, reactions, users } from '../db/schema.js';
import { badRequest, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { rollDie } from '../lib/crypto.js';
import { uuidv7 } from '../lib/ids.js';
import { consume } from '../lib/rate-limit.js';
import { config } from '../config.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import { publicUrlFor } from '../services/storage.js';
import { requireChannelPermission, requireMember } from '../services/permissions.js';
import { NO_MENTIONS, pingTargets, resolveMentions, serverMemberIds } from '../services/mentions.js';
import { addReaction, reactionsForMessages, removeReaction } from '../services/reactions.js';
import { bumpMentions, markRead, readStatesFor } from '../services/read-state.js';
import { searchMessages } from '../services/search.js';
import type { MessageRow, User } from '../db/schema.js';

/** How much of a parent message rides along with a reply. */
const REPLY_PREVIEW_LENGTH = 140;

/** `/roll 2d6+3` or `/r 2d6+3`. The expression, if any, is the rest of the line. */
const ROLL_COMMAND_RE = /^\/(?:roll|r)(?:\s+([\s\S]+))?$/i;

/**
 * Load authors, attachments, reactions and reply parents for a page of
 * messages in a fixed handful of queries, not a handful per message. Exported
 * for other routes that need the same shape, such as search results.
 */
export async function hydrate(rows: MessageRow[]): Promise<Message[]> {
  if (rows.length === 0) return [];

  const db = getDb();

  // Parents first, so their authors can be fetched in the same query as everyone else's.
  const onPage = new Map(rows.map((row) => [row.id, row]));
  const parentIds = [...new Set(rows.map((row) => row.replyToId).filter((id): id is string => id !== null))];
  const missingParentIds = parentIds.filter((id) => !onPage.has(id));
  const parentRows =
    missingParentIds.length > 0
      ? await db.select().from(messages).where(inArray(messages.id, missingParentIds))
      : [];
  const parents = new Map<string, MessageRow>([...onPage, ...parentRows.map((row) => [row.id, row] as const)]);

  const authorIds = [...new Set([...rows, ...parentRows].map((row) => row.authorId))];
  const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
  const authors = new Map<string, User>(authorRows.map((row) => [row.id, row]));

  const previewOf = (parentId: string | null): ReplyPreview | null => {
    const parent = parentId ? parents.get(parentId) : undefined;
    const parentAuthor = parent ? authors.get(parent.authorId) : undefined;
    if (!parent || !parentAuthor) return null;
    const deleted = parent.deletedAt !== null;
    const text = deleted ? '' : (parent.content ?? '').trim();
    return {
      id: parent.id,
      authorId: parent.authorId,
      authorName: parentAuthor.displayName,
      content: text ? text.slice(0, REPLY_PREVIEW_LENGTH) : null,
      deleted,
    };
  };

  const messageIds = rows.map((row) => row.id);
  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));
  const reactionsByMessage = await reactionsForMessages(messageIds);

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
      return serialize.message(row, author, byMessage.get(row.id) ?? [], {
        reactions: reactionsByMessage.get(row.id) ?? [],
        replyTo: previewOf(row.replyToId),
      });
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

  /**
   * Search across every channel in a server the caller can currently view and
   * read history in. `searchMessages` works out that channel list itself, so
   * this route never has to be the thing that gets the filter right.
   *
   * DMs are end-to-end encrypted; the server cannot read their content, so
   * there is no DM search and there cannot be one.
   */
  app.get('/api/servers/:serverId/search', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const query = z
      .object({
        q: z.string().min(2).max(100),
        before: z.string().optional(),
      })
      .parse(request.query);

    const ctx = await requireMember(serverId, user.id);

    const limit = consume(`search:${user.id}`, config.rateLimits.messagesPerMinute, 60_000);
    if (!limit.allowed) {
      throw tooManyRequests('You are searching too quickly.', limit.retryAfterSeconds);
    }

    const rows = await searchMessages(ctx, query.q, query.before);
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

    let content = body.content?.trim() ?? null;
    let kind: 'text' | 'roll' = 'text';
    const attachmentIds = body.attachmentIds ?? [];

    // Rolled on the server, never trusting a die the client claims to have
    // already thrown. A bad expression is refused with the parse error and
    // nothing is sent, same as any other rejected message.
    const rollMatch = content ? ROLL_COMMAND_RE.exec(content) : null;
    if (rollMatch) {
      const parsed = parseRoll(rollMatch[1] ?? '');
      if (!parsed.ok) throw badRequest(parsed.error, 'bad_roll');
      content = formatRoll(parsed.roll, rollDice(parsed.roll, rollDie));
      kind = 'roll';
    }

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

    let replyAuthorId: string | null = null;
    if (body.replyToId) {
      const [parent] = await db
        .select({ id: messages.id, authorId: messages.authorId })
        .from(messages)
        .where(and(eq(messages.id, body.replyToId), eq(messages.channelId, channelId)))
        .limit(1);
      if (!parent) throw badRequest('That message is not in this channel.', 'unknown_message');
      replyAuthorId = parent.authorId;
    }

    // In an encrypted channel the server cannot read the body, so it pings
    // nobody, including the person replied to: a count it cannot explain would
    // be a claim about content it has never seen.
    const memberIds = channel.encrypted ? new Set<string>() : await serverMemberIds(ctx.serverId);
    const mentions = channel.encrypted
      ? NO_MENTIONS
      : resolveMentions({
          content,
          senderId: user.id,
          memberIds,
          canMentionEveryone: has(ctx.channelPermissions, Permission.MENTION_EVERYONE),
          replyAuthorId,
        });

    const messageId = uuidv7();

    const [created] = await db
      .insert(messages)
      .values({
        id: messageId,
        channelId,
        authorId: user.id,
        content: channel.encrypted ? null : content,
        kind,
        ciphertext: body.ciphertext ? Buffer.from(body.ciphertext, 'base64') : null,
        nonce: body.nonce ? Buffer.from(body.nonce, 'base64') : null,
        keyEpoch: channel.encrypted ? (body.keyEpoch ?? channel.keyEpoch) : null,
        replyToId: body.replyToId ?? null,
        mentions: mentions.userIds,
        mentionsEveryone: mentions.everyone,
      })
      .returning();

    if (!created) throw badRequest('Could not send the message.', 'send_failed');

    await db.update(channels).set({ lastMessageId: messageId }).where(eq(channels.id, channelId));

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

    // After the message itself, so a badge never arrives for something that
    // is not on screen yet.
    const pinged = await pingTargets({
      serverId: ctx.serverId,
      channelId,
      categoryId: channel.categoryId,
      senderId: user.id,
      mentions,
      memberIds,
    });
    for (const [userId, state] of await bumpMentions(pinged, channelId)) {
      hub.sendToUser(userId, { t: 'read_state_update', d: state });
    }

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
    if (existing.kind === 'roll') throw badRequest('A roll cannot be edited.', 'roll_not_editable');

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

    // An edit changes who the message is drawn as mentioning. It does not ping
    // anyone again: nobody should be able to ring a bell by editing in a loop.
    let replyAuthorId: string | null = null;
    if (existing.replyToId) {
      const [parent] = await db
        .select({ authorId: messages.authorId })
        .from(messages)
        .where(eq(messages.id, existing.replyToId))
        .limit(1);
      replyAuthorId = parent?.authorId ?? null;
    }
    const mentions = body.ciphertext
      ? NO_MENTIONS
      : resolveMentions({
          content,
          senderId: user.id,
          memberIds: await serverMemberIds(ctx.serverId),
          canMentionEveryone: has(ctx.channelPermissions, Permission.MENTION_EVERYONE),
          replyAuthorId,
        });

    const [updated] = await db
      .update(messages)
      .set({
        mentions: mentions.userIds,
        mentionsEveryone: mentions.everyone,
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

    await db.delete(reactions).where(eq(reactions.messageId, messageId));

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

  /* -------------------------------- reactions ------------------------------- */

  async function reactionTarget(request: { params: unknown }) {
    const params = z
      .object({ messageId: z.string(), emoji: z.string().min(1).max(256) })
      .parse(request.params);

    const [existing] = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.id, params.messageId))
      .limit(1);
    if (!existing) throw notFound('That message does not exist.', 'unknown_message');

    // Fastify has already percent-decoded the path, so this is the emoji itself.
    return { existing, emoji: params.emoji };
  }

  async function announceReactions(serverId: string, existing: MessageRow, current: Reaction[]) {
    await hub.broadcastToChannel(
      serverId,
      existing.channelId,
      {
        t: 'reaction_update',
        d: { messageId: existing.id, channelId: existing.channelId, reactions: current },
      },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );
  }

  /* ---------------------------------- pins ---------------------------------- */

  /**
   * Pinning needs Manage Messages, as on Discord: it is a statement the channel
   * makes, not one a member makes. Reading the pins needs only what reading
   * the channel needs.
   */
  const setPinned = async (request: { params: unknown }, userId: string, pinned: boolean): Promise<Message> => {
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing || existing.deletedAt) throw notFound('That message does not exist.', 'unknown_message');
    const ctx = await requireChannelPermission(existing.channelId, userId, Permission.MANAGE_MESSAGES);
    if (pinned) {
      const [tally] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.channelId, existing.channelId), isNotNull(messages.pinnedAt)));
      if ((tally?.count ?? 0) >= LIMITS.pinsPerChannel) throw badRequest(`A channel can hold ${LIMITS.pinsPerChannel} pins. Unpin one first.`, 'too_many_pins');
    }
    const [updated] = await db
      .update(messages)
      .set({ pinnedAt: pinned ? new Date() : null })
      .where(eq(messages.id, messageId))
      .returning();
    const [hydrated] = await hydrate(updated ? [updated] : []);
    if (!hydrated) throw notFound('That message does not exist.', 'unknown_message');
    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'message_update', d: hydrated },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );
    return hydrated;
  };

  app.put('/api/messages/:messageId/pin', async (request) => ({ message: await setPinned(request, requireUser(request).id, true) }));
  app.delete('/api/messages/:messageId/pin', async (request) => ({ message: await setPinned(request, requireUser(request).id, false) }));

  app.get('/api/channels/:channelId/pins', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    await requireChannelPermission(channelId, user.id, Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY);
    const rows = await getDb()
      .select()
      .from(messages)
      .where(and(eq(messages.channelId, channelId), isNotNull(messages.pinnedAt)))
      .orderBy(desc(messages.pinnedAt))
      .limit(LIMITS.pinsPerChannel);
    return { messages: await hydrate(rows) };
  });

  app.put('/api/messages/:messageId/reactions/:emoji', async (request) => {
    const user = requireUser(request);
    const { existing, emoji } = await reactionTarget(request);

    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY | Permission.ADD_REACTIONS,
    );
    if (existing.deletedAt) throw badRequest('That message was deleted.', 'message_deleted');

    const limit = consume(`reactions:${user.id}`, config.rateLimits.messagesPerMinute * 2, 60_000);
    if (!limit.allowed) {
      throw tooManyRequests('You are reacting too quickly.', limit.retryAfterSeconds);
    }

    const current = await addReaction(existing.id, user.id, emoji);
    await announceReactions(ctx.serverId, existing, current);
    return { reactions: current };
  });

  app.delete('/api/messages/:messageId/reactions/:emoji', async (request) => {
    const user = requireUser(request);
    const { existing, emoji } = await reactionTarget(request);

    // Taking your own reaction back needs nothing but being able to see it.
    // Losing ADD_REACTIONS must not trap what you already added.
    const ctx = await requireChannelPermission(existing.channelId, user.id, Permission.VIEW_CHANNEL);

    const current = await removeReaction(existing.id, user.id, emoji);
    await announceReactions(ctx.serverId, existing, current);
    return { reactions: current };
  });

  /* ------------------------------- read state ------------------------------- */

  /** Mark a channel read up to a message. Drives unread badges across devices. */
  app.put('/api/channels/:channelId/read', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z.object({ messageId: z.string() }).parse(request.body);

    await requireChannelPermission(channelId, user.id, Permission.VIEW_CHANNEL);

    const [target] = await getDb()
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, body.messageId), eq(messages.channelId, channelId)))
      .limit(1);
    if (!target) throw badRequest('That message is not in this channel.', 'unknown_message');

    const state = await markRead(user.id, channelId, body.messageId);
    // Every device this person has open, including the one that asked.
    hub.sendToUser(user.id, { t: 'read_state_update', d: state });

    return { ok: true, readState: state };
  });

  app.get('/api/read-states', async (request) => {
    const user = requireUser(request);
    return { readStates: await readStatesFor(user.id) };
  });
}
