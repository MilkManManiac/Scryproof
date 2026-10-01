/**
 * Who a message pings.
 *
 * The body says who the sender wanted to reach. This decides who they actually
 * reach, and the two differ on purpose: an id that is not a member here is
 * noise, the sender never pings themselves, and `@everyone` is a permission,
 * not a string anybody can type.
 *
 * `resolveMentions` is pure so the rules can be tested without a database.
 * `pingTargets` is the part that needs one: a ping is only delivered to
 * someone who can see the channel, or an unread badge would reveal that a
 * hidden channel exists and that someone in it is talking about you.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { Permission, has, parseMentions } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { memberRoles, members, roles } from '../db/schema.js';
import { blockersOf, withoutBlockers } from './blocks.js';
import { computePermissionsInChannel, loadMemberContext } from './permissions.js';

export interface ResolvedMentions {
  userIds: string[];
  /** Roles pinged: every member holding one is reached. Only roles the sender was allowed to ping. */
  roleIds: string[];
  everyone: boolean;
}

export const NO_MENTIONS: ResolvedMentions = { userIds: [], roleIds: [], everyone: false };

/** The part of a role this needs to know. */
export interface PingableRole {
  id: string;
  mentionable: boolean;
  isEveryone: boolean;
}

/**
 * The roles this sender may ping: ones marked mentionable, or any at all if
 * they hold MENTION_EVERYONE. The @everyone role is never one: it has its own
 * word, and its own permission check, already.
 */
export function pingableRoleIds(serverRoles: readonly PingableRole[], canMentionEveryone: boolean): Set<string> {
  return new Set(
    serverRoles.filter((role) => !role.isEveryone && (role.mentionable || canMentionEveryone)).map((role) => role.id),
  );
}

export function resolveMentions(input: {
  content: string | null;
  senderId: string;
  /** Everyone who belongs to the server the message is in. */
  memberIds: ReadonlySet<string>;
  canMentionEveryone: boolean;
  /** Every role of the server the message is in. */
  serverRoles: readonly PingableRole[];
  /** The author of the message being replied to, if this is a reply. */
  replyAuthorId: string | null;
}): ResolvedMentions {
  const parsed = input.content ? parseMentions(input.content) : { userIds: [], roleIds: [], everyone: false };

  const userIds = new Set<string>();
  for (const userId of parsed.userIds) {
    if (input.memberIds.has(userId)) userIds.add(userId);
  }
  // A reply is addressed to someone, whether or not the body names them.
  if (input.replyAuthorId && input.memberIds.has(input.replyAuthorId)) {
    userIds.add(input.replyAuthorId);
  }
  userIds.delete(input.senderId);

  // A role this sender may not ping stays as text in the body: no ping, and
  // no error, the same as a person who is not here.
  const pingable = pingableRoleIds(input.serverRoles, input.canMentionEveryone);
  const roleIds = parsed.roleIds.filter((roleId) => pingable.has(roleId));

  return { userIds: [...userIds], roleIds, everyone: parsed.everyone && input.canMentionEveryone };
}

export async function serverRoleList(serverId: string): Promise<PingableRole[]> {
  return getDb()
    .select({ id: roles.id, mentionable: roles.mentionable, isEveryone: roles.isEveryone })
    .from(roles)
    .where(eq(roles.serverId, serverId));
}

export async function serverMemberIds(serverId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.serverId, serverId));
  return new Set(rows.map((row) => row.userId));
}

/**
 * The people whose mention count goes up: pinged, able to see the channel, not
 * the sender, and not anyone who has blocked the sender. Somebody who blocked
 * this author stays a member of the server and is still in `@everyone`; what
 * blocking takes away is being reached by them.
 */
export async function pingTargets(input: {
  serverId: string;
  channelId: string;
  categoryId: string | null;
  senderId: string;
  mentions: ResolvedMentions;
  memberIds: ReadonlySet<string>;
}): Promise<string[]> {
  let wanted: string[];
  if (input.mentions.everyone) {
    wanted = [...input.memberIds];
  } else {
    const wantedSet = new Set(input.mentions.userIds);
    if (input.mentions.roleIds.length > 0) {
      // Everyone holding a pinged role, once, even if they are also named.
      const holders = await getDb()
        .select({ userId: memberRoles.userId })
        .from(memberRoles)
        .where(and(eq(memberRoles.serverId, input.serverId), inArray(memberRoles.roleId, input.mentions.roleIds)));
      for (const holder of holders) if (input.memberIds.has(holder.userId)) wantedSet.add(holder.userId);
    }
    wanted = [...wantedSet];
  }
  const candidates = withoutBlockers(wanted, await blockersOf(input.senderId));

  const targets: string[] = [];
  for (const userId of candidates) {
    if (userId === input.senderId) continue;
    const ctx = await loadMemberContext(input.serverId, userId);
    if (!ctx) continue;
    const permissions = await computePermissionsInChannel(ctx, input.channelId, input.categoryId);
    if (has(permissions, Permission.VIEW_CHANNEL)) targets.push(userId);
  }
  return targets;
}
