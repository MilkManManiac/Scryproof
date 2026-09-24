/**
 * Channels, categories, and per-channel permission overwrites.
 *
 * The overwrite endpoint is the sharp one. Two rules keep it from becoming a
 * privilege-escalation hole:
 *   - you cannot grant a permission you do not hold yourself
 *   - you cannot edit an overwrite for a role at or above your highest role
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  MESSAGE_EXPIRY_CHOICES,
  Permission,
  decodeMask,
  encodeMask,
  has,
  slugifyChannelName,
  validateChannelName,
} from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import {
  categories,
  categoryOverwrites,
  channelOverwrites,
  channels,
  members,
  roles,
} from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import { applyPrivacy, isPrivate, loadPrivacy, privateChannelIds } from '../services/privacy.js';
import * as serialize from '../services/serialize.js';
import {
  computePermissionsForServerChannels,
  computePermissionsInChannel,
  requireChannelPermission,
  requireMember,
  requireRoleBelow,
  requireServerPermission,
} from '../services/permissions.js';
import type { MemberContext } from '../services/permissions.js';

/** "Private: on, for these roles and people." Ids are checked against the server below. */
const privacyBody = z.object({
  private: z.boolean(),
  roleIds: z.array(z.string()).max(100).default([]),
  memberIds: z.array(z.string()).max(500).default([]),
});

const channelBody = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['text', 'voice']).default('text'),
  categoryId: z.string().nullable().optional(),
  topic: z.string().max(512).nullable().optional(),
  encrypted: z.boolean().optional(),
  private: privacyBody.optional(),
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

    if (body.categoryId !== undefined && body.categoryId !== null) {
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
        // A voice channel is always encrypted; the flag is about text.
        encrypted: body.type === 'text' && (body.encrypted ?? false),
        position: nextPosition,
      })
      .returning();

    if (!created) throw badRequest('Could not create the channel.', 'create_failed');

    const makePrivate = body.private?.private === true;
    if (body.private) {
      const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_CHANNELS);
      await setPrivacy(ctx, created.id, body.private);
    }

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'channel.create',
      targetType: 'channel',
      targetId: created.id,
      changes: { name, type: body.type, private: makePrivate },
    });

    // A brand new public channel has no overwrites, so everyone who can see
    // the server can see it; a private one is announced only to those let in.
    if (makePrivate) hub.invalidateServerPermissions(serverId, false);
    await hub.broadcastToChannel(serverId, created.id, {
      t: 'channel_create',
      d: serialize.channel(created, makePrivate),
    });

    return { channel: serialize.channel(created, makePrivate) };
  });

  app.get('/api/channels/:channelId', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.VIEW_CHANNEL);
    const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!channel) throw notFound('That channel does not exist.', 'unknown_channel');

    return {
      channel: serialize.channel(channel, await isPrivate(channelId, ctx.serverId)),
      permissions: encodeMask(ctx.channelPermissions),
    };
  });

  app.get('/api/channels/:channelId/privacy', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_CHANNELS);
    return { privacy: await loadPrivacy(channelId, ctx.serverId) };
  });

  app.put('/api/channels/:channelId/privacy', async (request) => {
    const user = requireUser(request);
    const { channelId } = z.object({ channelId: z.string() }).parse(request.params);
    const body = privacyBody.parse(request.body);
    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_CHANNELS);

    const plan = await setPrivacy(ctx, channelId, body);
    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.privacy',
      targetType: 'channel',
      targetId: channelId,
      changes: { private: body.private, roles: body.roleIds.length, members: body.memberIds.length },
    });

    // Who can see this channel just changed, in both directions. Every client
    // refetches the server, and those let in or shut out see it appear or go.
    hub.invalidateServerPermissions(ctx.serverId);
    if (plan.upsert.length > 0 || plan.remove.length > 0) {
      const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
      if (channel) {
        await hub.broadcastToChannel(ctx.serverId, channelId, {
          t: 'channel_update',
          d: serialize.channel(channel, body.private),
        });
      }
    }
    return { privacy: await loadPrivacy(channelId, ctx.serverId) };
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
        expireAfterSeconds: z
          .number()
          .int()
          .refine((value) => (MESSAGE_EXPIRY_CHOICES as readonly number[]).includes(value), 'Not one of the choices.')
          .optional(),
        /** Only ever true: see below. */
        encrypted: z.literal(true).optional(),
      })
      .parse(request.body);

    const ctx = await requireChannelPermission(channelId, user.id, Permission.MANAGE_CHANNELS);

    const db = getDb();
    const [existing] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    if (!existing) throw notFound('That channel does not exist.', 'unknown_channel');

    if (body.categoryId !== undefined && body.categoryId !== null) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, body.categoryId), eq(categories.serverId, ctx.serverId)))
        .limit(1);
      if (!category) throw badRequest('That category does not exist.', 'unknown_category');
    }

    // Encryption goes on and stays on. Switching it off would quietly turn a
    // channel people believe is private back into one the server reads, and
    // their devices could not tell the difference in time to stop typing.
    // Text channels only; voice is always encrypted.
    const encrypting = body.encrypted === true && !existing.encrypted;
    if (body.encrypted && existing.type !== 'text') {
      throw badRequest('Only a text channel can be switched to end-to-end encryption.', 'not_text_channel');
    }

    const name =
      body.name === undefined
        ? undefined
        : existing.type === 'voice'
          ? body.name.trim().slice(0, 48)
          : slugifyChannelName(body.name);

    const changes = {
      ...(name !== undefined ? { name } : {}),
      ...(body.topic !== undefined ? { topic: body.topic } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.slowmodeSeconds !== undefined ? { slowmodeSeconds: body.slowmodeSeconds } : {}),
      ...(body.expireAfterSeconds !== undefined ? { expireAfterSeconds: body.expireAfterSeconds } : {}),
      ...(encrypting ? { encrypted: true, encryptedAt: new Date() } : {}),
    };
    // Nothing to change (switching on a channel that already is): answer with it as it is.
    const [updated] =
      Object.keys(changes).length === 0
        ? [existing]
        : await db.update(channels).set(changes).where(eq(channels.id, channelId)).returning();

    if (!updated) throw notFound('That channel does not exist.', 'unknown_channel');

    await audit.record({
      serverId: ctx.serverId,
      actorId: user.id,
      action: 'channel.update',
      targetType: 'channel',
      targetId: channelId,
      changes: {
        name,
        topic: body.topic,
        categoryId: body.categoryId,
        expireAfterSeconds: body.expireAfterSeconds,
        ...(encrypting ? { encrypted: true } : {}),
      },
    });

    const wasPrivate = await isPrivate(channelId, ctx.serverId);
    await hub.broadcastToChannel(ctx.serverId, channelId, {
      t: 'channel_update',
      d: serialize.channel(updated, wasPrivate),
    });

    // Moving a channel between categories changes who can see it, because the
    // category is a permission layer. Nothing about the channel's own
    // overwrites changed, which is exactly why this is easy to forget.
    if (body.categoryId !== undefined && body.categoryId !== existing.categoryId) {
      hub.invalidateServerPermissions(ctx.serverId);
    }

    return { channel: serialize.channel(updated, wasPrivate) };
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

    await requireOverwriteTarget(ctx, body.targetType, targetId);

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

  /* -------------------------------- layout ------------------------------- */

  /**
   * The order of everything in the sidebar, in one request.
   *
   * Same shape as the role reorder, for the same reason: a drag past four
   * rows is one gesture, not four PATCHes, four audit entries and three
   * orderings on the wire that nobody asked for. The whole layout arrives,
   * positions are renumbered densely underneath it, and one event goes out.
   *
   * Two things this has to be careful about. Moving a channel into a
   * different category changes who can see it, because the category is a
   * permission layer — so any category change invalidates the permission
   * cache, exactly as PATCH /api/channels/:id does. And the actor may not be
   * able to see every channel in the server: those are not theirs to arrange,
   * so they keep their numbers and their category, and naming one of them in
   * the request is answered with "does not exist" like everywhere else.
   */
  app.put('/api/servers/:serverId/layout', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z
      .object({
        categories: z.array(z.string()).max(250),
        channels: z
          .array(z.object({ id: z.string(), categoryId: z.string().nullable() }))
          .max(1000),
      })
      .parse(request.body);

    const ctx = await requireServerPermission(serverId, user.id, Permission.MANAGE_CHANNELS);

    const db = getDb();
    const [allCategories, allChannels, permissions] = await Promise.all([
      db.select().from(categories).where(eq(categories.serverId, serverId)),
      db.select().from(channels).where(eq(channels.serverId, serverId)),
      computePermissionsForServerChannels(ctx),
    ]);

    const categoryById = new Map(allCategories.map((entry) => [entry.id, entry]));
    const visibleById = new Map(
      allChannels
        .filter((channel) => has(permissions.get(channel.id) ?? 0n, Permission.VIEW_CHANNEL))
        .map((channel) => [channel.id, channel]),
    );

    const categoryIds = body.categories;
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw badRequest('A category is listed twice.', 'duplicate_category');
    }
    if (categoryIds.some((id) => !categoryById.has(id))) {
      throw notFound('That category does not exist.', 'unknown_category');
    }

    const channelIds = body.channels.map((entry) => entry.id);
    if (new Set(channelIds).size !== channelIds.length) {
      throw badRequest('A channel is listed twice.', 'duplicate_channel');
    }
    if (channelIds.some((id) => !visibleById.has(id))) {
      throw notFound('That channel does not exist.', 'unknown_channel');
    }
    if (body.channels.some((entry) => entry.categoryId !== null && !categoryById.has(entry.categoryId))) {
      throw notFound('That category does not exist.', 'unknown_category');
    }

    // Positions are per list: categories among themselves, channels among
    // the ones this actor could see. Anything not named keeps its number.
    const categoryMoves = categoryIds
      .map((id, position) => ({ id, position }))
      .filter(({ id, position }) => categoryById.get(id)?.position !== position);

    const recategorised: string[] = [];
    const channelMoves = body.channels
      .map(({ id, categoryId }, position) => ({ id, categoryId, position }))
      .filter(({ id, categoryId, position }) => {
        const current = visibleById.get(id)!;
        if (current.categoryId !== categoryId) recategorised.push(id);
        return current.categoryId !== categoryId || current.position !== position;
      });

    if (categoryMoves.length === 0 && channelMoves.length === 0) return { ok: true };

    await db.transaction(async (tx) => {
      for (const { id, position } of categoryMoves) {
        await tx.update(categories).set({ position }).where(eq(categories.id, id));
      }
      for (const { id, categoryId, position } of channelMoves) {
        await tx.update(channels).set({ categoryId, position }).where(eq(channels.id, id));
      }
    });

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'server.layout',
      targetType: 'server',
      targetId: serverId,
      changes: { categories: categoryMoves.length, channels: channelMoves.length, recategorised },
    });

    // One event for the whole gesture. A recategorised channel may have just
    // become visible or invisible to somebody, and the blunt refetch is the
    // one that cannot be subtly wrong about that; a pure reorder rides the
    // same path because it is rare and the cost is one cheap request.
    hub.invalidateServerPermissions(serverId);

    return { ok: true };
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

    // A new category is empty, so only people who may manage channels can see
    // it yet. That is the same answer a reconnect would give.
    await hub.broadcastToCategory(serverId, created.id, {
      t: 'category_create',
      d: serialize.category(created),
    });
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

    await hub.broadcastToCategory(existing.serverId, categoryId, {
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

    // Sent to the whole server, like a deleted channel: this carries an id and
    // no name, and anyone who never held the category simply has nothing to
    // drop.
    hub.broadcastToServer(existing.serverId, {
      t: 'category_delete',
      d: { id: categoryId, serverId: existing.serverId },
    });

    const orphaned = await db
      .select()
      .from(channels)
      .where(and(eq(channels.serverId, existing.serverId), eq(channels.categoryId, categoryId)))
      .orderBy(asc(channels.position));

    // The category's overwrites went with it, so every channel that was inside
    // it now resolves against the server alone. A category used to hide things
    // is a category whose deletion reveals them. Invalidate first: the updates
    // below have to be addressed by who can see these channels *now*, not by a
    // cache still applying a layer that no longer exists.
    if (orphaned.length > 0) hub.invalidateServerPermissions(existing.serverId);

    const privateIds = await privateChannelIds(existing.serverId);
    for (const channel of orphaned) {
      // Permission-aware, because this event carries the channel's name and
      // some of these channels were only ever visible through the category.
      await hub.broadcastToChannel(existing.serverId, channel.id, {
        t: 'channel_update',
        d: serialize.channel({ ...channel, categoryId: null }, privateIds.has(channel.id)),
      });
    }

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

    await requireOverwriteTarget(ctx, body.targetType, targetId);

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

async function requireOverwriteTarget(
  ctx: MemberContext,
  targetType: 'role' | 'member',
  targetId: string,
): Promise<void> {
  const db = getDb();
  if (targetType === 'member') {
    const [member] = await db
      .select({ userId: members.userId })
      .from(members)
      .where(and(eq(members.serverId, ctx.serverId), eq(members.userId, targetId)))
      .limit(1);
    if (!member) throw badRequest('That member does not exist.', 'unknown_member');
    return;
  }

  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, targetId), eq(roles.serverId, ctx.serverId)))
    .limit(1);
  if (!role) throw badRequest('That role does not exist.', 'unknown_role');
  // @everyone sits at position 0 and is editable by anyone with the
  // permission; any other role must sit below the actor's highest.
  if (!role.isEveryone) requireRoleBelow(ctx, role.position);
}

/**
 * Turn the switch, with the same checks the overwrite editor makes: the roles
 * let in must sit below the actor, the people must be members, and the actor
 * is always let in themselves, because a channel you made private and then
 * cannot open is a support ticket, not a feature.
 */
async function setPrivacy(
  ctx: MemberContext,
  channelId: string,
  wanted: { private: boolean; roleIds: string[]; memberIds: string[] },
) {
  const db = getDb();
  const roleIds = [...new Set(wanted.roleIds)];
  const memberIds = [...new Set(wanted.memberIds)];

  if (wanted.private) {
    const rows = roleIds.length > 0
      ? await db.select().from(roles).where(and(eq(roles.serverId, ctx.serverId), inArray(roles.id, roleIds)))
      : [];
    if (rows.length !== roleIds.length) throw badRequest('One of those roles does not exist.', 'unknown_role');
    for (const role of rows) if (!role.isEveryone) requireRoleBelow(ctx, role.position);

    const present = memberIds.length > 0
      ? await db
          .select({ userId: members.userId })
          .from(members)
          .where(and(eq(members.serverId, ctx.serverId), inArray(members.userId, memberIds)))
      : [];
    if (present.length !== memberIds.length) throw badRequest('One of those people is not in this server.', 'unknown_member');
    if (!ctx.isOwner && !has(ctx.basePermissions, Permission.ADMINISTRATOR) && !memberIds.includes(ctx.userId)) {
      memberIds.push(ctx.userId);
    }
  }

  return applyPrivacy(channelId, ctx.serverId, {
    private: wanted.private,
    roleIds: roleIds.filter((id) => id !== ctx.everyoneRoleId),
    memberIds,
  });
}
