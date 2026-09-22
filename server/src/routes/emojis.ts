/**
 * Emoji a server uploads for itself.
 *
 * The image is handled the way an avatar is: the bytes are streamed straight
 * to the object store under a key we generate, the declared type is checked
 * against a short list and never trusted for anything but display, and the
 * download is served by this process so it can be permission-checked. As with
 * avatars, the metadata is stripped in the browser before the upload starts
 * (`web/src/lib/scrub-image.ts`), because under Milestone 7 the server cannot
 * be where that is fixed.
 *
 * Adding and removing need MANAGE_SERVER; seeing the list, or the image, needs
 * only membership. Both are decided here, not in the client.
 */

import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { LIMITS, Permission, validateEmojiName } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { emojis } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { uuidv7 } from '../lib/ids.js';
import * as audit from '../services/audit.js';
import { requireMember, requireServerPermission } from '../services/permissions.js';
import * as serialize from '../services/serialize.js';
import { buildStorageKey, deleteObject, readFromS3, readStream, saveStream } from '../services/storage.js';

/**
 * PNG, GIF and WebP only. An emoji is drawn with an `<img>` in every client,
 * and SVG in an `<img>` is a document that can carry script, so it is not on
 * the list and should not be added to it.
 */
const EMOJI_TYPES = new Set(['image/png', 'image/gif', 'image/webp']);

export async function registerEmojiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/servers/:serverId/emojis', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireMember(serverId, user.id);

    const rows = await getDb()
      .select()
      .from(emojis)
      .where(eq(emojis.serverId, serverId))
      .orderBy(asc(emojis.name));

    return { emojis: rows.map(serialize.emoji) };
  });

  app.post('/api/servers/:serverId/emojis', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const db = getDb();

    // Checked before the body is read, so a server that is already full does
    // not have to receive the image to be told so.
    const [tally] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emojis)
      .where(eq(emojis.serverId, serverId));
    if ((tally?.count ?? 0) >= LIMITS.emojisPerServer) {
      throw badRequest(
        `A server can hold ${LIMITS.emojisPerServer} emoji. Remove one first.`,
        'too_many_emojis',
      );
    }

    const file = await request.file({ limits: { fileSize: LIMITS.emojiBytes } });
    if (!file) throw badRequest('No image was uploaded.', 'no_file');

    /**
     * A file stream the parser handed us has to be read to the end whether we
     * want the bytes or not, or the request never finishes. Mistyping a name is
     * the ordinary way to reach this route and fail, so refusing has to leave
     * the connection in a state the next attempt can use.
     */
    const refuse = (message: string, code: string) => {
      file.file.resume();
      return badRequest(message, code);
    };

    if (!EMOJI_TYPES.has(file.mimetype)) {
      throw refuse('An emoji has to be a PNG, GIF or WebP image.', 'not_an_image');
    }

    // The name rides along in the same multipart body, written before the file
    // so the parser has already seen it by the time the file arrives.
    const field = file.fields.name;
    const declared = field && !Array.isArray(field) && field.type === 'field' ? String(field.value) : '';
    const name = declared.trim().toLowerCase();
    const check = validateEmojiName(name);
    if (!check.ok) throw refuse(check.error, 'invalid_emoji_name');

    const storageKey = buildStorageKey(file.filename);
    await saveStream(storageKey, file.file);
    if (file.file.truncated) {
      await deleteObject(storageKey);
      throw badRequest(
        `An emoji image is limited to ${Math.round(LIMITS.emojiBytes / 1024)} KB.`,
        'file_too_large',
      );
    }

    const id = uuidv7();
    let created;
    try {
      [created] = await db
        .insert(emojis)
        .values({ id, serverId, name, uploaderId: user.id, storageKey, contentType: file.mimetype })
        .returning();
    } catch {
      // The unique index is what decides a name is taken, so the answer comes
      // from the insert failing rather than from a check that can be raced.
      await deleteObject(storageKey).catch(() => undefined);
      throw badRequest('This server already has an emoji with that name.', 'emoji_name_taken');
    }
    if (!created) throw badRequest('Could not add the emoji.', 'create_failed');

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'emoji.create',
      targetType: 'emoji',
      targetId: created.id,
      changes: { name: created.name },
    });

    announce(serverId);

    return { emoji: serialize.emoji(created) };
  });

  app.delete('/api/servers/:serverId/emojis/:emojiId', async (request) => {
    const user = requireUser(request);
    const { serverId, emojiId } = z
      .object({ serverId: z.string(), emojiId: z.string() })
      .parse(request.params);

    await requireServerPermission(serverId, user.id, Permission.MANAGE_SERVER);

    const db = getDb();
    const [existing] = await db
      .select()
      .from(emojis)
      .where(and(eq(emojis.id, emojiId), eq(emojis.serverId, serverId)))
      .limit(1);
    if (!existing) throw notFound('No such emoji.', 'unknown_emoji');

    await db.delete(emojis).where(eq(emojis.id, emojiId));
    await deleteObject(existing.storageKey).catch(() => undefined);

    await audit.record({
      serverId,
      actorId: user.id,
      action: 'emoji.delete',
      targetType: 'emoji',
      targetId: emojiId,
      changes: { name: existing.name },
    });

    announce(serverId);

    return { ok: true };
  });

  app.get('/api/emojis/:emojiId/image', async (request, reply) => {
    const user = requireUser(request);
    const { emojiId } = z.object({ emojiId: z.string() }).parse(request.params);

    const [row] = await getDb().select().from(emojis).where(eq(emojis.id, emojiId)).limit(1);
    if (!row) throw notFound('No such emoji.', 'unknown_emoji');
    // An emoji is a thing the server shows its own members, so the bytes go no
    // further than that, even though the id is not guessable.
    await requireMember(row.serverId, user.id);

    void reply.header('Content-Type', row.contentType);
    // The id names these exact bytes for as long as the emoji exists, so a copy
    // can be kept for a week.
    void reply.header('Cache-Control', 'private, max-age=604800, immutable');
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (config.storage.driver === 's3') return reply.send(await readFromS3(row.storageKey));
    return reply.send(readStream(row.storageKey));
  });
}

/** Everyone in the server refetches the list. See `emojis_changed` in the protocol. */
function announce(serverId: string): void {
  hub.broadcastToServer(serverId, { t: 'emojis_changed', d: { serverId } });
}
