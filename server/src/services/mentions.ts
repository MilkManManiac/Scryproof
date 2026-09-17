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

import { eq } from 'drizzle-orm';

import { Permission, has, parseMentions } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { members } from '../db/schema.js';
import { computePermissionsInChannel, loadMemberContext } from './permissions.js';

export interface ResolvedMentions {
  userIds: string[];
  everyone: boolean;
}

export const NO_MENTIONS: ResolvedMentions = { userIds: [], everyone: false };

export function resolveMentions(input: {
  content: string | null;
  senderId: string;
  /** Everyone who belongs to the server the message is in. */
  memberIds: ReadonlySet<string>;
  canMentionEveryone: boolean;
  /** The author of the message being replied to, if this is a reply. */
  replyAuthorId: string | null;
}): ResolvedMentions {
  const parsed = input.content ? parseMentions(input.content) : { userIds: [], everyone: false };

  const userIds = new Set<string>();
  for (const userId of parsed.userIds) {
    if (input.memberIds.has(userId)) userIds.add(userId);
  }
  // A reply is addressed to someone, whether or not the body names them.
  if (input.replyAuthorId && input.memberIds.has(input.replyAuthorId)) {
    userIds.add(input.replyAuthorId);
  }
  userIds.delete(input.senderId);

  return { userIds: [...userIds], everyone: parsed.everyone && input.canMentionEveryone };
}

export async function serverMemberIds(serverId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.serverId, serverId));
  return new Set(rows.map((row) => row.userId));
}

/** The people whose mention count goes up: pinged, able to see the channel, and not the sender. */
export async function pingTargets(input: {
  serverId: string;
  channelId: string;
  categoryId: string | null;
  senderId: string;
  mentions: ResolvedMentions;
  memberIds: ReadonlySet<string>;
}): Promise<string[]> {
  const candidates = input.mentions.everyone ? [...input.memberIds] : input.mentions.userIds;

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
