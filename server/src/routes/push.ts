/**
 * Phone notifications: turning them on and off for this device, and what a
 * woken phone asks for. The rules are in `services/push.ts`.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import { badRequest, unauthorized } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import { isRelayEndpoint } from '../lib/web-push.js';
import { markSeen, pendingFor, pushPublicKey } from '../services/push.js';

const endpointShape = z.string().min(1).max(1024);
const idList = z.array(z.string().min(1).max(64)).max(500);

export async function registerPushRoutes(app: FastifyInstance): Promise<void> {
  /** The key a browser subscribes with, or null when this server has push off. */
  app.get('/api/push', async (request) => {
    requireUser(request);
    return { publicKey: pushPublicKey() };
  });

  /** Turn it on for this device, or update what this device has muted. */
  app.put('/api/push/subscription', async (request) => {
    const user = requireUser(request);
    if (!request.sessionId) throw unauthorized();
    if (!pushPublicKey()) throw badRequest('Phone notifications are not switched on for this server.', 'push_off');
    const body = z
      .object({ endpoint: endpointShape, mutedServers: idList, mutedChannels: idList })
      .parse(request.body);
    if (!isRelayEndpoint(body.endpoint)) {
      throw badRequest('That is not a notification service this server knows.', 'push_endpoint');
    }

    // One row per device. The same phone signed in as somebody else becomes
    // theirs: the browser has one subscription, and it follows the session.
    await getDb()
      .insert(pushSubscriptions)
      .values({
        id: uuidv7(),
        userId: user.id,
        sessionId: request.sessionId,
        endpoint: body.endpoint,
        mutedServers: body.mutedServers,
        mutedChannels: body.mutedChannels,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          sessionId: request.sessionId,
          mutedServers: body.mutedServers,
          mutedChannels: body.mutedChannels,
        },
      });
    return { ok: true };
  });

  app.delete('/api/push/subscription', async (request) => {
    const user = requireUser(request);
    const body = z.object({ endpoint: endpointShape }).parse(request.body);
    await getDb()
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, body.endpoint), eq(pushSubscriptions.userId, user.id)));
    return { ok: true };
  });

  /** Asked by the service worker the moment a ping wakes it. */
  app.post('/api/push/pending', async (request) => {
    const user = requireUser(request);
    const body = z.object({ endpoint: endpointShape }).parse(request.body);
    return pendingFor(user.id, body.endpoint);
  });

  /** The app was opened: the number on its icon goes. */
  app.post('/api/push/seen', async (request) => {
    const user = requireUser(request);
    markSeen(user.id);
    return { ok: true };
  });
}
