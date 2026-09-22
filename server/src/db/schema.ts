/**
 * Database schema.
 *
 * Two decisions here are load-bearing and should not be "simplified" later:
 *
 *   1. `messages` can hold either plaintext or an opaque ciphertext blob from
 *      day one. Milestone 7 turns on end-to-end encrypted text by writing to
 *      the second set of columns instead of the first. No migration of live
 *      data, no rewrite of the read path.
 *
 *   2. Permission masks are stored as bigint. Postgres bigint comes back from
 *      the driver as a string, which is correct and which we convert to
 *      bigint at the edge. Storing them as integers would cap us at 31
 *      permissions and force a painful migration the first time we add one.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

/**
 * Postgres bytea. Drizzle has no first-class bytea, and we want real binary
 * rather than base64-in-text so the ciphertext column cannot be accidentally
 * read as a string.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

const id = () => text('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: id(),
    /** Stored lowercase. The unique index below is what actually enforces it. */
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    /** argon2id. Never logged, never returned by any endpoint. */
    passwordHash: text('password_hash').notNull(),
    /** Encrypted at rest with the server key; null until the user enrols. */
    totpSecret: text('totp_secret'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    /** Single-use codes for getting back in without email. Argon2 hashed. */
    recoveryCodes: jsonb('recovery_codes').$type<string[]>(),
    avatarUrl: text('avatar_url'),
    statusText: text('status_text'),
    /** Public key for Milestone 7 end-to-end encrypted text. */
    identityKey: text('identity_key'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }),
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [uniqueIndex('users_username_key').on(table.username)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * SHA-256 of the cookie value. A stolen database gives an attacker no
     * usable session cookies.
     */
    tokenHash: text('token_hash').notNull(),
    /** Truncated and hashed. Enough to spot a session that is not yours. */
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
  ],
);

export const servers = pgTable('servers', {
  id: id(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
});

export const roles = pgTable(
  'roles',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    /** Higher wins. @everyone is always 0. */
    position: integer('position').notNull().default(0),
    permissions: bigint('permissions', { mode: 'bigint' }).notNull().default(sql`0`),
    /** Show holders in their own group in the member list. */
    hoist: boolean('hoist').notNull().default(false),
    mentionable: boolean('mentionable').notNull().default(false),
    /** Exactly one per server, created with the server, never deletable. */
    isEveryone: boolean('is_everyone').notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [index('roles_server_idx').on(table.serverId)],
);

export const members = pgTable(
  'members',
  {
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: text('nickname'),
    /**
     * While this is in the future the member reads but cannot send, edit,
     * react or join voice in this server. Nothing sweeps it: a past value is
     * simply ignored, which keeps the end of a timeout free of a job that has
     * to be running for the rule to be right.
     */
    timeoutUntil: timestamp('timeout_until', { withTimezone: true, mode: 'date' }),
    joinedAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.userId] }),
    index('members_user_idx').on(table.userId),
  ],
);

export const memberRoles = pgTable(
  'member_roles',
  {
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.serverId, table.userId, table.roleId] }),
    index('member_roles_role_idx').on(table.roleId),
  ],
);

export const bans = pgTable(
  'bans',
  {
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bannedBy: text('banned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.serverId, table.userId] })],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('categories_server_idx').on(table.serverId)],
);

/**
 * Overwrites attached to a category rather than a channel.
 *
 * Same shape as `channel_overwrites` on purpose: it is the same algebra, one
 * level less specific. Kept as its own table rather than a nullable column
 * union so the foreign key can cascade from categories and the primary key
 * stays honest.
 */
export const categoryOverwrites = pgTable(
  'category_overwrites',
  {
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** 'role' | 'member' */
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    allow: bigint('allow', { mode: 'bigint' }).notNull().default(sql`0`),
    deny: bigint('deny', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.targetType, table.targetId] })],
);

export const channels = pgTable(
  'channels',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /** 'text' | 'voice' */
    type: text('type').notNull().default('text'),
    name: text('name').notNull(),
    topic: text('topic'),
    position: integer('position').notNull().default(0),
    /**
     * End-to-end encrypted text. Voice is always encrypted regardless; this
     * flag governs the message body only.
     */
    encrypted: boolean('encrypted').notNull().default(false),
    /** Bumped on every member removal so old keys stop working. */
    keyEpoch: integer('key_epoch').notNull().default(1),
    /** Seconds a member must wait between messages. 0 disables. */
    slowmodeSeconds: integer('slowmode_seconds').notNull().default(0),
    /**
     * The newest message, deleted or not. Kept here so painting unread badges
     * for a whole sidebar is no extra query. No foreign key: it is a marker to
     * compare against, and it has to survive the message it names.
     */
    lastMessageId: text('last_message_id'),
    createdAt: createdAt(),
  },
  (table) => [index('channels_server_idx').on(table.serverId)],
);

export const channelOverwrites = pgTable(
  'channel_overwrites',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    /** 'role' | 'member' */
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    allow: bigint('allow', { mode: 'bigint' }).notNull().default(sql`0`),
    deny: bigint('deny', { mode: 'bigint' }).notNull().default(sql`0`),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.targetType, table.targetId] }),
  ],
);

export const messages = pgTable(
  'messages',
  {
    /** UUIDv7, so id order is time order and pagination needs no extra index. */
    id: id(),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Plaintext body. Null in an encrypted channel. */
    content: text('content'),
    /** 'text' | 'roll'. A roll is written by the server and cannot be edited. */
    kind: text('kind').notNull().default('text'),

    /**
     * Milestone 7. When a channel is encrypted the server stores only these
     * and can never read the message. Present from the first migration so
     * turning encryption on is a feature flag, not a data migration.
     */
    ciphertext: bytea('ciphertext'),
    nonce: bytea('nonce'),
    keyEpoch: integer('key_epoch'),

    replyToId: text('reply_to_id'),
    /** Set while pinned. Kept on the row: a pin is a fact about the message, not a list of its own. */
    pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
    /**
     * Who this message pings, resolved once when it is written. Always empty
     * in an encrypted channel: the server cannot read that body, and it does
     * not guess.
     */
    mentions: jsonb('mentions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    mentionsEveryone: boolean('mentions_everyone').notNull().default(false),
    createdAt: createdAt(),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
    /** Soft delete keeps replies pointing at something real. */
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deletedBy: text('deleted_by'),
  },
  (table) => [
    index('messages_channel_id_idx').on(table.channelId, table.id),
    index('messages_author_idx').on(table.authorId),
  ],
);

/** Profile pictures. One row per picture ever uploaded; the current one is named by `users.avatar_url`. */
export const avatars = pgTable('avatars', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: createdAt(),
});

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    /**
     * Null while the file is uploaded but not yet sent. A message is created
     * after its attachments, so this cannot be non-null from the start.
     */
    messageId: text('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    /**
     * Who uploaded it. This is what makes claiming an attachment a permission
     * check rather than a guess: you may only attach files you uploaded and
     * have not already attached to something else.
     */
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Key in the object store. Never a URL: the store can move. */
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: createdAt(),
  },
  (table) => [
    index('attachments_message_idx').on(table.messageId),
    index('attachments_uploader_idx').on(table.uploaderId),
  ],
);

export const invites = pgTable(
  'invites',
  {
    code: text('code').primaryKey(),
    /** Null means an instance invite: it creates an account, not a membership. */
    serverId: text('server_id').references(() => servers.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    uses: integer('uses').notNull().default(0),
    maxUses: integer('max_uses'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: createdAt(),
  },
  (table) => [index('invites_server_idx').on(table.serverId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    /** Before/after, never message bodies. */
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index('audit_log_server_idx').on(table.serverId, table.id)],
);

/**
 * Emoji a server uploaded for itself.
 *
 * The name is unique per server and that is enforced by the index below rather
 * than by the route, because `:cheer:` resolving to two different images is
 * not a thing a body can be drawn from at all. The image lives in the object
 * store under `storage_key`, as avatars and attachments do.
 */
export const emojis = pgTable(
  'emojis',
  {
    id: id(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('emojis_server_name_key').on(table.serverId, table.name)],
);

/** One row per person, per emoji, per message. The key is what makes adding twice harmless. */
export const reactions = pgTable(
  'reactions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    index('reactions_message_idx').on(table.messageId),
  ],
);

/**
 * Where a member last read each channel. Drives unread badges without asking
 * the client to remember anything across devices.
 */
export const readStates = pgTable(
  'read_states',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    lastReadMessageId: text('last_read_message_id'),
    mentionCount: smallint('mention_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.channelId] })],
);

/* ------------------------------ direct messages ----------------------------- */

/**
 * Public keys, one row per browser a person has signed in on. Public halves
 * only: the private halves are generated non-extractable in that browser and
 * never leave it. A DM has to reach someone who is offline, so unlike voice
 * these cannot be swapped live and have to be kept somewhere both can reach.
 */
export const deviceKeys = pgTable(
  'device_keys',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Chosen by the device. Unique per person, not globally. */
    deviceId: text('device_id').notNull(),
    identityKey: text('identity_key').notNull(),
    dmKey: text('dm_key').notNull(),
    signature: text('signature').notNull(),
    /** Another of this person's devices vouching for this one. Both or neither. */
    endorsedBy: text('endorsed_by'),
    endorsement: text('endorsement'),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceId] })],
);

/**
 * A conversation that belongs to people rather than to a server.
 *
 * Kept apart from `channels` on purpose. Every query, permission check and
 * broadcast for a channel starts from its server, and a row with no server
 * would have to be remembered as an exception in all of them. A separate table
 * cannot be reached by that code at all.
 */
export const dmChannels = pgTable(
  'dm_channels',
  {
    id: id(),
    /** "userA:userB", ids sorted, for a one-to-one. Null for a group. */
    pairKey: text('pair_key'),
    lastMessageId: text('last_message_id'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('dm_channels_pair_key').on(table.pairKey)],
);

export const dmMembers = pgTable(
  'dm_members',
  {
    dmId: text('dm_id')
      .notNull()
      .references(() => dmChannels.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: text('last_read_message_id'),
    joinedAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.dmId, table.userId] }),
    index('dm_members_user_idx').on(table.userId),
  ],
);

/** No plaintext column. There is nothing here the server could read. */
export const dmMessages = pgTable(
  'dm_messages',
  {
    id: id(),
    dmId: text('dm_id')
      .notNull()
      .references(() => dmChannels.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderDeviceId: text('sender_device_id').notNull(),
    /** Cleared on delete, like a channel message's body. */
    iv: bytea('iv'),
    ciphertext: bytea('ciphertext'),
    /**
     * Set when this row is a reaction, to the message it reacts to. The server
     * knows that somebody reacted and to what. Which emoji is inside the sealed
     * body with everything else.
     */
    reactionTo: text('reaction_to'),
    createdAt: createdAt(),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('dm_messages_dm_id_idx').on(table.dmId, table.id),
    index('dm_messages_reaction_to_idx').on(table.reactionTo),
  ],
);

/** The message key, locked once for each device allowed to open it. */
export const dmMessageKeys = pgTable(
  'dm_message_keys',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => dmMessages.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    deviceId: text('device_id').notNull(),
    iv: bytea('iv').notNull(),
    wrapped: bytea('wrapped').notNull(),
    /** Null: locked by the device that sent the message. Otherwise the reader's own device that passed it on. */
    wrappedBy: text('wrapped_by'),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.deviceId] })],
);

/**
 * A file sent in a direct message. The bytes in the store were locked in the
 * sender's browser, and the key is inside the sealed message, so this row is
 * all the server knows: that a file of this size exists and which message it
 * hangs from. No name and no type; those are content.
 */
export const dmFiles = pgTable(
  'dm_files',
  {
    id: id(),
    dmId: text('dm_id')
      .notNull()
      .references(() => dmChannels.id, { onDelete: 'cascade' }),
    uploaderId: text('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null while uploaded but not yet sent, as with channel attachments. */
    messageId: text('message_id').references(() => dmMessages.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    size: integer('size').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('dm_files_message_id_idx').on(table.messageId)],
);

export type DmFileRow = typeof dmFiles.$inferSelect;
export type DeviceKeyRow = typeof deviceKeys.$inferSelect;
export type DmChannelRow = typeof dmChannels.$inferSelect;
export type DmMessageRow = typeof dmMessages.$inferSelect;
export type DmMessageKeyRow = typeof dmMessageKeys.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type ServerRow = typeof servers.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type ReactionRow = typeof reactions.$inferSelect;
export type EmojiRow = typeof emojis.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;
export type OverwriteRow = typeof channelOverwrites.$inferSelect;
export type CategoryOverwriteRow = typeof categoryOverwrites.$inferSelect;
