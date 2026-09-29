/**
 * Queefs' routes: today, start, solve, and a server's board.
 *
 * It is a race, so the server keeps the clock. The board is not sent until
 * you start, the clock starts when it is, and it stops when the server has
 * checked the queens itself. Closing the game does not stop it.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { QUEENS, nextPurdleAt, queensDay, queensSolved, queensStats } from '@scryproof/shared';
import type { QueensFinish, QueensStanding, QueensToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { members, queensPlays, type QueensPlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { boardFor } from '../queens/queens.js';
import { requireMember } from '../services/permissions.js';

/** Every day each of these people solved, and how long it took. */
async function timesOf(userIds: string[]): Promise<Map<string, Map<number, number>>> {
  const byUser = new Map<string, Map<number, number>>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: queensPlays.userId, day: queensPlays.day, seconds: queensPlays.seconds })
    .from(queensPlays)
    .where(and(inArray(queensPlays.userId, userIds), isNotNull(queensPlays.seconds)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, row.seconds!);
  return byUser;
}

async function playFor(userId: string, day: number): Promise<QueensPlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(queensPlays)
    .where(and(eq(queensPlays.userId, userId), eq(queensPlays.day, day)))
    .limit(1);
  return row ?? null;
}

async function todayFor(userId: string, row: QueensPlayRow | null, day: number): Promise<QueensToday> {
  const times = (await timesOf([userId])).get(userId)!;
  return {
    day,
    size: QUEENS.size,
    state: !row ? 'waiting' : row.finishedAt ? 'done' : 'playing',
    regions: row ? await boardFor(day) : null,
    startedAt: row?.startedAt.toISOString() ?? null,
    seconds: row?.seconds ?? null,
    queens: row?.queens ?? null,
    nextAt: nextPurdleAt().toISOString(),
    stats: queensStats([...times.values()]),
  };
}

export async function registerQueensRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/queens/today', async (request) => {
    const user = requireUser(request);
    const day = queensDay();
    return todayFor(user.id, await playFor(user.id, day), day);
  });

  /** Deals the board and starts the clock. Asking again changes nothing. */
  app.post('/api/queens/start', async (request) => {
    const user = requireUser(request);
    const day = queensDay();
    await boardFor(day);
    await getDb().insert(queensPlays).values({ userId: user.id, day, startedAt: new Date() }).onConflictDoNothing();
    return todayFor(user.id, await playFor(user.id, day), day);
  });

  app.post('/api/queens/solve', async (request) => {
    const user = requireUser(request);
    const body = z.object({ queens: z.array(z.number().int().min(0).max(399)).max(20) }).parse(request.body);
    const limit = consume(`queens:${user.id}`, 30, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = queensDay();
    const existing = await playFor(user.id, day);
    if (!existing) throw badRequest('Start the clock first.', 'not_started');
    if (existing.finishedAt) throw conflict('You have done today’s. A new board comes at midnight Eastern.', 'finished');
    if (!queensSolved(await boardFor(day), body.queens)) throw badRequest('That is not it yet.', 'not_solved');

    const finishedAt = new Date();
    const seconds = Math.max(1, Math.round((finishedAt.getTime() - existing.startedAt.getTime()) / 1000));
    const db = getDb();
    await db
      .update(queensPlays)
      .set({ finishedAt, seconds, queens: body.queens })
      .where(and(eq(queensPlays.userId, user.id), eq(queensPlays.day, day)));

    const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
    for (const { serverId } of servers) {
      hub.broadcastToServer(serverId, { t: 'game_done', d: { game: 'queens', serverId, day, userId: user.id } });
    }
    return todayFor(user.id, await playFor(user.id, day), day);
  });

  /** Who in this server has solved today's and how fast, and everyone's record here. Members only. */
  app.get('/api/queens/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = queensDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);
    const times = await timesOf(memberIds);

    // Who was quickest here, day by day.
    const quickest = new Map<number, { userId: string; seconds: number }>();
    for (const [userId, days] of times) {
      for (const [number, seconds] of days) {
        const best = quickest.get(number);
        if (!best || seconds < best.seconds) quickest.set(number, { userId, seconds });
      }
    }

    const finishes: QueensFinish[] = [];
    const standings: QueensStanding[] = [];
    for (const [userId, days] of times) {
      if (days.size === 0) continue;
      const firsts = [...quickest.values()].filter((entry) => entry.userId === userId).length;
      standings.push({ userId, firsts, ...queensStats([...days.values()]) });
      const today = days.get(day);
      if (today !== undefined) finishes.push({ userId, seconds: today });
    }
    return { day, finishes, standings };
  });
}
