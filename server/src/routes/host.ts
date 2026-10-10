/**
 * What only the host can do: the person who runs this instance, the same one
 * who may make servers (`canCreateServers`). Everything else in the app is
 * per server; this is the one place that reaches across all of them.
 *
 * Removing someone from Scryproof (Wes, 2026-09-28: "how do i kick someone
 * from the app"). Their account is disabled, so they cannot sign in again;
 * every sign-in they have stops; their open windows are cut off now rather
 * than at their next reload; they are taken out of every server and every
 * call. Each server they were in gets a kick in its audit log and the same
 * rule a kick makes: an invite from before it will not bring them back.
 *
 * What stays: their messages, and the DMs other people had with them. Those
 * belong to the conversation, and DMs are sealed on devices anyway.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { kicks, members, pushSubscriptions, servers, users } from '../db/schema.js';
import { disconnectFromVoice } from '../gateway/voice.js';
import * as hub from '../gateway/hub.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import * as audit from '../services/audit.js';
import { revokeAllSessions } from '../services/auth.js';
import { canCreateServers, removeMember } from '../services/servers.js';

export async function registerHostRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/host/remove-account', async (request) => {
    const actor = requireUser(request);
    if (!(await canCreateServers(actor.id))) throw forbidden('Only the host can remove someone from Scryproof.');
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.body);
    if (userId === actor.id) throw badRequest('You cannot remove yourself.', 'remove_self');

    const db = getDb();
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.disabledAt)))
      .limit(1);
    if (!target) throw notFound('There is no such account, or it is already removed.', 'unknown_user');

    // A server with no owner is one nobody can delete or recover.
    const owned = await db.select({ name: servers.name }).from(servers).where(eq(servers.ownerId, userId));
    if (owned.length > 0) {
      throw badRequest(
        `They own ${owned.map((server) => server.name).join(', ')}. Transfer or delete that first.`,
        'owns_server',
      );
    }

    // Locked out first, so nothing below races a request they are making.
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
    await revokeAllSessions(userId);
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

    const memberships = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, userId));
    const kickedAt = new Date();
    for (const { serverId } of memberships) {
      await db
        .insert(kicks)
        .values({ serverId, userId, kickedAt })
        .onConflictDoUpdate({ target: [kicks.serverId, kicks.userId], set: { kickedAt } });
      await disconnectFromVoice(serverId, userId);
      await removeMember(serverId, userId);
      await audit.record({
        serverId,
        actorId: actor.id,
        action: 'member.kick',
        targetType: 'member',
        targetId: userId,
        changes: { removedFromScryproof: true },
      });
      hub.broadcastToServer(serverId, { t: 'member_leave', d: { userId, serverId } });
      hub.removeUserFromServer(userId, serverId);
    }

    // Out of any DM call too. Their windows were already cut off with 4001
    // by revokeAllSessions above: their app goes to sign-in, where the
    // account is refused as disabled.
    await hub.announceCleared(hub.clearVoiceStatesForUser(userId));

    return { ok: true, servers: memberships.length };
  });
}
