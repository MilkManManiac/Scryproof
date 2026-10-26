/**
 * A card for a YouTube link: the title, who posted it, and the thumbnail.
 *
 * This box fetches both from YouTube once and hands them to members, so the
 * people in the room never talk to Google: no cookies, no IP, no "which
 * private server embedded me". What Google sees is one request from the box
 * for a public video id. The card never embeds a player; it links out.
 *
 * In an encrypted channel or a DM the client asks for a card only when the
 * reader presses for it, because asking tells this server which video a
 * sealed message pointed at.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../app.js';
import { badRequest, notFound, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';

/** YouTube ids are eleven characters from this set, which also keeps them out of any URL trick. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const UPSTREAM_TIMEOUT_MS = 6_000;
/** hqdefault.jpg is about 20 KB. Anything near this is not a thumbnail. */
const THUMB_MAX_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const LOOKUPS_PER_MINUTE = 60;

export interface YouTubeCard {
  title: string;
  author: string;
}

interface Cached<T> {
  value: T;
  at: number;
}

// ponytail: in-memory, one process; move to the DB if a restart dropping cards ever matters.
const cards = new Map<string, Promise<Cached<YouTubeCard | null>>>();
const thumbs = new Map<string, Promise<Cached<Buffer | null>>>();

function remember<T>(store: Map<string, Promise<Cached<T>>>, id: string, make: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = store.get(id);
  if (existing) {
    return existing.then((hit) => {
      if (now - hit.at < CACHE_TTL_MS) return hit.value;
      store.delete(id);
      return remember(store, id, make);
    });
  }
  if (store.size >= CACHE_MAX) store.delete(store.keys().next().value!);
  const made = make()
    .catch(() => null as T)
    .then((value) => ({ value, at: Date.now() }));
  store.set(id, made);
  return made.then((hit) => hit.value);
}

async function fetchCard(id: string): Promise<YouTubeCard | null> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok) return null;
  const body = z.object({ title: z.string().max(400), author_name: z.string().max(200).default('') }).safeParse(await response.json());
  if (!body.success) return null;
  return { title: body.data.title, author: body.data.author_name };
}

async function fetchThumb(id: string): Promise<Buffer | null> {
  const response = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    redirect: 'error',
  });
  if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('image/jpeg')) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  // JPEG starts FF D8; a page served as an image is not one.
  if (bytes.length > THUMB_MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  return bytes;
}

/** Exposed so the tests can swap what "YouTube said" without a network. */
export const upstream = { card: fetchCard, thumb: fetchThumb };

const videoId = (params: unknown): string => {
  const { id } = z.object({ id: z.string() }).parse(params);
  if (!VIDEO_ID.test(id)) throw badRequest('That is not a YouTube video id.');
  return id;
};

export async function registerLinkPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/link-preview/youtube/:id', async (request) => {
    const user = requireUser(request);
    const id = videoId(request.params);
    const limit = consume(`link-preview:${user.id}`, LOOKUPS_PER_MINUTE, 60_000);
    if (!limit.allowed) throw tooManyRequests('Too many link lookups. Give it a minute.', limit.retryAfterSeconds);
    const card = await remember(cards, id, () => upstream.card(id));
    if (!card) throw notFound('YouTube has nothing by that id.');
    return { ...card, thumbnail: `/api/link-preview/youtube/${id}/thumb` };
  });

  app.get('/api/link-preview/youtube/:id/thumb', async (request, reply) => {
    requireUser(request);
    const id = videoId(request.params);
    const bytes = await remember(thumbs, id, () => upstream.thumb(id));
    if (!bytes) throw notFound('No thumbnail.');
    void reply.header('Content-Type', 'image/jpeg');
    void reply.header('Content-Length', String(bytes.length));
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    void reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(bytes);
  });
}
