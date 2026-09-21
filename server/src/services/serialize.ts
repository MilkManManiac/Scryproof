/**
 * Row to wire conversion.
 *
 * Every response goes through here. That is the point: it is a single place to
 * be sure a password hash, a TOTP seed or a session token never leaves the
 * process, and a single place where bigint masks become strings so JSON does
 * not silently round them.
 */

import { encodeMask } from '@scryproof/shared';
import type {
  Attachment,
  Category,
  Channel,
  Invite,
  Member,
  Message,
  PublicUser,
  Reaction,
  ReplyPreview,
  Role,
  SelfUser,
  Server,
} from '@scryproof/shared';

import { accentForId } from '../lib/crypto.js';
import type {
  AttachmentRow,
  CategoryRow,
  ChannelRow,
  InviteRow,
  MemberRow,
  MessageRow,
  RoleRow,
  ServerRow,
  User,
} from '../db/schema.js';

const iso = (value: Date | null | undefined): string | null =>
  value ? new Date(value).toISOString() : null;

const isoRequired = (value: Date): string => new Date(value).toISOString();

export function publicUser(row: User): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    statusText: row.statusText,
    accent: accentForId(row.id),
  };
}

export function selfUser(row: User): SelfUser {
  return {
    ...publicUser(row),
    totpEnabled: row.totpEnabled,
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

export function channel(row: ChannelRow): Channel {
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
    lastMessageId: row.lastMessageId,
    createdAt: isoRequired(row.createdAt),
  };
}

export function member(row: MemberRow, user: User, roleIds: string[]): Member {
  return {
    userId: row.userId,
    serverId: row.serverId,
    nickname: row.nickname,
    roleIds,
    joinedAt: isoRequired(row.joinedAt),
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
  extras: { reactions?: Reaction[]; replyTo?: ReplyPreview | null } = {},
): Message {
  const deleted = row.deletedAt !== null;

  return {
    id: row.id,
    channelId: row.channelId,
    authorId: row.authorId,
    author: publicUser(author),
    // A deleted message keeps its place in the timeline so replies still point
    // at something, but its body never goes back out over the wire.
    content: deleted ? null : row.content,
    ciphertext: deleted || !row.ciphertext ? null : row.ciphertext.toString('base64'),
    keyEpoch: row.keyEpoch,
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
