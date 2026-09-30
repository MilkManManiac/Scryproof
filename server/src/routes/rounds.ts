/**
 * Whereabouts' and Lowball's routes: today, a guess, a server's board, and
 * the photos.
 *
 * The server is the referee. It holds where each photo was taken and what
 * each home cost, sends a round only once the one before it has been guessed,
 * and sends the answer only with the guess. A photo is handed out only for a
 * round someone has reached: today's next photo is not there to be peeked at.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { z } from 'zod';

import { nextPurdleAt, ROUNDS_OPEN, roundsDay, roundsStanding } from '@scryproof/shared';
import type { RoundsFinish, RoundsGame, RoundsStanding, RoundsToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { members, roundsDays, roundsPlays, type RoundsPlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, notFound, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { itemsFor, pointsFor, readGuess, shown } from '../rounds/rounds.js';
import { PHOTO_FOLDER, STOCK } from '../rounds/stock.js';
import { requireMember } from '../services/permissions.js';

/** A game that is out; one that is not is not there. */
const Game = z.enum(['whereabouts', 'lowball']).refine((game) => ROUNDS_OPEN[game]);

async function scoresOf(game: RoundsGame, userIds: string[]): Promise<Map<string, Map<number, number>>> {
  const byUser = new Map<string, Map<number, number>>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: roundsPlays.userId, day: roundsPlays.day, score: roundsPlays.score })
    .from(roundsPlays)
    .where(and(eq(roundsPlays.game, game), inArray(roundsPlays.userId, userIds), isNotNull(roundsPlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, row.score);
  return byUser;
}

async function playFor(game: RoundsGame, userId: string, day: number): Promise<RoundsPlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(roundsPlays)
    .where(and(eq(roundsPlays.game, game), eq(roundsPlays.userId, userId), eq(roundsPlays.day, day)))
    .limit(1);
  return row ?? null;
}

const pointsOf = (game: RoundsGame, items: readonly string[], guesses: readonly unknown[]): number[] =>
  guesses.map((guess, at) => pointsFor(game, items[at]!, guess));

async function todayFor(
  game: RoundsGame,
  userId: string,
  row: RoundsPlayRow | null,
  day: number,
  items: string[],
): Promise<RoundsToday<unknown>> {
  const guesses = row?.guesses ?? [];
  const done = guesses.length >= items.length;
  // Every round guessed, and the next one while the day is not done.
  const reached = Math.min(items.length, guesses.length + 1);
  const { played, best, average } = roundsStanding(userId, [...(await scoresOf(game, [userId])).get(userId)!.values()]);
  return {
    day,
    rounds: items.slice(0, reached).map((id, at) => shown(game, id, guesses[at])),
    score: pointsOf(game, items, guesses).reduce((sum, points) => sum + points, 0),
    state: done ? 'done' : 'playing',
    nextAt: nextPurdleAt().toISOString(),
    stats: { played, best, average },
  };
}

/** `g_0123456789ab.jpg` is a place; `h_0123456789ab_2.jpg` is a home's second photo. */
function readPhotoName(file: string): { game: RoundsGame; id: string } | null {
  const place = /^(g_[0-9a-f]{12})\.jpg$/.exec(file);
  if (place) return { game: 'whereabouts', id: place[1]! };
  const home = /^(h_[0-9a-f]{12})_[1-9]\.jpg$/.exec(file);
  if (home && ROUNDS_OPEN.lowball) return { game: 'lowball', id: home[1]! };
  return null;
}

export async function registerRoundsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/rounds/:game/today', async (request) => {
    const user = requireUser(request);
    const { game } = z.object({ game: Game }).parse(request.params);
    const day = roundsDay(game);
    return todayFor(game, user.id, await playFor(game, user.id, day), day, await itemsFor(game, day));
  });

  /** A guess at the open round: `{ guess: { lat, lng } }` or `{ guess: 450000 }`. */
  app.post('/api/rounds/:game/guess', async (request) => {
    const user = requireUser(request);
    const { game } = z.object({ game: Game }).parse(request.params);
    const body = z.object({ guess: z.unknown() }).parse(request.body);
    const guess = readGuess(game, body.guess);
    if (guess === null) throw badRequest(game === 'lowball' ? 'That is not a price.' : 'That is not a place on the map.');
    const limit = consume(`rounds:${game}:${user.id}`, 20, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = roundsDay(game);
    const items = await itemsFor(game, day);

    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(roundsPlays)
        .where(and(eq(roundsPlays.game, game), eq(roundsPlays.userId, user.id), eq(roundsPlays.day, day)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict(`You have played today. New ${game === 'lowball' ? 'homes' : 'places'} come at midnight Eastern.`, 'finished');

      const guesses = [...(existing?.guesses ?? []), guess];
      const score = pointsOf(game, items, guesses).reduce((sum, points) => sum + points, 0);
      const finishedAt = guesses.length >= items.length ? new Date() : null;
      const [saved] = await tx
        .insert(roundsPlays)
        .values({ game, userId: user.id, day, guesses, score, finishedAt })
        .onConflictDoUpdate({ target: [roundsPlays.game, roundsPlays.userId, roundsPlays.day], set: { guesses, score, finishedAt } })
        .returning();
      return saved!;
    });

    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, { t: 'game_done', d: { game, serverId, day, userId: user.id } });
      }
    }
    return todayFor(game, user.id, row, day, items);
  });

  /** Who in this server has finished today, and everyone's record here. Members only. */
  app.get('/api/rounds/:game/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { game, serverId } = z.object({ game: Game, serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = roundsDay(game);
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);

    const finishes: RoundsFinish[] = [];
    if (memberIds.length > 0) {
      const rows = await getDb()
        .select()
        .from(roundsPlays)
        .where(
          and(
            eq(roundsPlays.game, game),
            eq(roundsPlays.day, day),
            inArray(roundsPlays.userId, memberIds),
            isNotNull(roundsPlays.finishedAt),
          ),
        );
      const items = rows.length > 0 ? await itemsFor(game, day) : [];
      for (const row of rows) finishes.push({ userId: row.userId, score: row.score, points: pointsOf(game, items, row.guesses) });
    }

    const standings: RoundsStanding[] = [];
    for (const [userId, scores] of await scoresOf(game, memberIds)) {
      if (scores.size > 0) standings.push(roundsStanding(userId, [...scores.values()]));
    }
    return { day, finishes, standings };
  });

  /**
   * A photo, for anyone signed in, once its round has been reached: any
   * round of an earlier day, and today's up to the one you are on.
   */
  app.get<{ Params: { file: string } }>('/api/rounds/photo/:file', async (request, reply) => {
    const user = requireUser(request);
    const named = readPhotoName(request.params.file);
    if (!named || !STOCK[named.game].has(named.id)) throw notFound('There is no such photo.');
    const { game, id } = named;

    const today = roundsDay(game);
    const days = await getDb()
      .select()
      .from(roundsDays)
      .where(and(eq(roundsDays.game, game), lte(roundsDays.day, today)));
    const day = days.find((row) => row.items.includes(id));
    if (!day) throw notFound('There is no such photo.');
    if (day.day === today) {
      const guessed = (await playFor(game, user.id, today))?.guesses.length ?? 0;
      if (day.items.indexOf(id) > guessed) throw notFound('There is no such photo.');
    }

    const path = resolve(config.gamePhotosDir, PHOTO_FOLDER[game], request.params.file);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw notFound('That photo is not on the box yet.');
    }
    void reply.header('Content-Type', 'image/jpeg');
    void reply.header('Content-Length', String(size));
    void reply.header('Cache-Control', 'private, max-age=604800, immutable');
    return reply.send(createReadStream(path));
  });
}
