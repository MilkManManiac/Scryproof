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
  /**
   * Whether message bodies in this channel are end-to-end encrypted. Voice is
   * always encrypted; this flag is about text, and drives Milestone 7.
   */
  encrypted: boolean;
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
