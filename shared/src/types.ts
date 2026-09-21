/**
 * Wire types. Everything the server sends the client and vice versa is shaped
 * here so both sides break at compile time instead of at runtime.
 *
 * Rules that hold across every type in this file:
 *   - ids are uuid strings
 *   - timestamps are ISO 8601 strings in UTC
 *   - permission masks are decimal strings, never numbers (they exceed 2^53)
 */

export type Snowflake = string;
export type Timestamp = string;
/** A permission bitmask, decimal-encoded. Decode with decodeMask(). */
export type MaskString = string;

export interface PublicUser {
  id: Snowflake;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Colour derived from the id, so a user looks the same everywhere. */
  accent: string;
}

export interface SelfUser extends PublicUser {
  totpEnabled: boolean;
  createdAt: Timestamp;
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface Presence {
  userId: Snowflake;
  status: PresenceStatus;
}

export interface Role {
  id: Snowflake;
  serverId: Snowflake;
  name: string;
  color: string | null;
  position: number;
  permissions: MaskString;
  hoist: boolean;
  mentionable: boolean;
  isEveryone: boolean;
}

export interface Member {
  userId: Snowflake;
  serverId: Snowflake;
  nickname: string | null;
  roleIds: Snowflake[];
  joinedAt: Timestamp;
  user: PublicUser;
}

export type ChannelType = 'text' | 'voice';

export interface ChannelOverwrite {
  targetType: 'role' | 'member';
  targetId: Snowflake;
  allow: MaskString;
  deny: MaskString;
}

export interface Channel {
  id: Snowflake;
  serverId: Snowflake;
  categoryId: Snowflake | null;
  type: ChannelType;
  name: string;
  topic: string | null;
  position: number;
  /** Minimum seconds between messages from one member. Zero means no limit. */
  slowmodeSeconds: number;
  /**
   * Whether message bodies in this channel are end-to-end encrypted. Voice is
   * always encrypted; this flag is about text, and drives Milestone 7.
   */
  encrypted: boolean;
  /**
   * The newest message in the channel, deleted or not. Ids sort by time, so
   * comparing this with a reader's last-read id is the whole unread check.
   */
  lastMessageId: Snowflake | null;
  createdAt: Timestamp;
}

export interface Category {
  id: Snowflake;
  serverId: Snowflake;
  name: string;
  position: number;
}

export interface Server {
  id: Snowflake;
  name: string;
  iconUrl: string | null;
  ownerId: Snowflake;
  createdAt: Timestamp;
}

/** A server plus everything the client needs to render it. */
export interface ServerDetail extends Server {
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  memberCount: number;
  /** The caller's own effective server-wide permissions. */
  permissions: MaskString;
}

export interface Attachment {
  id: Snowflake;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
}

/** One emoji on one message, and everyone who put it there. */
export interface Reaction {
  emoji: string;
  /** In the order they reacted. The count is this list's length. */
  userIds: Snowflake[];
}

/** Enough of the message being replied to, to draw the line above a reply. */
export interface ReplyPreview {
  id: Snowflake;
  authorId: Snowflake;
  authorName: string;
  /** The first stretch of the body. Null when deleted, encrypted, or only files. */
  content: string | null;
  deleted: boolean;
}

/** How far one person has read in one channel. Theirs alone; nobody else sees it. */
export interface ReadState {
  channelId: Snowflake;
  lastReadMessageId: Snowflake | null;
  mentionCount: number;
}

export interface Message {
  id: Snowflake;
  channelId: Snowflake;
  authorId: Snowflake;
  author: PublicUser;
  /** Plaintext body. Null when the channel is end-to-end encrypted. */
  content: string | null;
  /**
   * Base64 ciphertext, present only for encrypted channels. The server stores
   * and forwards this without ever being able to read it.
   */
  ciphertext: string | null;
  /** Which channel key epoch encrypted this message. */
  keyEpoch: number | null;
  attachments: Attachment[];
  replyToId: Snowflake | null;
  /** Null when this is not a reply, or the parent is gone entirely. */
  replyTo: ReplyPreview | null;
  reactions: Reaction[];
  /**
   * Who this message pings, worked out by the server from the body: members it
   * names, plus the author of the message it replies to. Never the sender.
   * Always empty in an encrypted channel, where the server cannot read the body.
   */
  mentions: Snowflake[];
  /** True only if the body says @everyone AND the sender was allowed to. */
  mentionsEveryone: boolean;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  /** A soft-deleted message keeps its place in the timeline as a tombstone. */
  deleted: boolean;
}

export interface Invite {
  code: string;
  serverId: Snowflake | null;
  createdBy: Snowflake;
  uses: number;
  maxUses: number | null;
  expiresAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface AuditLogEntry {
  id: Snowflake;
  serverId: Snowflake;
  actorId: Snowflake;
  actor: PublicUser | null;
  action: string;
  targetType: string | null;
  targetId: Snowflake | null;
  changes: Record<string, unknown> | null;
  createdAt: Timestamp;
}

/** Live voice state for one member in one voice channel. */
export interface VoiceState {
  userId: Snowflake;
  serverId: Snowflake;
  channelId: Snowflake | null;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  serverDeaf: boolean;
  sharingScreen: boolean;
  cameraOn: boolean;
}

/* ------------------------------ direct messages ----------------------------- */

/**
 * The public half of one device, as its owner published it. The server stores
 * and hands these out, which makes it the one place a key could be swapped:
 * that is why `signature` exists, and why every client remembers the identity
 * key it saw first and says so when it changes.
 */
export interface DeviceKey {
  userId: Snowflake;
  deviceId: string;
  /** SPKI, base64. The long-lived signing key voice already uses. */
  identityKey: string;
  /** SPKI, base64. The long-lived ECDH key DMs are locked to. */
  dmKey: string;
  /** The identity key's signature over the user, the device and both keys. */
  signature: string;
}

export interface DmChannel {
  id: Snowflake;
  /** Everyone in it, including the person asking. */
  members: PublicUser[];
  lastMessageId: Snowflake | null;
  /** How far the person asking has read. */
  lastReadMessageId: Snowflake | null;
  createdAt: Timestamp;
}

/** A message key, locked for exactly one device. */
export interface DmWrappedKey {
  userId: Snowflake;
  deviceId: string;
  /** base64 */
  iv: string;
  /** base64 */
  key: string;
}

/**
 * A direct message. There is no plaintext field and there never will be: the
 * server is handed `ciphertext` and cannot open it.
 */
export interface DmMessage {
  id: Snowflake;
  dmId: Snowflake;
  authorId: Snowflake;
  senderDeviceId: string;
  /** base64. Null once deleted. */
  iv: string | null;
  /** base64. Null once deleted. */
  ciphertext: string | null;
  /** Only the copies addressed to the person receiving this. */
  keys: DmWrappedKey[];
  createdAt: Timestamp;
  deleted: boolean;
}
