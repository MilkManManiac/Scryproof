/**
 * Effective-permission resolution.
 *
 * This module is the only place in the codebase allowed to answer "may this
 * user do this". Route handlers call `requireChannelPermission` or
 * `requireServerPermission` and get either a resolved context or an error.
 * Nothing trusts a value that came from the client.
 */

import { and, eq, inArray } from 'drizzle-orm';

import {
  ALL_PERMISSIONS,
  applyChannelOverwrites,
  computeBasePermissions,
  canActOn,
  has,
  normalizeChannelPermissions,
  Permission,
  type OverwriteLike,
  type RoleLike,
} from '@scryproof/shared';

import { getDb } from '../db/index.js';
import {
  categoryOverwrites,
  channelOverwrites,
  channels,
  memberRoles,
  members,
  roles,
  servers,
} from '../db/schema.js';
import { HttpError } from '../lib/http-error.js';

export interface MemberContext {
  userId: string;
  serverId: string;
  isOwner: boolean;
  /** Roles held, including @everyone. */
  roles: RoleLike[];
  everyoneRoleId: string;
  /** Server-wide permissions, before channel overwrites. */
  basePermissions: bigint;
}

/**
 * Load everything needed to reason about one member in one server. Three
 * small indexed queries; at our scale that is cheaper and far clearer than a
 * single clever join.
 */
export async function loadMemberContext(
  serverId: string,
  userId: string,
): Promise<MemberContext | null> {
  const db = getDb();

  const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) return null;

  const [membership] = await db
    .select()
    .from(members)
    .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
    .limit(1);
  if (!membership) return null;

  const serverRoles = await db.select().from(roles).where(eq(roles.serverId, serverId));

  const everyone = serverRoles.find((role) => role.isEveryone);
  if (!everyone) {
    // Structurally impossible: every server is created with an @everyone role
    // in the same transaction. If it happens, fail loudly rather than
    // silently granting or denying.
    throw new Error(`Server ${serverId} has no @everyone role.`);
  }

  const heldRows = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)));

  const heldIds = new Set(heldRows.map((row) => row.roleId));
  heldIds.add(everyone.id);

  const held: RoleLike[] = serverRoles
    .filter((role) => heldIds.has(role.id))
    .map((role) => ({
      id: role.id,
      permissions: role.permissions,
      position: role.position,
      isEveryone: role.isEveryone,
    }));

  const isOwner = server.ownerId === userId;

  return {
    userId,
    serverId,
    isOwner,
    roles: held,
    everyoneRoleId: everyone.id,
    basePermissions: computeBasePermissions({ isOwner, roles: held }),
  };
}

/** Rows out of either overwrite table, narrowed to the shape the algebra wants. */
function toOverwrites(
  rows: readonly { targetType: string; targetId: string; allow: bigint; deny: bigint }[],
): OverwriteLike[] {
  return rows.map((row) => ({
    targetType: row.targetType === 'member' ? 'member' : 'role',
    targetId: row.targetId,
    allow: row.allow,
    deny: row.deny,
  }));
}

export async function loadChannelOverwrites(channelId: string): Promise<OverwriteLike[]> {
  const rows = await getDb()
    .select()
    .from(channelOverwrites)
    .where(eq(channelOverwrites.channelId, channelId));

  return toOverwrites(rows);
}

export async function loadCategoryOverwrites(
  categoryId: string | null | undefined,
): Promise<OverwriteLike[]> {
  if (!categoryId) return [];

  const rows = await getDb()
    .select()
    .from(categoryOverwrites)
    .where(eq(categoryOverwrites.categoryId, categoryId));

  return toOverwrites(rows);
}

/**
 * Effective permissions for a member inside one channel, with the
 * VIEW_CHANNEL rule applied: losing visibility takes everything else with it,
 * so a hidden channel can never hand out a voice token.
 */
export async function computePermissionsInChannel(
  ctx: MemberContext,
  channelId: string,
  /**
   * The channel's category, when the caller already has the row. Pass it to
   * avoid a second lookup; leave it `undefined` and this will fetch it. `null`
   * means the caller knows the channel sits outside every category.
   */
  categoryId?: string | null,
): Promise<bigint> {
  if (ctx.isOwner) return ALL_PERMISSIONS;
  if (has(ctx.basePermissions, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;

  let category = categoryId;
  if (category === undefined) {
    const [channel] = await getDb()
      .select({ categoryId: channels.categoryId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    category = channel?.categoryId ?? null;
  }

  const [overwrites, categoryLevel] = await Promise.all([
    loadChannelOverwrites(channelId),
    loadCategoryOverwrites(category),
  ]);

  const effective = applyChannelOverwrites({
    basePermissions: ctx.basePermissions,
    everyoneRoleId: ctx.everyoneRoleId,
    memberRoleIds: ctx.roles.filter((role) => !role.isEveryone).map((role) => role.id),
    userId: ctx.userId,
    overwrites,
    categoryOverwrites: categoryLevel,
  });

  return normalizeChannelPermissions(effective);
}

/** Permissions for every channel in a server, for painting the sidebar. */
export async function computePermissionsForServerChannels(
  ctx: MemberContext,
): Promise<Map<string, bigint>> {
  const db = getDb();
  const result = new Map<string, bigint>();

  const serverChannels = await db
    .select({ id: channels.id, categoryId: channels.categoryId })
    .from(channels)
    .where(eq(channels.serverId, ctx.serverId));

  if (serverChannels.length === 0) return result;

  if (ctx.isOwner || has(ctx.basePermissions, Permission.ADMINISTRATOR)) {
    for (const channel of serverChannels) result.set(channel.id, ALL_PERMISSIONS);
    return result;
  }

  // One query for every overwrite in the server, grouped in memory. Avoids a
  // query per channel when a server has dozens of them.
  const allOverwrites = await db
    .select()
    .from(channelOverwrites)
    .where(
      inArray(
        channelOverwrites.channelId,
        serverChannels.map((channel) => channel.id),
      ),
    );

  const byChannel = new Map<string, OverwriteLike[]>();
  for (const row of allOverwrites) {
    const list = byChannel.get(row.channelId) ?? [];
    list.push(...toOverwrites([row]));
    byChannel.set(row.channelId, list);
  }

  // Same trick one level up: every category overwrite in the server in one
  // query, grouped in memory. A server with twenty categories should not cost
  // twenty round trips to paint its sidebar once.
  const categoryIds = [
    ...new Set(
      serverChannels
        .map((channel) => channel.categoryId)
        .filter((categoryId): categoryId is string => categoryId !== null),
    ),
  ];

  const byCategory = new Map<string, OverwriteLike[]>();
  if (categoryIds.length > 0) {
    const rows = await db
      .select()
      .from(categoryOverwrites)
      .where(inArray(categoryOverwrites.categoryId, categoryIds));

    for (const row of rows) {
      const list = byCategory.get(row.categoryId) ?? [];
      list.push(...toOverwrites([row]));
      byCategory.set(row.categoryId, list);
    }
  }

  const memberRoleIds = ctx.roles.filter((role) => !role.isEveryone).map((role) => role.id);

  for (const channel of serverChannels) {
    const effective = applyChannelOverwrites({
      basePermissions: ctx.basePermissions,
      everyoneRoleId: ctx.everyoneRoleId,
      memberRoleIds,
      userId: ctx.userId,
      overwrites: byChannel.get(channel.id) ?? [],
      categoryOverwrites: channel.categoryId ? byCategory.get(channel.categoryId) ?? [] : [],
    });
    result.set(channel.id, normalizeChannelPermissions(effective));
  }

  return result;
}

export async function requireMember(serverId: string, userId: string): Promise<MemberContext> {
  const ctx = await loadMemberContext(serverId, userId);
  // A non-member and a non-existent server return the same error on purpose:
  // otherwise the API confirms which server ids are real.
  if (!ctx) throw new HttpError(404, 'unknown_server', 'That server does not exist.');
  return ctx;
}

export async function requireServerPermission(
  serverId: string,
  userId: string,
  wanted: bigint,
): Promise<MemberContext> {
  const ctx = await requireMember(serverId, userId);
  if (!has(ctx.basePermissions, wanted)) {
    throw new HttpError(403, 'missing_permissions', 'You do not have permission to do that.');
  }
  return ctx;
}

export interface ChannelContext extends MemberContext {
  channelId: string;
  channelPermissions: bigint;
}

export async function requireChannelPermission(
  channelId: string,
  userId: string,
  wanted: bigint,
): Promise<ChannelContext> {
  const db = getDb();
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) throw new HttpError(404, 'unknown_channel', 'That channel does not exist.');

  const ctx = await loadMemberContext(channel.serverId, userId);
  if (!ctx) throw new HttpError(404, 'unknown_channel', 'That channel does not exist.');

  const channelPermissions = await computePermissionsInChannel(ctx, channelId, channel.categoryId);

  // Not being able to see a channel reports as "does not exist", so the API
  // never reveals the names or ids of channels a member was not meant to know
  // about.
  if (!has(channelPermissions, Permission.VIEW_CHANNEL)) {
    throw new HttpError(404, 'unknown_channel', 'That channel does not exist.');
  }

  if (!has(channelPermissions, wanted)) {
    throw new HttpError(403, 'missing_permissions', 'You do not have permission to do that.');
  }

  return { ...ctx, channelId, channelPermissions };
}

/**
 * Hierarchy check for moderation and role editing. You may only act on someone
 * strictly below your highest role, and never on the owner.
 */
export async function requireHigherThan(
  actor: MemberContext,
  targetUserId: string,
): Promise<void> {
  const target = await loadMemberContext(actor.serverId, targetUserId);
  if (!target) throw new HttpError(404, 'unknown_member', 'That member is not in this server.');

  if (!canActOn(actor, target)) {
    throw new HttpError(
      403,
      'role_hierarchy',
      'That member has a role equal to or higher than yours.',
    );
  }
}

/** Editing or assigning a role requires outranking it. */
export function requireRoleBelow(actor: MemberContext, rolePosition: number): void {
  if (actor.isOwner) return;
  const highest = actor.roles.reduce((max, role) => Math.max(max, role.position), -1);
  if (rolePosition >= highest) {
    throw new HttpError(403, 'role_hierarchy', 'That role is equal to or above your highest role.');
  }
}
