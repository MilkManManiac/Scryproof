/**
 * Building the payload a client needs to render a server.
 *
 * Shared by the REST endpoint and by the gateway's `ready` frame so there is
 * exactly one definition of "what this member can see", rather than two that
 * drift apart and leave a hidden channel visible in one of them.
 */

import { asc, eq, inArray } from 'drizzle-orm';

import { Permission, encodeMask, has } from '@gooffline/shared';
import type { ServerDetail } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { categories, channels, members, roles, servers } from '../db/schema.js';
import {
  computePermissionsForServerChannels,
  loadMemberContext,
  type MemberContext,
} from './permissions.js';
import * as serialize from './serialize.js';

export async function loadServerDetail(
  serverId: string,
  userId: string,
): Promise<ServerDetail | null> {
  const ctx = await loadMemberContext(serverId, userId);
  if (!ctx) return null;
  return buildServerDetail(ctx);
}

export async function buildServerDetail(ctx: MemberContext): Promise<ServerDetail | null> {
  const db = getDb();

  const [serverRow] = await db
    .select()
    .from(servers)
    .where(eq(servers.id, ctx.serverId))
    .limit(1);
  if (!serverRow) return null;

  const [serverRoles, serverCategories, serverChannels, channelPermissions] = await Promise.all([
    db.select().from(roles).where(eq(roles.serverId, ctx.serverId)).orderBy(asc(roles.position)),
    db
      .select()
      .from(categories)
      .where(eq(categories.serverId, ctx.serverId))
      .orderBy(asc(categories.position)),
    db
      .select()
      .from(channels)
      .where(eq(channels.serverId, ctx.serverId))
      .orderBy(asc(channels.position)),
    computePermissionsForServerChannels(ctx),
  ]);

  // The client is never told a channel exists that it may not view. Hiding it
  // in the UI would not be enough: the name alone is information.
  const visibleChannels = serverChannels.filter((channel) => {
    const permissions = channelPermissions.get(channel.id) ?? 0n;
    return has(permissions, Permission.VIEW_CHANNEL);
  });

  const memberRows = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.serverId, ctx.serverId));

  return {
    ...serialize.server(serverRow),
    categories: serverCategories.map(serialize.category),
    channels: visibleChannels.map(serialize.channel),
    roles: serverRoles.map(serialize.role),
    memberCount: memberRows.length,
    permissions: encodeMask(ctx.basePermissions),
  };
}

/** Every server the user belongs to, ready to paint. */
export async function loadAllServerDetails(userId: string): Promise<ServerDetail[]> {
  const db = getDb();

  const memberships = await db
    .select({ serverId: members.serverId })
    .from(members)
    .where(eq(members.userId, userId));

  if (memberships.length === 0) return [];

  const details = await Promise.all(
    memberships.map(async ({ serverId }) => {
      const ctx = await loadMemberContext(serverId, userId);
      if (!ctx) return null;
      return buildServerDetail(ctx);
    }),
  );

  return details
    .filter((detail): detail is ServerDetail => detail !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function serverIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ serverId: members.serverId })
    .from(members)
    .where(eq(members.userId, userId));
  return rows.map((row) => row.serverId);
}

/** Members of a set of servers, deduplicated. Used to scope presence. */
export async function memberIdsForServers(serverIds: readonly string[]): Promise<string[]> {
  if (serverIds.length === 0) return [];
  const rows = await getDb()
    .select({ userId: members.userId })
    .from(members)
    .where(inArray(members.serverId, [...serverIds]));
  return [...new Set(rows.map((row) => row.userId))];
}
