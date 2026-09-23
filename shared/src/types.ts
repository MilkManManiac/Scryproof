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
  /** A line they wrote about what they are up to. Null when they have not. */
  statusText: string | null;
  /** Colour derived from the id, so a user looks the same everywhere. */
  accent: string;
}

export interface SelfUser extends PublicUser {
  totpEnabled: boolean;
  /** A temporary password from a reset is in use; the app asks for a new one first. */
  mustChangePassword: boolean;
  createdAt: Timestamp;
}

/**
 * Somebody you have blocked, as your own list of them shows them. Only ever
 * sent to the person who did the blocking: nobody else is told about it, least
 * of all the person blocked.
 */
export interface BlockedPerson {
  id: Snowflake;
  displayName: string;
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
  /**
   * When a timeout on this member runs out, or null. A time in the past means
   * the timeout is over: nothing clears the column, so both sides read an
   * expired value as no timeout at all.
   */
  timeoutUntil: Timestamp | null;
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
   * Whether @everyone is denied View channel here, so only the roles and
   * people singled out can see it. Read from the overwrites, never stored on
   * its own: the switch and the editor cannot disagree.
   */
  private: boolean;
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

/**
 * An emoji a server uploaded for itself. `:name:` in a message body draws the
 * image; a reaction stores the same `:name:` string.
 *
 * `url` points back at our own API rather than at the object store, for the
 * reason attachments do: the bytes are handed out only to members of the
 * server the emoji belongs to.
 */
export interface Emoji {
  id: Snowflake;
  serverId: Snowflake;
  /** Lowercase letters, digits and underscore. Unique within the server. */
  name: string;
  uploaderId: Snowflake;
  url: string;
  createdAt: Timestamp;
}

/**
 * A short clip a server uploaded for its soundboard, played into a call from
 * the voice bar as a second track, encrypted like the microphone.
 *
 * `url` points at our own API for the reason an emoji's does: the bytes go
 * only to members of the server.
 */
export interface Sound {
  id: Snowflake;
  serverId: Snowflake;
  /** What the tile says. 1 to 32 characters, not necessarily unique. */
  name: string;
  bytes: number;
  createdBy: Snowflake;
  url: string;
  createdAt: Timestamp;
}

/** An answer to "are you coming". `no` is the one the buttons call "Can't". */
export type RsvpAnswer = 'going' | 'maybe' | 'no';

export const RSVP_ANSWERS: readonly RsvpAnswer[] = ['going', 'maybe', 'no'];

/**
 * An event as everyone in the server sees it. The caller's own answer is not
 * part of this, because the same copy is broadcast to every member.
 */
export interface ScheduledEventBase {
  id: Snowflake;
  serverId: Snowflake;
  /**
   * Where it happens. Null when none was set, and also when this member may
   * not see the channel: the id of a hidden channel is not theirs to be told.
   */
  channelId: Snowflake | null;
  title: string;
  note: string;
  startsAt: Timestamp;
  createdBy: Snowflake;
  createdAt: Timestamp;
  counts: Record<RsvpAnswer, number>;
}

/** An event plus the answer of whoever is looking at it. */
export interface ScheduledEvent extends ScheduledEventBase {
  myAnswer: RsvpAnswer | null;
}

/** A server plus everything the client needs to render it. */
export interface ServerDetail extends Server {
  categories: Category[];
  channels: Channel[];
  roles: Role[];
  emojis: Emoji[];
  /** The soundboard, oldest first, so a new clip lands at the end of the grid. */
  sounds: Sound[];
  /** Upcoming events, soonest first. Past ones are never sent. */
  events: ScheduledEvent[];
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
  /**
   * 'roll' is a `/roll` result: the server rolled it, the body is the
   * expression written out plainly, and it cannot be edited. 'poll' is a
   * `/poll` message; the question rides in `content` so search and
   * notifications keep working, and the rest is in `poll`. Everything else
   * is 'text'.
   */
  kind: 'text' | 'roll' | 'poll';
  /** Plaintext body. Null when the channel is end-to-end encrypted. */
  content: string | null;
  /**
   * Present only when `kind` is 'poll'. `counts` and `mine` are read-path
   * data, not stored columns: `counts` is everyone's tally, `mine` is which
   * options the viewer themself picked, so it differs by who is asking.
   */
  poll?: {
    question: string;
    options: string[];
    multiple: boolean;
    closedAt: Timestamp | null;
    counts: number[];
    mine: number[];
  };
  /**
   * Base64 ciphertext, present only for encrypted channels. The server stores
   * and forwards this without ever being able to read it.
   */
  ciphertext: string | null;
  /** Which channel key epoch encrypted this message. */
  keyEpoch: number | null;
  /** base64. The AES-GCM IV of `ciphertext`. Null in a plaintext channel. */
  nonce?: string | null;
  /** The author's device that sealed and signed `ciphertext`. */
  senderDeviceId?: string | null;
  /** base64. That device's identity-key signature over the sealed message. */
  signature?: string | null;
  /**
   * Never sent by the server. Set in the browser after it tries to open a
   * sealed message: 'ok', 'unverified' (signed by a device not yet accepted),
   * 'no-key', 'forged' or 'failed'. When set, `content` is what opened, or null.
   */
  sealed?: 'ok' | 'unverified' | 'no-key' | 'forged' | 'failed';
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
  /** Set while the message is pinned in its channel. */
  pinnedAt: Timestamp | null;
  /** A soft-deleted message keeps its place in the timeline as a tombstone. */
  deleted: boolean;
  /**
   * Whether the person asking has saved this message for themselves. Private
   * to them: filled in on the read path the way a viewer's own reaction would
   * be, and absent (not merely false) when nobody asked from a signed-in
   * context that resolves it.
   */
  bookmarked?: boolean;
}

/** A saved message, with where it lives added so a list of them across servers can say so. */
export interface BookmarkedMessage extends Message {
  serverId: Snowflake;
  channelName: string;
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

/**
 * Live voice state for one person in one call.
 *
 * A call is either in a server's voice channel or inside a direct message
 * conversation. While someone is in one, exactly one of `channelId` and
 * `dmId` is set; the announcement that says they left has both null. A
 * person is in at most one call at a time, wherever it is.
 */
export interface VoiceState {
  userId: Snowflake;
  /** The server whose voice channel the call is in. Null for a call in a direct message. */
  serverId: Snowflake | null;
  channelId: Snowflake | null;
  /** The conversation the call is in. Null for a call in a server. */
  dmId: Snowflake | null;
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
  /**
   * Another of the same person's devices vouching for this one, so the people
   * they talk to need not be asked again. The server stores it and cannot make
   * one: it is a signature by a key that never leaves a member's machine.
   */
  endorsedBy?: DeviceEndorsement | null;
}

export interface DeviceEndorsement {
  deviceId: string;
  /** base64. The endorsing identity key's signature over the endorsed one. */
  signature: string;
}

export interface DmChannel {
  id: Snowflake;
  /**
   * 'pair' is two people, found again by who they are. 'group' is three or
   * more, made on purpose; people can be added and can leave.
   */
  kind: 'pair' | 'group';
  /** A group's name if it was given one. Stored in the clear, unlike the messages. */
  title: string | null;
  /** Everyone in it, including the person asking. */
  members: PublicUser[];
  lastMessageId: Snowflake | null;
  /** How far the person asking has read. */
  lastReadMessageId: Snowflake | null;
  createdAt: Timestamp;
}

/** A message key, locked for exactly one device. */
/**
 * An encrypted channel's key for one epoch, as the server knows it: who made
 * it and their signed commitment, never the key. `docs/channel-e2ee.md`.
 */
export interface ChannelEpoch {
  epoch: number;
  creatorId: Snowflake;
  creatorDeviceId: string;
  /** base64 */
  commitment: string;
  /** base64 */
  signature: string;
}

/** One device's locked copy of one epoch's key. */
export interface ChannelKeyCopy {
  epoch: number;
  userId: Snowflake;
  deviceId: string;
  wrapperId: Snowflake;
  wrapperDeviceId: string;
  /** base64 */
  iv: string;
  /** base64 */
  key: string;
}

/** Everything a device needs to read and send in an encrypted channel. */
export interface ChannelKeyState {
  /** The epoch new messages must be sealed under. */
  current: number;
  /** Every epoch that has been made, oldest first. */
  epochs: ChannelEpoch[];
  /** This device's copies (and its recovery phrase's), every epoch it has one for. */
  keys: ChannelKeyCopy[];
  /** Who holds the current epoch's key: what the "who can read this" list draws. */
  holders: { userId: Snowflake; deviceId: string }[];
}

/** A copy some device can read the channel with and does not have yet. */
export interface ChannelKeyWant {
  epoch: number;
  userId: Snowflake;
  deviceId: string;
}

export interface DmWrappedKey {
  userId: Snowflake;
  deviceId: string;
  /** base64 */
  iv: string;
  /** base64 */
  key: string;
  /**
   * Set when the copy was not made by the device that sent the message but by
   * one of the reader's own devices, passing on a key it could already open.
   * That is how history reaches a recovery phrase made after the fact.
   */
  wrappedBy?: string | null;
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
  /**
   * Set when this is a reaction: the message it reacts to. The emoji is inside
   * the sealed body. A reaction is never listed among a conversation's messages.
   */
  reactionTo: Snowflake | null;
  createdAt: Timestamp;
  editedAt: Timestamp | null;
  deleted: boolean;
}
