/**
 * Invites.
 *
 * The only way into a server, and the only way to create an account on a
 * private instance. Two kinds share one table: an invite with a server id
 * joins that server, and an invite without one creates an account.
 */

import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { Permission } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { invites, servers } from '../db/schema.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { inviteCode } from '../lib/ids.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import { consumeInvitePreflight } from '../services/auth.js';
import { requireMember, requireServerPermission } from '../services/permissions.js';
import { buildServerDetail } from '../services/server-detail.js';
import { addMember } from '../services/servers.js';

const EXPIRY_PRESETS = {
  '30m': 30 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  never: null,
} as const;

export async function registerInviteRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/servers/:serverId/invites', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z
      .object({
        maxUses: z.number().int().min(1).max(1000).nullable().optional(),
        expiresIn: z.enum(['30m', '6h', '1d', '7d', 'never']).default('7d'),
      })
      .parse(request.body ?? {});

    await requireServerPermission(serverId, user.id, Permission.CREATE_INVITE);

    const ttl = EXPIRY_PRESETS[body.expiresIn];
    const code = inviteCode();

    const [created] = await getDb()
      .insert(invites)
      .values({
        code,
        serverId,
        createdBy: user.id,
        maxUses: body.maxUses ?? null,
        expiresAt: ttl === null ? null : new Date(Date.now() + ttl),
      })
      .returning();

    if (!created) throw badRequest('Could not create the invite.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'invite.create',
      targetType: 'invite',
      targetId: code,
      changes: { maxUses: body.maxUses ?? null, expiresIn: body.expiresIn },
    });

    return {
      invite: serialize.invite(created),
      url: `${config.publicUrl}/invite/${code}`,
    };
  });

  app.get('/api/servers/:serverId/invites', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const rows = await getDb()
      .select()
      .from(invites)
      .where(and(eq(invites.serverId, serverId), isNull(invites.revokedAt)))
      .orderBy(desc(invites.createdAt));

    return { invites: rows.map(serialize.invite) };
  });

  app.delete('/api/invites/:code', async (request) => {
    const user = requireUser(request);
    const { code } = z.object({ code: z.string() }).parse(request.params);

    const db = getDb();
    const [existing] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
    if (!existing) throw notFound('That invite does not exist.', 'unknown_invite');

    // Instance invites (no server) are revocable only by the person who made
    // them, since there is no server whose permissions could govern it.
    if (existing.serverId) {
      await requireServerPermission(existing.serverId, user.id, Permission.MANAGE_SERVER);
    } else if (existing.createdBy !== user.id) {
      throw notFound('That invite does not exist.', 'unknown_invite');
    }

    await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.code, code));

    if (existing.serverId) {
      await audit.record({
        serverId: existing.serverId,
        actorId: user.id,
        action: 'invite.revoke',
        targetType: 'invite',
        targetId: code,
      });
    }

    return { ok: true };
  });

  /**
   * Preview an invite before accepting it, so the join screen can say which
   * server this is. Unauthenticated on purpose: you need to see it before you
   * have an account. It reveals only the server name and nothing else.
   */
  app.get('/api/invites/:code', async (request) => {
    const { code } = z.object({ code: z.string() }).parse(request.params);

    const row = await consumeInvitePreflight(code);

    if (!row.serverId) {
      return { kind: 'instance' as const, server: null };
    }

    const [server] = await getDb()
      .select()
      .from(servers)
      .where(eq(servers.id, row.serverId))
      .limit(1);
    if (!server) throw notFound('That invite does not exist.', 'unknown_invite');

    return {
      kind: 'server' as const,
      server: { id: server.id, name: server.name, iconUrl: server.iconUrl },
    };
  });

  app.post('/api/invites/:code/accept', async (request) => {
    const user = requireUser(request);
    const { code } = z.object({ code: z.string() }).parse(request.params);

    const row = await consumeInvitePreflight(code);
    if (!row.serverId) {
      throw badRequest('That invite is for creating an account, not joining a server.', 'instance_invite');
    }

    await addMember(row.serverId, user.id);

    await getDb()
      .update(invites)
      .set({ uses: row.uses + 1 })
      .where(eq(invites.code, row.code));

    const ctx = await requireMember(row.serverId, user.id);
    const detail = await buildServerDetail(ctx);
    if (!detail) throw notFound('That server does not exist.', 'unknown_server');

    hub.addUserToServer(user.id, row.serverId);
    hub.sendToUser(user.id, { t: 'server_create', d: detail });

    const { getDb: db2 } = await import('../db/index.js');
    const { members, users: usersTable } = await import('../db/schema.js');
    const [joined] = await db2()
      .select({ member: members, user: usersTable })
      .from(members)
      .innerJoin(usersTable, eq(usersTable.id, members.userId))
      .where(and(eq(members.serverId, row.serverId), eq(members.userId, user.id)))
      .limit(1);

    if (joined) {
      hub.broadcastToServer(row.serverId, {
        t: 'member_join',
        d: serialize.member(joined.member, joined.user, []),
      });
    }

    return { server: detail };
  });

  /**
   * An invite that creates an account rather than joining a server. This is
   * how a new person gets onto a private instance at all.
   */
  app.post('/api/instance-invites', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({
        maxUses: z.number().int().min(1).max(100).nullable().optional(),
        expiresIn: z.enum(['30m', '6h', '1d', '7d', 'never']).default('7d'),
      })
      .parse(request.body ?? {});

    const ttl = EXPIRY_PRESETS[body.expiresIn];
    const code = inviteCode();

    const [created] = await getDb()
      .insert(invites)
      .values({
        code,
        serverId: null,
        createdBy: user.id,
        maxUses: body.maxUses ?? 1,
        expiresAt: ttl === null ? null : new Date(Date.now() + ttl),
      })
      .returning();

    if (!created) throw badRequest('Could not create the invite.', 'create_failed');

    return {
      invite: serialize.invite(created),
      url: `${config.publicUrl}/join/${code}`,
    };
  });
}
