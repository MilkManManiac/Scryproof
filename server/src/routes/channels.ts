/**
 * Channels, categories, and per-channel permission overwrites.
 *
 * The overwrite endpoint is the sharp one. Two rules keep it from becoming a
 * privilege-escalation hole:
 *   - you cannot grant a permission you do not hold yourself
 *   - you cannot edit an overwrite for a role at or above your highest role
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  Permission,
  decodeMask,
  encodeMask,
  has,
  slugifyChannelName,
  validateChannelName,
} from '@gooffline/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import {
  categories,
  categoryOverwrites,
  channelOverwrites,
  channels,
  roles,
} from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import {
  computePermissionsInChannel,
  requireChannelPermission,
  requireMember,
  requireRoleBelow,
  requireServerPermission,
} from '../services/permissions.js';

const channelBody = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['text', 'voice']).default('text'),
  categoryId: z.string().nullable().optional(),
  topic: z.string().max(512).nullable().optional(),
  encrypted: z.boolean().optional(),
});

export async function registerChannelRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/servers/:serverId/channels', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = channelBody.parse(request.body);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_CHANNELS);

    // Voice channel names read like titles ("Game Night"); text channels are
    // slugs ("game-night"). Normalising here means the client never has to.
    const name = body.type === 'voice' ? body.name.trim().slice(0, 48) : slugifyChannelName(body.name);
    if (body.type === 'text') {
      const check = validateChannelName(name);
      if (!check.ok) throw badRequest(check.error, 'invalid_channel_name');
    }

    const db = getDb();

    if (body.categoryId) {
      const [category] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, body.categoryId), eq(categories.serverId, serverId)))
        .limit(1);
      if (!category) throw badRequest('That category does not exist.', 'unknown_category');
    }

    const positionRows = await db
      .select({ nextPosition: sql<number>`coalesce(max(${channels.position}), -1) + 1` })
      .from(channels)
      .where(eq(channels.serverId, serverId));
    const nextPosition = positionRows[0]?.nextPosition ?? 0;

    const [created] = await db
      .insert(channels)
      .values({
        id: uuidv7(),
        serverId,
        categoryId: body.categoryId ?? null,
        type: body.type,
        name,
        topic: body.topic ?? null,
        encrypted: body.encrypted ?? false,
        position: nextPosition,
      })
      .returning();

    if (!created) throw badRequest('Could not create the channel.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'channel.create',
      targetType: 'channel',
      targetId: created.id,
      changes: { name, type: body.type },
    });

    // A brand new channel has no overwrites, so everyone who can see the
    // server can see it. Still broadcast through the permission-aware path so
    // the rule holds even when that changes.
    await hub.broadcastToChannel(serverId, created.id, {
      t: 'channel_create',
      d: serialize.channel(created),
    });

    return { channel: serialize.channel(created) };
  });

  app.get('/api/channels/:channelId', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.VIEW_CHANNEL);
    const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');

    return {
      channel: serialize.channel(channel),
      permissions: encodeMask(ctx.channelPermissions),
    };
  });

  app.patch('/api/channels/:channelId', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(64).optional(),
        topic: z.string().max(512).nullable().optional(),
        categoryId: z.string().nullable().optional(),
        position: z.number().int().min(0).max(10_000).optional(),
        slowmodeSeconds: z.number().int().min(0).max(21_600).optional(),
      })
      .parse(request.body);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_CHANNELS);

    const db = getDb();
    const [existing] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!existing) throw notFound('That channel does not exist.', 'unknown_channel');

    const name =
      body.name === undefined
        ? undefined
        : existing.type === 'voice'
          ? body.name.trim().slice(0, 48)
          : slugifyChannelName(body.name);

    const [updated] = await db
      .update(channels)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(body.topic !== undefined ? { topic: body.topic } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
        ...(body.slowmodeSeconds !== undefined ? { slowmodeSeconds: body.slowmodeSeconds } : {}),
      })
      .where(eq(channels.id, channelId))
      .returning();

    if (!updated) throw notFound('That channel does not exist.', 'unknown_channel');

    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.update',
      targetType: 'channel',
      targetId: channelId,
      changes: { name, topic: body.topic, categoryId: body.categoryId },
    });

    await hub.broadcastToChannel(ctx.serverId, channelId, {
      t: 'channel_update',
      d: serialize.channel(updated),
    });

    // Moving a channel between categories changes who can see it, because the
    // category is a permission layer. Nothing about the channel's own
    // overwrites changed, which is exactly why this is easy to forget.
    if (body.categoryId !== undefined && body.categoryId !== existing.categoryId) {
      hub.invalidateServerPermissions(ctx.serverId);
    }

    return { channel: serialize.channel(updated) };
  });

  app.delete('/api/channels/:channelId', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_CHANNELS);

    await getDb().delete(channels).where(eq(channels.id, channelId));
    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.delete',
      targetType: 'channel',
      targetId: channelId,
    });

    // Sent to the whole server: people who could see it need to know it is
    // gone, and by now the permission data that would filter them is deleted.
    hub.broadcastToServer(ctx.serverId, {
      t: 'channel_delete',
      d: { id: channelId, serverId: ctx.serverId },
    });

    return { ok: true };
  });

  /* ------------------------------ overwrites ----------------------------- */

  app.get('/api/channels/:channelId/permissions', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    await requireChannelPermission(channelId, user.id, Permission.MANAGE_ROLES);

    const rows = await getDb()
      .select()
      .from(channelOverwrites)
      .where(eq(channelOverwrites.channelId, channelId));

    return {
      overwrites: rows.map((row) => ({
        targetType: row.targetType,
        targetId: row.targetId,
        allow: encodeMask(row.allow),
        deny: encodeMask(row.deny),
      })),
    };
  });

  app.put('/api/channels/:channelId/permissions/:targetId', async (request) => {
    const user = requireUser(request);
    const { channelId, targetId } = z
      .object({ channelId: z.string(), targetId: z.string() })
      .parse(request.params);
    const body = z
      .object({
        targetType: z.enum(['role', 'member']),
        allow: z.string().regex(/^\d+$/),
        deny: z.string().regex(/^\d+$/),
      })
      .parse(request.body);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_ROLES);

    const allow = decodeMask(body.allow);
    const deny = decodeMask(body.deny);

    if ((allow & deny) !== 0n) {
      throw badRequest('A permission cannot be both allowed and denied.', 'conflicting_overwrite');
    }

    // You cannot hand out what you do not have. Without this, anyone with
    // MANAGE_ROLES in one channel could grant themselves ADMINISTRATOR there.
    const touched = allow | deny;
    if (!has(ctx.channelPermissions, touched)) {
      throw forbidden('You can only change permissions you have yourself.');
    }

    if (body.targetType === 'role') {
      const [role] = await getDb()
        .select()
        .from(roles)
        .where(and(eq(roles.id, targetId), eq(roles.serverId, ctx.serverId)))
        .limit(1);
      if (!role) throw badRequest('That role does not exist.', 'unknown_role');
      // @everyone sits at position 0 and is editable by anyone with the
      // permission; any other role must sit below the actor's highest.
      if (!role.isEveryone) requireRoleBelow(ctx, role.position);
    }

    const db = getDb();
    await db
      .insert(channelOverwrites)
      .values({ channelId, targetType: body.targetType, targetId, allow, deny })
      .onConflictDoUpdate({
        target: [
          channelOverwrites.channelId,
          channelOverwrites.targetType,
          channelOverwrites.targetId,
        ],
        set: { allow, deny },
      });

    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.permissions',
      targetType: 'channel',
      targetId: channelId,
      changes: { target: targetId, targetType: body.targetType, allow: body.allow, deny: body.deny },
    });

    // Anyone's view of this server may have just changed.
    hub.invalidateServerPermissions(ctx.serverId);

    return { ok: true };
  });

  app.delete('/api/channels/:channelId/permissions/:targetId', async (request) => {
    const user = requireUser(request);
    const { channelId, targetId } = z
      .object({ channelId: z.string(), targetId: z.string() })
      .parse(request.params);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_ROLES);

    await getDb()
      .delete(channelOverwrites)
      .where(
        and(eq(channelOverwrites.channelId, channelId), eq(channelOverwrites.targetId, targetId)),
      );

    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.permissions',
      targetType: 'channel',
      targetId: channelId,
      changes: { target: targetId, cleared: true },
    });

    hub.invalidateServerPermissions(ctx.serverId);
    return { ok: true };
  });

  /**
   * What the caller may do in this channel. The settings UI uses it to grey
   * out controls; it is a convenience, never the enforcement.
   */
  app.get('/api/channels/:channelId/me', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');

    const ctx = await requireMember(channel.serverId, user.id);
    const permissions = await computePermissionsInChannel(ctx, channelId);

    if (!has(permissions, Permission.VIEW_CHANNEL)) {
      throw notFound('That channel does not exist.', 'unknown_channel');
    }

    return { permissions: encodeMask(permissions) };
  });

  /* ------------------------------ categories ----------------------------- */

  app.post('/api/servers/:serverId/categories', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z.object({ name: z.string().min(1).max(48) }).parse(request.body);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_CHANNELS);

    const db = getDb();
    const positionRows = await db
      .select({ nextPosition: sql<number>`coalesce(max(${categories.position}), -1) + 1` })
      .from(categories)
      .where(eq(categories.serverId, serverId));
    const nextPosition = positionRows[0]?.nextPosition ?? 0;

    const [created] = await db
      .insert(categories)
      .values({ id: uuidv7(), serverId, name: body.name.trim(), position: nextPosition })
      .returning();

    if (!created) throw badRequest('Could not create the category.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'category.create',
      targetType: 'category',
      targetId: created.id,
      changes: { name: created.name },
    });

    hub.broadcastToServer(serverId, { t: 'category_create', d: serialize.category(created) });
    return { category: serialize.category(created) };
  });

  app.patch('/api/categories/:categoryId', async (request) => {
    const user = requireUser(request);
    const { categoryId } = z.object({ categoryId: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(48).optional(),
        position: z.number().int().min(0).max(10_000).optional(),
      })
      .parse(request.body);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!existing) throw notFound('That category does not exist.', 'unknown_category');

    await requireServerPermission(existing.serverId, user.id, Permission.MANAGE_CHANNELS);

    const [updated] = await db
      .update(categories)
      .set({
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.position !== undefined ? { position: body.position } : {}),
      })
      .where(eq(categories.id, categoryId))
      .returning();

    if (!updated) throw notFound('That category does not exist.', 'unknown_category');

    hub.broadcastToServer(existing.serverId, {
      t: 'category_update',
      d: serialize.category(updated),
    });
    return { category: serialize.category(updated) };
  });

  app.delete('/api/categories/:categoryId', async (request) => {
    const user = requireUser(request);
    const { categoryId } = z.object({ categoryId: z.string() }).parse(request.params);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!existing) throw notFound('That category does not exist.', 'unknown_category');

    await requireServerPermission(existing.serverId, user.id, Permission.MANAGE_CHANNELS);

    // Channels outlive their category and become uncategorised, because
    // deleting a category should never silently destroy conversations.
    await db.delete(categories).where(eq(categories.id, categoryId));

    await audit.record({
      serverId: existing.serverId,
      actorId: user.id,
      action: 'category.delete',
      targetType: 'category',
      targetId: categoryId,
    });

    hub.broadcastToServer(existing.serverId, {
      t: 'category_delete',
      d: { id: categoryId, serverId: existing.serverId },
    });

    const orphaned = await db
      .select()
      .from(channels)
      .where(and(eq(channels.serverId, existing.serverId), eq(channels.categoryId, categoryId)))
      .orderBy(asc(channels.position));

    for (const channel of orphaned) {
      hub.broadcastToServer(existing.serverId, {
        t: 'channel_update',
        d: serialize.channel({ ...channel, categoryId: null }),
      });
    }

    // The category's overwrites went with it, so every channel that was inside
    // it now resolves against the server alone. A category used to hide things
    // is a category whose deletion reveals them.
    if (orphaned.length > 0) hub.invalidateServerPermissions(existing.serverId);

    return { ok: true };
  });

  /* ------------------------- category overwrites ------------------------- */

  /**
   * A category's overwrites apply to every channel inside it, as a layer
   * beneath each channel's own. See `applyChannelOverwrites` in the shared
   * package for the resolution order.
   *
   * These endpoints mirror the channel ones deliberately — same body, same two
   * guards — because they are the same escalation surface. The difference is
   * what "you cannot grant what you do not have" is measured against: a
   * category has no VIEW gate of its own, so the bar is the actor's
   * server-wide permissions rather than their permissions in one channel.
   */
  async function requireCategory(categoryId: string, userId: string) {
    const [category] = await getDb()
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);
    if (!category) throw notFound('That category does not exist.', 'unknown_category');

    const ctx = await requireServerPermission(category.serverId, userId, Permission.MANAGE_ROLES);
    return { category, ctx };
  }

  app.get('/api/categories/:categoryId/permissions', async (request) => {
    const user = requireUser(request);
    const { categoryId } = z.object({ categoryId: z.string() }).parse(request.params);

    await requireCategory(categoryId, user.id);

    const rows = await getDb()
      .select()
      .from(categoryOverwrites)
      .where(eq(categoryOverwrites.categoryId, categoryId));

    return {
      overwrites: rows.map((row) => ({
        targetType: row.targetType,
        targetId: row.targetId,
        allow: encodeMask(row.allow),
        deny: encodeMask(row.deny),
      })),
    };
  });

  app.put('/api/categories/:categoryId/permissions/:targetId', async (request) => {
    const user = requireUser(request);
    const { categoryId, targetId } = z
      .object({ categoryId: z.string(), targetId: z.string() })
      .parse(request.params);
    const body = z
      .object({
        targetType: z.enum(['role', 'member']),
        allow: z.string().regex(/^\d+$/),
        deny: z.string().regex(/^\d+$/),
      })
      .parse(request.body);

    const { category, ctx } = await requireCategory(categoryId, user.id);

    const allow = decodeMask(body.allow);
    const deny = decodeMask(body.deny);

    if ((allow & deny) !== 0n) {
      throw badRequest('A permission cannot be both allowed and denied.', 'conflicting_overwrite');
    }

    if (!has(ctx.basePermissions, allow | deny)) {
      throw forbidden('You can only change permissions you have yourself.');
    }

    if (body.targetType === 'role') {
      const [role] = await getDb()
        .select()
        .from(roles)
        .where(and(eq(roles.id, targetId), eq(roles.serverId, category.serverId)))
        .limit(1);
      if (!role) throw badRequest('That role does not exist.', 'unknown_role');
      if (!role.isEveryone) requireRoleBelow(ctx, role.position);
    }

    await getDb()
      .insert(categoryOverwrites)
      .values({ categoryId, targetType: body.targetType, targetId, allow, deny })
      .onConflictDoUpdate({
        target: [
          categoryOverwrites.categoryId,
          categoryOverwrites.targetType,
          categoryOverwrites.targetId,
        ],
        set: { allow, deny },
      });

    await audit.record({
      serverId: category.serverId,
      actorId: user.id,
      action: 'category.permissions',
      targetType: 'category',
      targetId: categoryId,
      changes: { target: targetId, targetType: body.targetType, allow: body.allow, deny: body.deny },
    });

    // Every channel under this category just resolved differently.
    hub.invalidateServerPermissions(category.serverId);

    return { ok: true };
  });

  app.delete('/api/categories/:categoryId/permissions/:targetId', async (request) => {
    const user = requireUser(request);
    const { categoryId, targetId } = z
      .object({ categoryId: z.string(), targetId: z.string() })
      .parse(request.params);

    const { category } = await requireCategory(categoryId, user.id);

    await getDb()
      .delete(categoryOverwrites)
      .where(
        and(
          eq(categoryOverwrites.categoryId, categoryId),
          eq(categoryOverwrites.targetId, targetId),
        ),
      );

    await audit.record({
      serverId: category.serverId,
      actorId: user.id,
      action: 'category.permissions',
      targetType: 'category',
      targetId: categoryId,
      changes: { target: targetId, cleared: true },
    });

    hub.invalidateServerPermissions(category.serverId);
    return { ok: true };
  });
}
