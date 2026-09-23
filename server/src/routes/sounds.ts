/**
 * The soundboard: short clips a server uploads, played into its calls.
 *
 * Handled the way custom emoji are. The bytes stream straight to the object
 * store under a key we generate, the declared type is checked against a short
 * list and used for nothing but the Content-Type header, and the download is
 * served by this process so it can be permission-checked.
 *
 * The length of a clip is checked in the browser before upload, not here:
 * knowing how long a piece of audio is means decoding it, and this process is
 * not going to run an audio decoder on files from the internet. What it does
 * hold is the size and the type, which bound the same thing well enough.
 *
 * Adding, renaming and removing need MANAGE_SERVER, the same bit custom emoji
 * use. Seeing the list, or fetching a clip, needs only membership. Playing one
 * into a call is not a request to this file at all: it is a track published to
 * the media server, and the voice token decides whether that is allowed.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, isSoundType, validateSoundName } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { sounds } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as audit from '../services/audit.js';
import { requireMember, requireServerPermission } from '../services/permissions.js';
import * as serialize from '../services/serialize.js';
import { buildStorageKey, deleteObject, readFromS3, readStream, saveStream } from '../services/storage.js';

const EXTENSION: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
};

const tooBig = () =>
  badRequest(`A sound is limited to ${Math.round(LIMITS.soundBytes / 1024 / 1024)} MB.`, 'file_too_large');

export async function registerSoundRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/servers/:serverId/sounds', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);

    const rows = await getDb()
      .select()
      .from(sounds)
      .where(eq(sounds.serverId, serverId))
      .orderBy(asc(sounds.createdAt));

    return { sounds: rows.map(serialize.sound) };
  });

  app.post('/api/servers/:serverId/sounds', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const db = getDb();

    // Checked before the body is read, so a full board does not have to
    // receive a clip to be told so.
    const [tally] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sounds)
      .where(eq(sounds.serverId, serverId));
    if ((tally?.count ?? 0) >= LIMITS.soundsPerServer) {
      throw badRequest(
        `A server can hold ${LIMITS.soundsPerServer} sounds. Remove one first.`,
        'too_many_sounds',
      );
    }

    const file = await request.file({ limits: { fileSize: LIMITS.soundBytes } });
    if (!file) throw badRequest('No sound was uploaded.', 'no_file');

    // The stream has to be drained whether we keep it or not, or the request
    // never finishes and the next attempt on this connection hangs.
    const refuse = (message: string, code: string) => {
      file.file.resume();
      return badRequest(message, code);
    };

    if (!isSoundType(file.mimetype)) {
      throw refuse('A sound has to be a WebM, Ogg or MP3 file.', 'not_a_sound');
    }

    // The name comes before the file in the multipart body, so the parser has
    // already read it by the time the file arrives.
    const field = file.fields.name;
    const declared = field && !Array.isArray(field) && field.type === 'field' ? String(field.value) : '';
    const check = validateSoundName(declared);
    if (!check.ok) throw refuse(check.error, 'invalid_sound_name');
    const name = declared.trim();

    // The key's extension is ours, from the checked type, not from whatever
    // the uploader's file happened to be called.
    const storageKey = buildStorageKey(`clip${EXTENSION[file.mimetype] ?? ''}`);
    const stored = await saveStream(storageKey, file.file);
    if (file.file.truncated || stored.size > LIMITS.soundBytes) {
      await deleteObject(storageKey).catch(() => undefined);
      throw tooBig();
    }
    if (stored.size === 0) {
      await deleteObject(storageKey).catch(() => undefined);
      throw badRequest('That file is empty.', 'empty_file');
    }

    const [created] = await db
      .insert(sounds)
      .values({
        id: uuidv7(),
        serverId,
        name,
        storageKey,
        contentType: file.mimetype,
        bytes: stored.size,
        createdBy: user.id,
      })
      .returning();
    if (!created) {
      await deleteObject(storageKey).catch(() => undefined);
      throw badRequest('Could not add the sound.', 'create_failed');
    }

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'sound.create',
      targetType: 'sound',
      targetId: created.id,
      changes: { name: created.name },
    });

    announce(serverId);

    return { sound: serialize.sound(created) };
  });

  app.patch('/api/servers/:serverId/sounds/:soundId', async (request) => {
    const user = requireUser(request);
    const { serverId, soundId } = z
      .object({ serverId: z.string(), soundId: z.string() })
      .parse(request.params);
    const body = z.object({ name: z.string() }).parse(request.body);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const check = validateSoundName(body.name);
    if (!check.ok) throw badRequest(check.error, 'invalid_sound_name');
    const name = body.name.trim();

    const db = getDb();
    const [existing] = await db
      .select()
      .from(sounds)
      .where(and(eq(sounds.id, soundId), eq(sounds.serverId, serverId)))
      .limit(1);
    if (!existing) throw notFound('No such sound.', 'unknown_sound');

    const [updated] = await db.update(sounds).set({ name }).where(eq(sounds.id, soundId)).returning();
    if (!updated) throw notFound('No such sound.', 'unknown_sound');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'sound.update',
      targetType: 'sound',
      targetId: soundId,
      changes: { name: { from: existing.name, to: updated.name } },
    });

    announce(serverId);

    return { sound: serialize.sound(updated) };
  });

  app.delete('/api/servers/:serverId/sounds/:soundId', async (request) => {
    const user = requireUser(request);
    const { serverId, soundId } = z
      .object({ serverId: z.string(), soundId: z.string() })
      .parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(sounds)
      .where(and(eq(sounds.id, soundId), eq(sounds.serverId, serverId)))
      .limit(1);
    if (!existing) throw notFound('No such sound.', 'unknown_sound');

    await db.delete(sounds).where(eq(sounds.id, soundId));
    await deleteObject(existing.storageKey).catch(() => undefined);

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'sound.delete',
      targetType: 'sound',
      targetId: soundId,
      changes: { name: existing.name },
    });

    announce(serverId);

    return { ok: true };
  });

  /**
   * The clip itself. The name in the path is decoration for a saved copy;
   * the id alone decides what is served, and membership decides whether.
   */
  app.get('/api/sounds/:soundId/:name', async (request, reply) => {
    const user = requireUser(request);
    const { soundId } = z.object({ soundId: z.string(), name: z.string() }).parse(request.params);

    const [row] = await getDb().select().from(sounds).where(eq(sounds.id, soundId)).limit(1);
    if (!row) throw notFound('No such sound.', 'unknown_sound');
    // A soundboard is the server's own, so the bytes go no further than its
    // members, even though the id is not guessable.
    await requireMember(row.serverId, user.id);

    void reply.header('Content-Type', row.contentType);
    void reply.header('Content-Length', String(row.bytes));
    // The id names these exact bytes for as long as the sound exists; a
    // rename changes only the path, never the bytes behind the id.
    void reply.header('Cache-Control', 'private, max-age=604800, immutable');
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (config.storage.driver === 's3') return reply.send(await readFromS3(row.storageKey));
    return reply.send(readStream(row.storageKey));
  });
}

/** Everyone in the server refetches the list. See `sounds_changed` in the protocol. */
function announce(serverId: string): void {
  hub.broadcastToServer(serverId, { t: 'sounds_changed', d: { serverId } });
}
