/**
 * Roles and role assignment.
 *
 * Two invariants are enforced on every write here, and they are the difference
 * between a permission system and a decoration:
 *
 *   1. You cannot grant a permission you do not hold. Otherwise anyone with
 *      MANAGE_ROLES could mint themselves ADMINISTRATOR in one request.
 *   2. You cannot create, edit, delete or assign a role at or above your own
 *      highest role. Otherwise the hierarchy is advisory.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  ALL_PERMISSIONS,
  Permission,
  decodeMask,
  has,
  validateRoleName,
} from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { channelOverwrites, memberRoles, members, roles, users } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import {
  requireHigherThan,
  requireMember,
  requireRoleBelow,
  requireServerPermission,
  type MemberContext,
} from '../services/permissions.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The actor's own permission ceiling. Nothing they write may exceed it. */
function ceilingFor(ctx: MemberContext): bigint {
  if (ctx.isOwner) return ALL_PERMISSIONS;
  if (has(ctx.basePermissions, Permission.ADMINISTRATOR)) return ALL_PERMISSIONS;
  return ctx.basePermissions;
}

function assertWithinCeiling(ctx: MemberContext, wanted: bigint): void {
  const ceiling = ceilingFor(ctx);
  if ((wanted & ~ceiling) !== 0n) {
    throw forbidden('You can only grant permissions you have yourself.');
  }
}

export async function registerRoleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/servers/:serverId/roles', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);

    const rows = await getDb()
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position));

    return { roles: rows.map(serialize.role) };
  });

  app.post('/api/servers/:serverId/roles', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(48),
        color: z.string().regex(HEX_COLOR).nullable().optional(),
        permissions: z.string().regex(/^\d+$/).optional(),
        hoist: z.boolean().optional(),
        mentionable: z.boolean().optional(),
      })
      .parse(request.body);

    const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_ROLES);

    const check = validateRoleName(body.name);
    if (!check.ok) throw badRequest(check.error, 'invalid_role_name');

    const permissions = decodeMask(body.permissions ?? '0');
    assertWithinCeiling(ctx, permissions);

    const db = getDb();

    // New roles land directly below the actor's highest, never above it.
    const actorHighest = ctx.isOwner
      ? Number.MAX_SAFE_INTEGER
      : ctx.roles.reduce((max, role) => Math.max(max, role.position), 0);

    const highestRows = await db
      .select({ highest: sql<number>`coalesce(max(${roles.position}), 0)` })
      .from(roles)
      .where(eq(roles.serverId, serverId));
    const highest = highestRows[0]?.highest ?? 0;

    const position = Math.max(1, Math.min(highest + 1, actorHighest - 1 || 1));

    const [created] = await db
      .insert(roles)
      .values({
        id: uuidv7(),
        serverId,
        name: body.name.trim(),
        color: body.color ?? null,
        permissions,
        hoist: body.hoist ?? false,
        mentionable: body.mentionable ?? false,
        position,
        isEveryone: false,
      })
      .returning();

    if (!created) throw badRequest('Could not create the role.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'role.create',
      targetType: 'role',
      targetId: created.id,
      changes: { name: created.name, permissions: body.permissions ?? '0' },
    });

    hub.broadcastToServer(serverId, { t: 'role_create', d: serialize.role(created) });
    hub.invalidateServerPermissions(serverId, false);

    return { role: serialize.role(created) };
  });

  app.patch('/api/roles/:roleId', async (request) => {
    const user = requireUser(request);
    const { roleId } = z.object({ roleId: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(48).optional(),
        color: z.string().regex(HEX_COLOR).nullable().optional(),
        permissions: z.string().regex(/^\d+$/).optional(),
        hoist: z.boolean().optional(),
        mentionable: z.boolean().optional(),
        position: z.number().int().min(1).max(10_000).optional(),
      })
      .parse(request.body);

    const db = getDb();
    const [existing] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!existing) throw notFound('That role does not exist.', 'unknown_role');

    const ctx = await requireServerPermission(existing.serverId, user.id, Permission.MANAGE_ROLES);

    if (!existing.isEveryone) requireRoleBelow(ctx, existing.position);
    if (body.position !== undefined) requireRoleBelow(ctx, body.position);

    if (existing.isEveryone && body.name !== undefined) {
      throw badRequest('The @everyone role cannot be renamed.', 'everyone_immutable');
    }

    if (body.permissions !== undefined) {
      const wanted = decodeMask(body.permissions);
      // Check both directions: the bits being added and the bits being removed
      // must all be within the actor's ceiling, so someone cannot strip a
      // permission they were never able to grant.
      assertWithinCeiling(ctx, wanted | existing.permissions);
    }

    if (body.name !== undefined) {
      const check = validateRoleName(body.name);
      if (!check.ok) throw badRequest(check.error, 'invalid_role_name');
    }

    const [updated] = await db
      .update(roles)
      .set({
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.permissions !== undefined ? { permissions: decodeMask(body.permissions) } : {}),
        ...(body.hoist !== undefined ? { hoist: body.hoist } : {}),
        ...(body.mentionable !== undefined ? { mentionable: body.mentionable } : {}),
        ...(body.position !== undefined && !existing.isEveryone
          ? { position: body.position }
          : {}),
      })
      .where(eq(roles.id, roleId))
      .returning();

    if (!updated) throw notFound('That role does not exist.', 'unknown_role');

    await audit.record({
      serverId: existing.serverId,
      actorId: user.id,
      action: 'role.update',
      targetType: 'role',
      targetId: roleId,
      changes: { name: body.name, permissions: body.permissions, position: body.position },
    });

    hub.broadcastToServer(existing.serverId, { t: 'role_update', d: serialize.role(updated) });
    hub.invalidateServerPermissions(existing.serverId);

    return { role: serialize.role(updated) };
  });


  /**
   * Reordering the hierarchy.
   *
   * One request, not one per role. A drag that moves a role past four others
   * changes five positions, and doing that as five PATCHes means five audit
   * entries, five broadcasts and five permission-cache invalidations for a
   * single gesture — with four intermediate orderings on the wire that the
   * actor never asked for and that other clients would briefly render.
   *
   * The body is the whole order, highest first, which is also the order the
   * settings screen draws. Positions are then handed out fresh from the top,
   * so they stay dense and no two roles collide.
   *
   * The hierarchy rule is stricter here than it looks. It is not enough to
   * check that each role's new position is below the actor's own highest: the
   * actor must also be unable to rearrange the roles above them relative to
   * each other, or to drop one of them below their own. So everything at or
   * above the actor's highest role has to arrive as an unchanged prefix. The
   * owner has no highest role and is exempt, as everywhere else.
   */
  app.patch('/api/servers/:serverId/roles/order', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z
      .object({ roleIds: z.array(z.string()).min(1).max(250) })
      .parse(request.body);

    const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_ROLES);

    const db = getDb();
    const existing = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position));

    // @everyone is the floor. It is not part of the ordering and never moves.
    const movable = existing.filter((role) => !role.isEveryone);
    const current = [...movable].sort((a, b) => b.position - a.position);

    const wanted = body.roleIds;
    if (wanted.length !== current.length || new Set(wanted).size !== wanted.length) {
      throw badRequest('Send every role in this server exactly once.', 'incomplete_order');
    }
    const byId = new Map(current.map((role) => [role.id, role]));
    if (wanted.some((id) => !byId.has(id))) {
      throw badRequest('That order names a role that is not in this server.', 'unknown_role');
    }

    if (!ctx.isOwner) {
      const actorHighest = ctx.roles.reduce((max, role) => Math.max(max, role.position), -1);
      const locked = current.filter((role) => role.position >= actorHighest);
      const prefix = wanted.slice(0, locked.length);
      if (locked.some((role, index) => prefix[index] !== role.id)) {
        throw forbidden('You cannot move roles at or above your own highest role.');
      }
    }

    // Top of the list gets the largest number, and @everyone keeps 0.
    const assigned = wanted.map((id, index) => ({ id, position: wanted.length - index }));
    const unchanged = assigned.every(({ id, position }) => byId.get(id)?.position === position);
    if (unchanged) return { roles: existing.map(serialize.role) };

    await db.transaction(async (tx) => {
      for (const { id, position } of assigned) {
        await tx.update(roles).set({ position }).where(eq(roles.id, id));
      }
    });

    const updated = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position));

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'role.reorder',
      targetType: 'server',
      targetId: serverId,
      changes: { order: wanted },
    });

    hub.broadcastToServer(serverId, {
      t: 'roles_reorder',
      d: { serverId, roles: updated.map(serialize.role) },
    });
    // Position decides who outranks whom, not what anyone may do, so nobody's
    // permission mask changed. Clients still hold role positions, though, and
    // the event above is what corrects them.
    hub.invalidateServerPermissions(serverId, false);

    return { roles: updated.map(serialize.role) };
  });

  app.delete('/api/roles/:roleId', async (request) => {
    const user = requireUser(request);
    const { roleId } = z.object({ roleId: z.string() }).parse(request.params);

    const db = getDb();
    const [existing] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!existing) throw notFound('That role does not exist.', 'unknown_role');

    if (existing.isEveryone) {
      throw badRequest('The @everyone role cannot be deleted.', 'everyone_immutable');
    }

    const ctx = await requireServerPermission(existing.serverId, user.id, Permission.MANAGE_ROLES);
    requireRoleBelow(ctx, existing.position);

    // Channel overwrites naming this role would otherwise linger and silently
    // apply to nobody, which makes a permissions screen lie.
    await db.delete(channelOverwrites).where(eq(channelOverwrites.targetId, roleId));
    await db.delete(roles).where(eq(roles.id, roleId));

    await audit.record({
      serverId: existing.serverId,
      actorId: user.id,
      action: 'role.delete',
      targetType: 'role',
      targetId: roleId,
      changes: { name: existing.name },
    });

    hub.broadcastToServer(existing.serverId, {
      t: 'role_delete',
      d: { id: roleId, serverId: existing.serverId },
    });
    hub.invalidateServerPermissions(existing.serverId);

    return { ok: true };
  });

  /** Replace a member's roles wholesale. Simpler to reason about than deltas. */
  app.put('/api/servers/:serverId/members/:userId/roles', async (request) => {
    const actor = requireUser(request);
    const { serverId, userId } = z
      .object({ serverId: z.string(), userId: z.string() })
      .parse(request.params);
    const body = z.object({ roleIds: z.array(z.string()).max(64) }).parse(request.body);

    const ctx = await requireServerPermission(serverId, actor.id, Permission.MANAGE_ROLES);
    await requireHigherThan(ctx, userId);

    const db = getDb();

    const [membership] = await db
      .select()
      .from(members)
      .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
      .limit(1);
    if (!membership) throw notFound('That member is not in this server.', 'unknown_member');

    const wanted = [...new Set(body.roleIds)];

    const serverRoles = await db.select().from(roles).where(eq(roles.serverId, serverId));
    const byId = new Map(serverRoles.map((role) => [role.id, role]));

    for (const roleId of wanted) {
      const role = byId.get(roleId);
      if (!role) throw badRequest('That role does not exist.', 'unknown_role');
      if (role.isEveryone) {
        throw badRequest('@everyone is automatic and cannot be assigned.', 'everyone_immutable');
      }
      // Assigning a role you do not outrank would let you promote someone past
      // yourself, which is the same escalation by another route.
      requireRoleBelow(ctx, role.position);
      assertWithinCeiling(ctx, role.permissions);
    }

    // Roles the actor cannot see or outrank stay exactly as they were, so a
    // junior moderator editing someone does not silently strip a senior role.
    const existingAssignments = await db
      .select()
      .from(memberRoles)
      .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)));

    const untouchable = existingAssignments
      .map((row) => byId.get(row.roleId))
      .filter((role): role is NonNullable<typeof role> => Boolean(role))
      .filter((role) => {
        try {
          requireRoleBelow(ctx, role.position);
          return false;
        } catch {
          return true;
        }
      })
      .map((role) => role.id);

    const finalRoleIds = [...new Set([...wanted, ...untouchable])];

    await db
      .delete(memberRoles)
      .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)));

    if (finalRoleIds.length > 0) {
      await db
        .insert(memberRoles)
        .values(finalRoleIds.map((roleId) => ({ serverId, userId, roleId })));
    }

    await audit.record({
      serverId,
      actorId: actor.id,
      action: 'member.roles',
      targetType: 'member',
      targetId: userId,
      changes: { roleIds: finalRoleIds },
    });

    const [memberUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (memberUser) {
      hub.broadcastToServer(serverId, {
        t: 'member_update',
        d: serialize.member(membership, memberUser, finalRoleIds),
      });
    }

    hub.invalidateServerPermissions(serverId);

    return { roleIds: finalRoleIds };
  });

  /** Who holds a role, for the role editor's member tab. */
  app.get('/api/roles/:roleId/members', async (request) => {
    const user = requireUser(request);
    const { roleId } = z.object({ roleId: z.string() }).parse(request.params);

    const db = getDb();
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw notFound('That role does not exist.', 'unknown_role');

    await requireMember(role.serverId, user.id);

    const rows = await db
      .select({ userId: memberRoles.userId })
      .from(memberRoles)
      .where(eq(memberRoles.roleId, roleId));

    if (rows.length === 0) return { members: [] };

    const userRows = await db
      .select()
      .from(users)
      .where(inArray(users.id, rows.map((row) => row.userId)));

    return { members: userRows.map(serialize.publicUser) };
  });
}
