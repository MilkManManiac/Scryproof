/**
 * Server endpoints: the list, creation, settings, members, audit log.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, validateServerName } from '@scryproof/shared';
import type { Member } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { bans, memberRoles, members, servers, users } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import {
  requireMember,
  requireHigherThan,
  requireServerPermission,
} from '../services/permissions.js';
import { buildServerDetail, loadAllServerDetails, loadServerDetail } from '../services/server-detail.js';
import {
  addMember,
  canCreateServers,
  createServer,
  deleteServer,
  leaveServer,
  removeMember,
  transferOwnership,
} from '../services/servers.js';

/** Members plus their roles, in one pass rather than a query per member. */
async function listMembers(serverId: string): Promise<Member[]> {
  const db = getDb();

  const rows = await db
    .select({ member: members, user: users })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(eq(members.serverId, serverId));

  if (rows.length === 0) return [];

  const roleRows = await db
    .select()
    .from(memberRoles)
    .where(eq(memberRoles.serverId, serverId));

  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push(row.roleId);
    rolesByUser.set(row.userId, list);
  }

  return rows
    .map(({ member, user }) => serialize.member(member, user, rolesByUser.get(user.id) ?? []))
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
}

export async function registerServerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/servers', async (request) => {
    const user = requireUser(request);
    return { servers: await loadAllServerDetails(user.id) };
  });

  app.post('/api/servers', async (request) => {
    const user = requireUser(request);
    const body = z.object({ name: z.string().min(1).max(100) }).parse(request.body);
    if (!(await canCreateServers(user.id))) {
      throw forbidden('Only the host can make new servers for now. Ask for an invite instead.');
    }

    const created = await createServer({ name: body.name, ownerId: user.id });
    const detail = await loadServerDetail(created.id, user.id);
    if (!detail) throw badRequest('Could not create the server.', 'create_failed');

    hub.addUserToServer(user.id, created.id);
    hub.sendToUser(user.id, { t: 'server_create', d: detail });

    return { server: detail };
  });

  app.get('/api/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    const detail = await loadServerDetail(serverId, user.id);
    // Not a member reads as "does not exist", so the API cannot be used to
    // confirm which server ids are real.
    if (!detail) throw notFound('That server does not exist.', 'unknown_server');
    return { server: detail };
  });

  app.patch('/api/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z
      .object({ name: z.string().min(1).max(100).optional(), iconUrl: z.string().url().nullable().optional() })
      .parse(request.body);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    if (body.name !== undefined) {
      const check = validateServerName(body.name);
      if (!check.ok) throw badRequest(check.error, 'invalid_server_name');
    }

    const db = getDb();
    const [updated] = await db
      .update(servers)
      .set({
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.iconUrl !== undefined ? { iconUrl: body.iconUrl } : {}),
      })
      .where(eq(servers.id, serverId))
      .returning();

    if (!updated) throw notFound('That server does not exist.', 'unknown_server');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'server.update',
      targetType: 'server',
      targetId: serverId,
      changes: { name: body.name, iconUrl: body.iconUrl },
    });

    hub.broadcastToServer(serverId, { t: 'server_update', d: serialize.server(updated) });
    return { server: serialize.server(updated) };
  });

  app.delete('/api/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);
    await deleteServer(serverId, user.id);

    hub.broadcastToServer(serverId, { t: 'server_delete', d: { id: serverId } });
    return { ok: true };
  });

  app.post('/api/servers/:serverId/leave', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);
    await leaveServer(serverId, user.id);

    hub.broadcastToServer(serverId, { t: 'member_leave', d: { userId: user.id, serverId } });
    hub.removeUserFromServer(user.id, serverId);
    hub.sendToUser(user.id, { t: 'server_delete', d: { id: serverId } });

    return { ok: true };
  });

  app.post('/api/servers/:serverId/transfer', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z.object({ userId: z.string() }).parse(request.body);

    await transferOwnership(serverId, user.id, body.userId);

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'server.update',
      targetType: 'server',
      targetId: serverId,
      changes: { ownerId: body.userId },
    });

    hub.invalidateServerPermissions(serverId);
    return { ok: true };
  });

  app.get('/api/servers/:serverId/members', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);
    return { members: await listMembers(serverId) };
  });

  app.patch('/api/servers/:serverId/members/:userId', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const body = z.object({ nickname: z.string().max(48).nullable() }).parse(request.body);

    const ctx = await requireMember(serverId, actor.id);

    // Changing your own nickname needs CHANGE_NICKNAME; changing someone
    // else's needs MANAGE_NICKNAMES and outranking them.
    if (userId === actor.id) {
      await requireServerPermission(serverId, actor.id, Permission.CHANGE_NICKNAME);
    } else {
      await requireServerPermission(serverId, actor.id, Permission.MANAGE_NICKNAMES);
      await requireHigherThan(ctx, userId);
    }

    const nickname = body.nickname?.trim() || null;
    const db = getDb();
    await db
      .update(members)
      .set({ nickname })
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)));

    if (userId !== actor.id) {
      await audit.record({
        serverId,
        actorId: actor.id,
        action: 'member.nickname',
        targetType: 'member',
        targetId: userId,
        changes: { nickname },
      });
    }

    const updated = (await listMembers(serverId)).find((m) => m.userId === userId);
    if (updated) hub.broadcastToServer(serverId, { t: 'member_update', d: updated });

    return { ok: true };
  });

  /**
   * Quiet someone without removing them. The column is the whole mechanism:
   * every action a timeout takes away checks it, and nothing has to run for the
   * timeout to end, so the server being down over the weekend cannot extend one.
   */
  app.put('/api/servers/:serverId/members/:userId/timeout', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const body = z.object({ until: z.string().datetime() }).parse(request.body);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.MODERATE_MEMBERS);
    await requireHigherThan(ctx, userId);

    const until = new Date(body.until);
    const days = LIMITS.timeoutDays;
    if (until.getTime() <= Date.now()) {
      throw badRequest('A timeout has to end in the future.', 'invalid_timeout');
    }
    if (until.getTime() > Date.now() + days * 24 * 60 * 60 * 1000) {
      throw badRequest(`A timeout can last at most ${days} days.`, 'invalid_timeout');
    }

    const db = getDb();
    const [updated] = await db
      .update(members)
      .set({ timeoutUntil: until })
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
      .returning();
    if (!updated) throw notFound('That member is not in this server.', 'unknown_member');

    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.timeout',
      targetType: 'member',
      targetId: userId,
      changes: { until: until.toISOString() },
    });

    const member = (await listMembers(serverId)).find((entry) => entry.userId === userId);
    if (member) hub.broadcastToServer(serverId, { t: 'member_update', d: member });

    return { ok: true };
  });

  app.delete('/api/servers/:serverId/members/:userId/timeout', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.MODERATE_MEMBERS);
    await requireHigherThan(ctx, userId);

    const db = getDb();
    const [updated] = await db
      .update(members)
      .set({ timeoutUntil: null })
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
      .returning();
    if (!updated) throw notFound('That member is not in this server.', 'unknown_member');

    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.timeout',
      targetType: 'member',
      targetId: userId,
      changes: { until: null },
    });

    const member = (await listMembers(serverId)).find((entry) => entry.userId === userId);
    if (member) hub.broadcastToServer(serverId, { t: 'member_update', d: member });

    return { ok: true };
  });

  app.delete('/api/servers/:serverId/members/:userId', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.KICK_MEMBERS);
    await requireHigherThan(ctx, userId);

    await removeMember(serverId, userId);
    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.kick',
      targetType: 'member',
      targetId: userId,
    });

    hub.broadcastToServer(serverId, { t: 'member_leave', d: { userId, serverId } });
    hub.removeUserFromServer(userId, serverId);
    hub.sendToUser(userId, { t: 'server_delete', d: { id: serverId } });

    return { ok: true };
  });

  app.put('/api/servers/:serverId/bans/:userId', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const body = z.object({ reason: z.string().max(512).optional() }).parse(request.body ?? {});

    const ctx = await requireServerPermission(serverId, actor.id, Permission.BAN_MEMBERS);
    await requireHigherThan(ctx, userId);

    const db = getDb();
    await db
      .insert(bans)
      .values({ serverId, userId, bannedBy: actor.id, reason: body.reason ?? null })
      .onConflictDoNothing();
    await removeMember(serverId, userId);

    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.ban',
      targetType: 'member',
      targetId: userId,
      changes: { reason: body.reason ?? null },
    });

    hub.broadcastToServer(serverId, { t: 'member_leave', d: { userId, serverId } });
    hub.removeUserFromServer(userId, serverId);
    hub.sendToUser(userId, { t: 'server_delete', d: { id: serverId } });

    return { ok: true };
  });

  app.delete('/api/servers/:serverId/bans/:userId', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);

    await requireServerPermission(serverId, actor.id, Permission.BAN_MEMBERS);

    await getDb().delete(bans).where(and(eq(bans.serverId, serverId), eq(bans.userId, userId)));
    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.unban',
      targetType: 'member',
      targetId: userId,
    });

    return { ok: true };
  });

  app.get('/api/servers/:serverId/bans', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.BAN_MEMBERS);

    const rows = await getDb()
      .select({ ban: bans, user: users })
      .from(bans)
      .innerJoin(users, eq(users.id, bans.userId))
      .where(eq(bans.serverId, serverId));

    return {
      bans: rows.map(({ ban, user: banned }) => ({
        user: serialize.publicUser(banned),
        reason: ban.reason,
        bannedBy: ban.bannedBy,
        createdAt: new Date(ban.createdAt).toISOString(),
      })),
    };
  });

  app.get('/api/servers/:serverId/audit-log', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.VIEW_AUDIT_LOG);
    return { entries: await audit.list(serverId) };
  });

  /**
   * Join by id is intentionally absent. The only way into a server is an
   * invite (see routes/invites.ts), so a member list is never discoverable by
   * guessing.
   */
  app.post('/api/servers/:serverId/members/:userId', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);

    if (userId !== actor.id) {
      throw badRequest('People join with an invite, they are not added.', 'use_invite');
    }

    await addMember(serverId, userId);
    const ctx = await requireMember(serverId, userId);
    const detail = await buildServerDetail(ctx);
    if (!detail) throw notFound('That server does not exist.', 'unknown_server');

    hub.addUserToServer(userId, serverId);
    hub.sendToUser(userId, { t: 'server_create', d: detail });

    const joined = (await listMembers(serverId)).find((m) => m.userId === userId);
    if (joined) hub.broadcastToServer(serverId, { t: 'member_join', d: joined });

    return { server: detail };
  });

  /** Used by the role editor to resolve ids to people in one request. */
  app.post('/api/users/lookup', async (request) => {
    requireUser(request);
    const body = z.object({ ids: z.array(z.string()).max(200) }).parse(request.body);
    if (body.ids.length === 0) return { users: [] };

    const rows = await getDb().select().from(users).where(inArray(users.id, body.ids));
    return { users: rows.map(serialize.publicUser) };
  });
}
