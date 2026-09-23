/**
 * Messages.
 *
 * Reads are paginated by id. Because ids are UUIDv7 they sort chronologically,
 * so "the 50 messages before this one" is a plain indexed range scan with no
 * offset and no cursor table.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  LIMITS,
  POLL_LIMITS,
  Permission,
  formatRoll,
  messageSignedBytes,
  has,
  parsePollCommand,
  parseRoll,
  roll as rollDice,
  validateMessageContent,
} from '@scryproof/shared';
import type { Attachment, Message, Reaction, ReplyPreview } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { attachments, bookmarks, channelEpochs, channels, deviceKeys, messages, reactions, users } from '../db/schema.js';
import type { PollBody } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../lib/http-error.js';
import { rollDie } from '../lib/crypto.js';
import { uuidv7 } from '../lib/ids.js';
import { consume } from '../lib/rate-limit.js';
import { config } from '../config.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import { publicUrlFor } from '../services/storage.js';
import { assertNotTimedOut, requireChannelPermission, requireMember } from '../services/permissions.js';
import { type ResolvedMentions, pingTargets, resolveMentions, serverMemberIds } from '../services/mentions.js';
import { freshEpoch, identitySigned } from '../services/channel-keys.js';
import { addReaction, reactionsForMessages, removeReaction } from '../services/reactions.js';
import { setVotes, tallyForMessages } from '../services/polls.js';
import { bumpMentions, markRead, readStatesFor } from '../services/read-state.js';
import { searchMessages } from '../services/search.js';
import { bookmarksFor, isBookmarked } from '../services/bookmarks.js';
import type { ChannelRow, MessageRow, User } from '../db/schema.js';

/** How much of a parent message rides along with a reply. */
const REPLY_PREVIEW_LENGTH = 140;

/** `/roll 2d6+3` or `/r 2d6+3`. The expression, if any, is the rest of the line. */
const ROLL_COMMAND_RE = /^\/(?:roll|r)(?:\s+([\s\S]+))?$/i;

/**
 * How many messages sit either side of the one a jump landed on. Both halves
 * together are a page, so a window paged upward or downward behaves like any
 * other page.
 */
const AROUND_HALF = 25;

/**
 * Load authors, attachments, reactions, poll tallies and reply parents for a
 * page of messages in a fixed handful of queries, not a handful per message.
 * Exported for other routes that need the same shape, such as search results.
 *
 * `viewerId` is whoever is about to receive the result: a poll's `mine` is
 * that person's own picks and nobody else's, so it cannot be computed once
 * and reused for a different reader.
 */
export async function hydrate(rows: MessageRow[], viewerId?: string): Promise<Message[]> {
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
  // Only asked for when the caller is a signed-in person reading their own
  // view of the page; a hydrate with nobody to ask on behalf of (an internal
  // one-off, or a message being broadcast to everyone) leaves it out.
  const bookmarked = viewerId ? await isBookmarked(viewerId, messageIds) : null;
  const pollTallies = await tallyForMessages(
    rows.filter((row) => row.poll).map((row) => ({ messageId: row.id, optionCount: row.poll?.options.length ?? 0 })),
    viewerId,
  );

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
        bookmarked: bookmarked ? bookmarked.has(row.id) : undefined,
        poll: pollTallies.get(row.id),
      });
    })
    .filter((message): message is Message => message !== null);
}

/** What a sealed message carries besides its body. Shared by sending and editing. */
const sealedShape = {
  ciphertext: z.string().max(64_000).optional(),
  nonce: z.string().max(256).optional(),
  senderDeviceId: z.string().min(8).max(64).optional(),
  signature: z.string().max(256).optional(),
  mentionIds: z.array(z.string().max(64)).max(100).optional(),
  mentionsEveryone: z.boolean().optional(),
};

interface CheckedSeal {
  ciphertext: Buffer;
  nonce: Buffer;
  epoch: number;
  senderDeviceId: string;
  signature: Buffer;
  mentions: ResolvedMentions;
}

/**
 * The checks an encrypted channel's message passes before it is stored: sealed
 * under the current key, which has been made; signed by a device of the
 * author; pinging only members, and everyone only if allowed. Refused rather
 * than trimmed, because the signature covers the list and a trimmed one would
 * not verify for anyone reading it.
 */
async function checkSeal(input: {
  channel: ChannelRow;
  authorId: string;
  replyToId: string | null;
  body: {
    ciphertext?: string;
    nonce?: string;
    senderDeviceId?: string;
    signature?: string;
    mentionIds?: string[];
    mentionsEveryone?: boolean;
  };
  epoch: number | undefined;
  canMentionEveryone: boolean;
}): Promise<CheckedSeal> {
  const { channel, body } = input;
  if (!body.ciphertext || !body.nonce || !body.senderDeviceId || !body.signature || input.epoch === undefined) {
    throw badRequest('This channel is end-to-end encrypted.', 'encryption_required');
  }
  const current = await freshEpoch(channel);
  if (input.epoch !== current) throw conflict('The channel has moved to a newer key.', 'key_rotated');

  const db = getDb();
  const [made] = await db
    .select({ epoch: channelEpochs.epoch })
    .from(channelEpochs)
    .where(and(eq(channelEpochs.channelId, channel.id), eq(channelEpochs.epoch, current)))
    .limit(1);
  if (!made) throw conflict('Nobody has made this key yet.', 'no_epoch');

  const [device] = await db
    .select({ identityKey: deviceKeys.identityKey })
    .from(deviceKeys)
    .where(and(eq(deviceKeys.userId, input.authorId), eq(deviceKeys.deviceId, body.senderDeviceId)))
    .limit(1);
  if (!device) throw badRequest('This device has not published its keys.', 'unknown_device');

  const mentionIds = [...new Set(body.mentionIds ?? [])];
  const everyone = body.mentionsEveryone ?? false;
  if (everyone && !input.canMentionEveryone) throw forbidden('You cannot mention everyone in this channel.');
  const memberIds = await serverMemberIds(channel.serverId);
  if (mentionIds.some((id) => !memberIds.has(id))) throw badRequest('That person is not in this server.', 'unknown_member');

  const ciphertext = Buffer.from(body.ciphertext, 'base64');
  const nonce = Buffer.from(body.nonce, 'base64');
  const signature = Buffer.from(body.signature, 'base64');
  const signed = messageSignedBytes({
    channelId: channel.id,
    epoch: current,
    authorId: input.authorId,
    senderDeviceId: body.senderDeviceId,
    replyToId: input.replyToId,
    mentionIds,
    mentionsEveryone: everyone,
    nonce,
    ciphertext,
  });
  if (!(await identitySigned(device.identityKey, signature, signed))) {
    throw badRequest('That message is not signed by this device.', 'bad_signature');
  }
  return {
    ciphertext,
    nonce,
    epoch: current,
    senderDeviceId: body.senderDeviceId,
    signature,
    mentions: { userIds: mentionIds.filter((id) => id !== input.authorId), everyone },
  };
}

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/channels/:channelId/messages', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const query = z
      .object({
        before: z.string().optional(),
        after: z.string().optional(),
        around: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);

    // `around` is its own shape of answer, not a filter that stacks with the
    // others, so asking for both is a mistake rather than something to guess at.
    if (query.around && (query.before || query.after)) {
      throw badRequest(
        'Ask for messages around one message, or before or after one, not both.',
        'conflicting_range',
      );
    }

    await requireChannelPermission(
      channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    const db = getDb();

    // Landing on a message that is nowhere near the newest: the half up to and
    // including it, then the half after it, in the order the timeline draws.
    if (query.around) {
      const target = query.around;
      const older = (
        await db
          .select()
          .from(messages)
          .where(and(eq(messages.channelId, channelId), lte(messages.id, target)))
          .orderBy(desc(messages.id))
          .limit(AROUND_HALF)
      ).reverse();
      const newer = await db
        .select()
        .from(messages)
        .where(and(eq(messages.channelId, channelId), gt(messages.id, target)))
        .orderBy(asc(messages.id))
        .limit(AROUND_HALF);

      return { messages: await hydrate([...older, ...newer], user.id) };
    }

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

    return { messages: await hydrate(rows, user.id) };
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
    return { messages: await hydrate(rows, user.id) };
  });

  app.post('/api/channels/:channelId/messages', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z
      .object({
        content: z.string().max(LIMITS.message.max).optional(),
        ...sealedShape,
        keyEpoch: z.number().int().min(1).optional(),
        replyToId: z.string().optional(),
        attachmentIds: z.array(z.string()).max(LIMITS.attachmentsPerMessage).optional(),
      })
      .parse(request.body);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.SEND_MESSAGES);
    assertNotTimedOut(ctx);

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
    let sealed: CheckedSeal | null = null;
    if (channel.encrypted) {
      if (body.content) {
        throw badRequest('Plaintext is not accepted in an encrypted channel.', 'encryption_required');
      }
      // Stage 2 locks files in the browser. Until then a file here would be the
      // one readable thing in a channel that says it is not.
      if ((body.attachmentIds ?? []).length > 0) {
        throw badRequest('Files cannot be sent in an encrypted channel yet.', 'encrypted_files_unsupported');
      }
      sealed = await checkSeal({
        channel,
        authorId: user.id,
        replyToId: body.replyToId ?? null,
        body,
        epoch: body.keyEpoch,
        canMentionEveryone: has(ctx.channelPermissions, Permission.MENTION_EVERYONE),
      });
    } else if (body.ciphertext) {
      throw badRequest('This channel is not encrypted.', 'encryption_not_enabled');
    }

    let content = body.content?.trim() ?? null;
    let kind: 'text' | 'roll' | 'poll' = 'text';
    let poll: PollBody | null = null;
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

    // A poll's question becomes the stored `content`, so search and
    // notifications keep working; the options and the switch for multiple
    // picks go in the `poll` column, votes go in their own table.
    const pollMatch = content ? parsePollCommand(content) : null;
    if (pollMatch) {
      if (!pollMatch.ok) throw badRequest(pollMatch.error, 'bad_poll');
      content = pollMatch.poll.question;
      kind = 'poll';
      poll = { question: pollMatch.poll.question, options: pollMatch.poll.options, multiple: pollMatch.poll.multiple, closedAt: null };
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

    // In an encrypted channel the server cannot read the body, so the sender's
    // device names who it pings, inside the signature (see `checkSeal`).
    const memberIds = await serverMemberIds(ctx.serverId);
    const mentions = sealed
      ? sealed.mentions
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
        poll,
        ciphertext: sealed?.ciphertext ?? null,
        nonce: sealed?.nonce ?? null,
        keyEpoch: sealed?.epoch ?? null,
        senderDeviceId: sealed?.senderDeviceId ?? null,
        signature: sealed?.signature ?? null,
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

    const [hydrated] = await hydrate([created], user.id);
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
    for (const [userId, state] of await bumpMentions(pinged, channelId, user.id)) {
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
        ...sealedShape,
        keyEpoch: z.number().int().min(1).optional(),
      })
      .parse(request.body);

    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing) throw notFound('That message does not exist.', 'unknown_message');
    if (existing.deletedAt) throw badRequest('That message was deleted.', 'message_deleted');
    if (existing.kind === 'roll') throw badRequest('A roll cannot be edited.', 'roll_not_editable');
    if (existing.kind === 'poll') throw badRequest('A poll cannot be edited.', 'poll_not_editable');

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
    assertNotTimedOut(ctx);

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
    const [channel] = await db.select().from(channels).where(eq(channels.id, existing.channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');
    let sealed: CheckedSeal | null = null;
    if (channel.encrypted) {
      if (body.content) throw badRequest('Plaintext is not accepted in an encrypted channel.', 'encryption_required');
      sealed = await checkSeal({
        channel,
        authorId: user.id,
        replyToId: existing.replyToId,
        body,
        epoch: body.keyEpoch,
        canMentionEveryone: has(ctx.channelPermissions, Permission.MENTION_EVERYONE),
      });
    } else if (body.ciphertext) {
      throw badRequest('This channel is not encrypted.', 'encryption_not_enabled');
    }
    const mentions = sealed
      ? sealed.mentions
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
        ...(sealed
          ? {
              ciphertext: sealed.ciphertext,
              nonce: sealed.nonce,
              keyEpoch: sealed.epoch,
              senderDeviceId: sealed.senderDeviceId,
              signature: sealed.signature,
            }
          : { content }),
        editedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    if (!updated) throw notFound('That message does not exist.', 'unknown_message');

    const [hydrated] = await hydrate([updated], user.id);
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
        signature: null,
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
    const [hydrated] = await hydrate(updated ? [updated] : [], userId);
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
    return { messages: await hydrate(rows, user.id) };
  });

  /* -------------------------------- bookmarks -------------------------------- */

  /**
   * Saving a message needs nothing but being able to see it: unlike pinning,
   * this is not a statement the channel makes, only something one person is
   * doing for themselves. Nobody else, including the message's author, is
   * told.
   */
  const setBookmarked = async (request: { params: unknown }, userId: string, saved: boolean): Promise<void> => {
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing || existing.deletedAt) throw notFound('That message does not exist.', 'unknown_message');
    await requireChannelPermission(
      existing.channelId,
      userId,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );
    if (saved) {
      await db.insert(bookmarks).values({ userId, messageId }).onConflictDoNothing();
    } else {
      await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.messageId, messageId)));
    }
  };

  app.put('/api/messages/:messageId/bookmark', async (request) => {
    await setBookmarked(request, requireUser(request).id, true);
    return { ok: true };
  });
  app.delete('/api/messages/:messageId/bookmark', async (request) => {
    await setBookmarked(request, requireUser(request).id, false);
    return { ok: true };
  });

  /**
   * Everything this person has saved, newest bookmark first, across every
   * server they are still a member of. A message in a channel they lost
   * access to since saving it is left off rather than turned into an error:
   * see `bookmarksFor`.
   */
  app.get('/api/bookmarks', async (request) => {
    const user = requireUser(request);
    return { messages: await bookmarksFor(user.id) };
  });

  app.put('/api/messages/:messageId/reactions/:emoji', async (request) => {
    const user = requireUser(request);
    const { existing, emoji } = await reactionTarget(request);

    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY | Permission.ADD_REACTIONS,
    );
    assertNotTimedOut(ctx);
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

  /* ------------------------------- jump again ------------------------------- */

  /**
   * "Again" on a character's jump plays it for everyone looking at the server,
   * not only for the one who clicked. Wes: "i can see when i click it, but
   * others cant". Nothing is stored and no message is added.
   */
  app.post('/api/messages/:messageId/replay', async (request) => {
    const user = requireUser(request);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const [existing] = await getDb().select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing || existing.deletedAt) throw notFound('That message does not exist.', 'unknown_message');

    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY | Permission.SEND_MESSAGES,
    );
    assertNotTimedOut(ctx);
    // In an encrypted channel the server cannot tell a jump from anything else.
    // It passes the id along and each client checks what the message says.
    const sealed = existing.ciphertext !== null;
    const content = sealed ? null : (existing.content ?? '').trim();
    if (content !== null && !/^\/[a-z0-9-]+-jump$/i.test(content)) throw badRequest('That message is not a jump.', 'not_a_jump');

    const limit = consume(`replays:${user.id}`, 10, 30_000);
    if (!limit.allowed) throw tooManyRequests('That is a lot of jumping. Wait a moment.', limit.retryAfterSeconds);

    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'spawn_replay', d: { messageId: existing.id, channelId: existing.channelId, content } },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );
    return { ok: true };
  });

  /* ---------------------------------- polls --------------------------------- */

  /**
   * Voting replaces the caller's own picks. The broadcast carries only the
   * public tally, never who voted for what and never anyone else's picks, so
   * it is `poll_update`, not `message_update`: the HTTP response here is the
   * only place the caller's own `mine` goes out, because it is only ever
   * true for them.
   */
  app.put('/api/messages/:messageId/votes', async (request) => {
    const user = requireUser(request);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);
    const body = z.object({ options: z.array(z.number().int().min(0)).max(POLL_LIMITS.maxOptions) }).parse(request.body);

    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing || existing.deletedAt) throw notFound('That message does not exist.', 'unknown_message');
    const poll = existing.poll;
    if (!poll) throw badRequest('That message is not a poll.', 'not_a_poll');

    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    if (poll.closedAt) throw badRequest('This poll is closed.', 'poll_closed');

    const options = [...new Set(body.options)];
    if (options.some((option) => option >= poll.options.length)) {
      throw badRequest('That is not one of the choices.', 'unknown_option');
    }
    if (!poll.multiple && options.length > 1) {
      throw badRequest('This poll takes one pick.', 'single_choice_only');
    }

    await setVotes(messageId, user.id, options);

    const [hydrated] = await hydrate([existing], user.id);
    if (!hydrated || !hydrated.poll) throw notFound('That message does not exist.', 'unknown_message');

    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'poll_update', d: { messageId, channelId: existing.channelId, counts: hydrated.poll.counts, closedAt: hydrated.poll.closedAt } },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    return { message: hydrated };
  });

  /** Closing is the author's call, or anyone with Manage messages, same as pinning is a channel-level statement. */
  app.post('/api/messages/:messageId/close', async (request) => {
    const user = requireUser(request);
    const { messageId } = z.object({ messageId: z.string() }).parse(request.params);

    const db = getDb();
    const [existing] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!existing || existing.deletedAt) throw notFound('That message does not exist.', 'unknown_message');
    if (!existing.poll) throw badRequest('That message is not a poll.', 'not_a_poll');

    const isAuthor = existing.authorId === user.id;
    const ctx = await requireChannelPermission(
      existing.channelId,
      user.id,
      isAuthor ? Permission.VIEW_CHANNEL : Permission.MANAGE_MESSAGES,
    );

    if (existing.poll.closedAt) return { message: (await hydrate([existing], user.id))[0] };

    const closedAt = new Date();
    const [updated] = await db
      .update(messages)
      .set({ poll: { ...existing.poll, closedAt: closedAt.toISOString() } })
      .where(eq(messages.id, messageId))
      .returning();
    if (!updated) throw notFound('That message does not exist.', 'unknown_message');

    const [hydrated] = await hydrate([updated], user.id);
    if (!hydrated || !hydrated.poll) throw notFound('That message does not exist.', 'unknown_message');

    await hub.broadcastToChannel(
      ctx.serverId,
      existing.channelId,
      { t: 'poll_update', d: { messageId, channelId: existing.channelId, counts: hydrated.poll.counts, closedAt: hydrated.poll.closedAt } },
      Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
    );

    return { message: hydrated };
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
