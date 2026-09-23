/**
 * Row to wire conversion.
 *
 * Every response goes through here. That is the point: it is a single place to
 * be sure a password hash, a TOTP seed or a session token never leaves the
 * process, and a single place where bigint masks become strings so JSON does
 * not silently round them.
 */

import { encodeMask, houseRules } from '@scryproof/shared';
import type {
  Attachment,
  Category,
  Channel,
  Emoji,
  Invite,
  Member,
  Message,
  PublicUser,
  Reaction,
  ReplyPreview,
  Role,
  SelfUser,
  Server,
  Sound,
} from '@scryproof/shared';

import { accentForId } from '../lib/crypto.js';
import type {
  AttachmentRow,
  CategoryRow,
  ChannelRow,
  EmojiRow,
  InviteRow,
  MemberRow,
  MessageRow,
  RoleRow,
  ServerRow,
  SoundRow,
  User,
} from '../db/schema.js';
import type { PollTally } from './polls.js';

const iso = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

const isoRequired = (value: Date): string => new Date(value).toISOString();

export function publicUser(row: User): PublicUser {
  return {
    id: row.id,
    username: row.username,
    // The house rule holds for names too: someone called BigBaller is shown
    // as what the joke says they are, everywhere, without touching the row.
    displayName: houseRules(row.displayName),
    avatarUrl: row.avatarUrl,
    statusText: row.statusText === null ? null : houseRules(row.statusText),
    accent: accentForId(row.id),
  };
}

export function selfUser(row: User): SelfUser {
  return {
    ...publicUser(row),
    totpEnabled: row.totpEnabled,
    mustChangePassword: row.mustChangePassword,
    createdAt: isoRequired(row.createdAt),
  };
}

export function server(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    iconUrl: row.iconUrl,
    ownerId: row.ownerId,
    createdAt: isoRequired(row.createdAt),
  };
}

export function role(row: RoleRow): Role {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    color: row.color,
    position: row.position,
    permissions: encodeMask(row.permissions),
    hoist: row.hoist,
    mentionable: row.mentionable,
    isEveryone: row.isEveryone,
  };
}

export function category(row: CategoryRow): Category {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    position: row.position,
  };
}

export function channel(row: ChannelRow, isPrivate = false): Channel {
  return {
    id: row.id,
    serverId: row.serverId,
    categoryId: row.categoryId,
    type: row.type === 'voice' ? 'voice' : 'text',
    name: row.name,
    topic: row.topic,
    position: row.position,
    slowmodeSeconds: row.slowmodeSeconds,
    encrypted: row.encrypted,
    private: isPrivate,
    lastMessageId: row.lastMessageId,
    createdAt: isoRequired(row.createdAt),
  };
}

/**
 * The address is built from the id alone. An id never comes to point at
 * different bytes, which is what lets the image route cache for a long time.
 */
export function emoji(row: EmojiRow): Emoji {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    uploaderId: row.uploaderId,
    url: `/api/emojis/${row.id}/image`,
    createdAt: isoRequired(row.createdAt),
  };
}

/**
 * The name rides in the address only so a saved copy gets a sensible file
 * name; the route finds the clip by id alone. A rename changes the address,
 * which is harmless: the client refetches the list on `sounds_changed`.
 */
export function sound(row: SoundRow): Sound {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    bytes: row.bytes,
    createdBy: row.createdBy,
    url: `/api/sounds/${row.id}/${encodeURIComponent(row.name)}`,
    createdAt: isoRequired(row.createdAt),
  };
}

export function member(row: MemberRow, user: User, roleIds: string[]): Member {
  return {
    userId: row.userId,
    serverId: row.serverId,
    nickname: row.nickname === null ? null : houseRules(row.nickname),
    roleIds,
    joinedAt: isoRequired(row.joinedAt),
    timeoutUntil: iso(row.timeoutUntil),
    user: publicUser(user),
  };
}

export function attachment(row: AttachmentRow, url: string): Attachment {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    width: row.width,
    height: row.height,
    url,
  };
}

export function message(
  row: MessageRow,
  author: User,
  attachments: Attachment[] = [],
  extras: { reactions?: Reaction[]; replyTo?: ReplyPreview | null; bookmarked?: boolean; poll?: PollTally } = {},
): Message {
  const deleted = row.deletedAt !== null;
  const kind = row.kind === 'roll' ? 'roll' : row.kind === 'poll' ? 'poll' : 'text';

  return {
    id: row.id,
    channelId: row.channelId,
    authorId: row.authorId,
    author: publicUser(author),
    kind,
    // A deleted message keeps its place in the timeline so replies still point
    // at something, but its body never goes back out over the wire.
    content: deleted ? null : row.content,
    ciphertext: deleted || !row.ciphertext ? null : Buffer.from(row.ciphertext).toString('base64'),
    keyEpoch: row.keyEpoch,
    nonce: deleted || !row.nonce ? null : Buffer.from(row.nonce).toString('base64'),
    senderDeviceId: deleted ? null : row.senderDeviceId,
    signature: deleted || !row.signature ? null : Buffer.from(row.signature).toString('base64'),
    // A deleted poll keeps no tally either: nothing left to vote on or read.
    poll:
      deleted || kind !== 'poll' || !row.poll
        ? undefined
        : {
            question: row.poll.question,
            options: row.poll.options,
            multiple: row.poll.multiple,
            closedAt: row.poll.closedAt,
            counts: extras.poll?.counts ?? new Array(row.poll.options.length).fill(0),
            mine: extras.poll?.mine ?? [],
          },
    attachments: deleted ? [] : attachments,
    replyToId: row.replyToId,
    replyTo: extras.replyTo ?? null,
    // A tombstone pings nobody and carries nobody's reactions.
    reactions: deleted ? [] : (extras.reactions ?? []),
    mentions: deleted ? [] : row.mentions,
    mentionsEveryone: deleted ? false : row.mentionsEveryone,
    createdAt: isoRequired(row.createdAt),
    editedAt: iso(row.editedAt),
    pinnedAt: deleted ? null : iso(row.pinnedAt),
    deleted,
    bookmarked: extras.bookmarked,
  };
}

export function invite(row: InviteRow): Invite {
  return {
    code: row.code,
    serverId: row.serverId,
    createdBy: row.createdBy,
    uses: row.uses,
    maxUses: row.maxUses,
    expiresAt: iso(row.expiresAt),
    createdAt: isoRequired(row.createdAt),
  };
}
