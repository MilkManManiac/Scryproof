/**
 * A server's picture (Wes, 2026-10-22: "Let people add pics or gifs for server
 * icons"). The same shape as an avatar: uploaded by someone who may manage the
 * server, kept in the object store, served at an address that changes with
 * every new picture, and only to members. A GIF is kept as it came so it still
 * moves; the browser scrubs the still formats before they are sent.
 */

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { Permission } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { serverIcons, servers } from '../db/schema.js';
import { uuidv7 } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/http-error.js';
import * as hub from '../gateway/hub.js';
import * as audit from '../services/audit.js';
import * as serialize from '../services/serialize.js';
import { requireServerPermission } from '../services/permissions.js';
import { isMember } from '../services/servers.js';
import { buildStorageKey, deleteObject, readFromS3, readStream, saveStream } from '../services/storage.js';
import { guardUpload } from './attachments.js';
import { config } from '../config.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_ICON_BYTES = 2 * 1024 * 1024;

export async function registerServerIconRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/servers/:serverId/icon', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);
    await guardUpload(user.id);

    const file = await request.file({ limits: { fileSize: MAX_ICON_BYTES } });
    if (!file) throw badRequest('No picture was uploaded.', 'no_file');
    if (!IMAGE_TYPES.has(file.mimetype)) throw badRequest('That is not a picture this app can show.', 'not_an_image');

    const storageKey = buildStorageKey(file.filename);
    const stored = await saveStream(storageKey, file.file);
    if (file.file.truncated) {
      await deleteObject(storageKey);
      throw badRequest('Pictures are limited to 2 MB.', 'file_too_large');
    }

    const db = getDb();
    const id = uuidv7();
    await db.insert(serverIcons).values({ id, serverId, storageKey, contentType: file.mimetype, size: stored.size });
    return { server: await point(serverId, user.id, `/api/server-icons/${serverId}/${id}`) };
  });

  app.delete('/api/servers/:serverId/icon', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);
    return { server: await point(serverId, user.id, null) };
  });

  app.get('/api/server-icons/:serverId/:iconId', async (request, reply) => {
    const user = requireUser(request);
    const { serverId, iconId } = z.object({ serverId: z.string(), iconId: z.string() }).parse(request.params);
    if (!(await isMember(serverId, user.id))) throw notFound('No such picture.', 'unknown_icon');
    const [row] = await getDb().select().from(serverIcons).where(eq(serverIcons.id, iconId)).limit(1);
    if (!row || row.serverId !== serverId) throw notFound('No such picture.', 'unknown_icon');

    void reply.header('Content-Type', row.contentType);
    void reply.header('Content-Length', String(row.size));
    void reply.header('Cache-Control', 'private, max-age=604800, immutable');
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (config.storage.driver === 's3') return reply.send(await readFromS3(row.storageKey));
    return reply.send(readStream(row.storageKey));
  });
}

/** Point the server at this picture (or none), drop the one before, and tell everyone in it. */
async function point(serverId: string, actorId: string, iconUrl: string | null) {
  const db = getDb();
  const [previous] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  const [updated] = await db.update(servers).set({ iconUrl }).where(eq(servers.id, serverId)).returning();
  if (!updated) throw notFound('That server does not exist.', 'unknown_server');
  const old = previous?.iconUrl?.split('/').pop();
  if (old) {
    const [row] = await db.select().from(serverIcons).where(eq(serverIcons.id, old)).limit(1);
    if (row) {
      await db.delete(serverIcons).where(eq(serverIcons.id, old));
      await deleteObject(row.storageKey).catch(() => undefined);
    }
  }
  await audit.record({ serverId, actorId, action: 'server.update', targetType: 'server', targetId: serverId, changes: { iconUrl } });
  hub.broadcastToServer(serverId, { t: 'server_update', d: serialize.server(updated) });
  return serialize.server(updated);
}
