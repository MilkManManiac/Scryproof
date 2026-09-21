/**
 * What a person says about themselves: display name, a line of status, a
 * picture. All of it is public to anyone who shares a server with them, which
 * is the same set of people who could see them in a member list anyway.
 *
 * The picture is stored under a key that is not guessable, and served only to
 * signed-in members. It is not a public URL: nothing here is reachable without
 * a session. The browser strips a photo's location data before it is uploaded
 * (scrub-image.ts); the server still never trusts the declared type.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { LIMITS } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { avatars, members, users } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as serialize from '../services/serialize.js';
import { buildStorageKey, deleteObject, readFromS3, readStream, saveStream } from '../services/storage.js';
import { config } from '../config.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
/** Big enough for a scrubbed 512px picture many times over. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Everyone who can see this person, told that they look different now. */
async function announce(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return;
  const user = serialize.publicUser(row);
  const memberships = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, userId));
  // Somebody in two shared servers hears it twice. The client does not mind.
  for (const { serverId } of memberships) hub.broadcastToServer(serverId, { t: 'user_update', d: user });
  hub.sendToUser(userId, { t: 'user_update', d: user });
}

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.patch('/api/auth/profile', async (request) => {
    const user = requireUser(request);
    const parsed = z
      .object({
        displayName: z.string().trim().min(LIMITS.displayName.min).max(LIMITS.displayName.max).optional(),
        // One line. Newlines would let a status pretend to be more than it is.
        statusText: z.string().trim().max(LIMITS.statusText).regex(/^[^\n\r]*$/).nullable().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw badRequest('A name is 1 to 48 characters and a status is one line of up to 80.', 'invalid_profile');
    const body = parsed.data;

    const patch: Partial<{ displayName: string; statusText: string | null }> = {};
    if (body.displayName !== undefined) patch.displayName = body.displayName;
    if (body.statusText !== undefined) patch.statusText = body.statusText || null;
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to change.', 'empty_patch');

    const [updated] = await getDb().update(users).set(patch).where(eq(users.id, user.id)).returning();
    if (!updated) throw notFound('That account does not exist.', 'unknown_user');
    await announce(user.id);
    return { user: serialize.selfUser(updated) };
  });

  app.post('/api/auth/avatar', async (request) => {
    const user = requireUser(request);
    const file = await request.file({ limits: { fileSize: MAX_AVATAR_BYTES } });
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
    await db.insert(avatars).values({ id, userId: user.id, storageKey, contentType: file.mimetype, size: stored.size });

    // The old picture goes with the old address. Anyone still showing it reloads on the update.
    const [previous] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const [updated] = await db
      .update(users)
      .set({ avatarUrl: `/api/avatars/${user.id}/${id}` })
      .where(eq(users.id, user.id))
      .returning();
    if (!updated) throw notFound('That account does not exist.', 'unknown_user');
    await forget(previous?.avatarUrl ?? null);
    await announce(user.id);
    return { user: serialize.selfUser(updated) };
  });

  app.delete('/api/auth/avatar', async (request) => {
    const user = requireUser(request);
    const db = getDb();
    const [previous] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const [updated] = await db.update(users).set({ avatarUrl: null }).where(eq(users.id, user.id)).returning();
    if (!updated) throw notFound('That account does not exist.', 'unknown_user');
    await forget(previous?.avatarUrl ?? null);
    await announce(user.id);
    return { user: serialize.selfUser(updated) };
  });

  app.get('/api/avatars/:userId/:avatarId', async (request, reply) => {
    requireUser(request);
    const { userId, avatarId } = z.object({ userId: z.string(), avatarId: z.string() }).parse(request.params);
    const [row] = await getDb().select().from(avatars).where(eq(avatars.id, avatarId)).limit(1);
    if (!row || row.userId !== userId) throw notFound('No such picture.', 'unknown_avatar');

    void reply.header('Content-Type', row.contentType);
    void reply.header('Content-Length', String(row.size));
    // The address changes with every new picture, so a copy can be kept a long while.
    void reply.header('Cache-Control', 'private, max-age=604800, immutable');
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (config.storage.driver === 's3') return reply.send(await readFromS3(row.storageKey));
    return reply.send(readStream(row.storageKey));
  });
}

/** Remove a picture by the address it was served at. */
async function forget(avatarUrl: string | null): Promise<void> {
  const id = avatarUrl?.split('/').pop();
  if (!id) return;
  const db = getDb();
  const [row] = await db.select().from(avatars).where(eq(avatars.id, id)).limit(1);
  if (!row) return;
  await db.delete(avatars).where(eq(avatars.id, id));
  await deleteObject(row.storageKey).catch(() => undefined);
}
