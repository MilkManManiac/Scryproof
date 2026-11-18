/**
 * Conveyor's routes: today, start the belt, a name, done, and a server's board.
 *
 * The server keeps the clock. `start` stamps the time and is the first
 * moment the twenty are sent. A guess counts only between the belt
 * emptying and the end of the minute (plus a few seconds for the
 * connection), and the score is always worked out here from the guesses.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import {
  CONVEYOR,
  CONVEYOR_DEADLINE_MS,
  conveyorDay,
  conveyorFound,
  conveyorHit,
  conveyorStats,
  nextPurdleAt,
} from '@scryproof/shared';
import type { ConveyorFinish, ConveyorItem, ConveyorStanding, ConveyorToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { itemsFor } from '../conveyor/conveyor.js';
import { getDb } from '../db/index.js';
import { conveyorPlays, members, type ConveyorPlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { requireMember } from '../services/permissions.js';

/** Every finished day's score, by user, by day. */
async function scoresOf(userIds: string[]): Promise<Map<string, Map<number, number>>> {
  const byUser = new Map<string, Map<number, number>>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: conveyorPlays.userId, day: conveyorPlays.day, score: conveyorPlays.score })
    .from(conveyorPlays)
    .where(and(inArray(conveyorPlays.userId, userIds), isNotNull(conveyorPlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, row.score);
  return byUser;
}

/**
 * Closes every play of `day` whose minute (and grace) ran out without a
 * Done: the score is already up to date, it only needs its finish stamp.
 */
async function closeLate(day: number): Promise<void> {
  const cutoff = new Date(Date.now() - CONVEYOR_DEADLINE_MS);
  await getDb()
    .update(conveyorPlays)
    .set({ finishedAt: new Date() })
    .where(and(eq(conveyorPlays.day, day), isNull(conveyorPlays.finishedAt), lt(conveyorPlays.startedAt, cutoff)));
}

async function playFor(userId: string, day: number): Promise<ConveyorPlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(conveyorPlays)
    .where(and(eq(conveyorPlays.userId, userId), eq(conveyorPlays.day, day)))
    .limit(1);
  return row ?? null;
}

async function tellServers(userId: string, day: number): Promise<void> {
  const servers = await getDb().select({ serverId: members.serverId }).from(members).where(eq(members.userId, userId));
  for (const { serverId } of servers) {
    hub.broadcastToServer(serverId, { t: 'game_done', d: { game: 'conveyor', serverId, day, userId } });
  }
}

async function todayFor(userId: string, row: ConveyorPlayRow | null, day: number, items: ConveyorItem[]): Promise<ConveyorToday> {
  const scores = (await scoresOf([userId])).get(userId)!;
  return {
    day,
    state: !row ? 'fresh' : row.finishedAt ? 'done' : 'playing',
    // The belt is not sent until you start it.
    items: row ? items : [],
    startedAt: row ? row.startedAt.toISOString() : null,
    now: new Date().toISOString(),
    guesses: row?.guesses ?? [],
    score: row?.score ?? 0,
    nextAt: nextPurdleAt().toISOString(),
    stats: conveyorStats(scores, day),
  };
}

export async function registerConveyorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/conveyor/today', async (request) => {
    const user = requireUser(request);
    const day = conveyorDay();
    await closeLate(day);
    return todayFor(user.id, await playFor(user.id, day), day, await itemsFor(day));
  });

  /** Starts the belt. Again while it is running just says where it is. */
  app.post('/api/conveyor/start', async (request) => {
    const user = requireUser(request);
    const day = conveyorDay();
    const items = await itemsFor(day);
    await getDb()
      .insert(conveyorPlays)
      .values({ userId: user.id, day, startedAt: new Date(), guesses: [], score: 0 })
      .onConflictDoNothing();
    await closeLate(day);
    const row = await playFor(user.id, day);
    if (row?.finishedAt) throw conflict('You have played today. A new belt comes at midnight Eastern.', 'finished');
    return todayFor(user.id, row, day, items);
  });

  /** A name typed in the minute. Only one that names something new is kept. */
  app.post('/api/conveyor/guess', async (request) => {
    const user = requireUser(request);
    const body = z.object({ said: z.string().max(60) }).parse(request.body);
    const limit = consume(`conveyor:${user.id}`, 120, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = conveyorDay();
    const items = await itemsFor(day);
    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(conveyorPlays)
        .where(and(eq(conveyorPlays.userId, user.id), eq(conveyorPlays.day, day)))
        .for('update')
        .limit(1);
      if (!existing) throw conflict('Start the belt first.', 'not_started');
      if (existing.finishedAt) throw conflict('You have played today. A new belt comes at midnight Eastern.', 'finished');
      const elapsed = Date.now() - existing.startedAt.getTime();
      if (elapsed < CONVEYOR.beltMs) throw conflict('The belt is still running.', 'too_soon');
      if (elapsed > CONVEYOR_DEADLINE_MS) throw conflict('Time is up.', 'too_late');

      const found = new Set(conveyorFound(items, existing.guesses));
      if (!conveyorHit(items, found, body.said.trim())) return existing;
      const guesses = [...existing.guesses, body.said.trim()];
      const score = conveyorFound(items, guesses).length;
      const [saved] = await tx
        .update(conveyorPlays)
        .set({ guesses, score })
        .where(and(eq(conveyorPlays.userId, user.id), eq(conveyorPlays.day, day)))
        .returning();
      return saved!;
    });
    return todayFor(user.id, row, day, items);
  });

  /** Done early, or the minute ran out. */
  app.post('/api/conveyor/finish', async (request) => {
    const user = requireUser(request);
    const day = conveyorDay();
    const items = await itemsFor(day);
    const before = await playFor(user.id, day);
    if (!before) throw conflict('Start the belt first.', 'not_started');
    if (before.finishedAt) return todayFor(user.id, before, day, items);
    // Worked out again from the guesses, whatever was stored.
    const score = conveyorFound(items, before.guesses).length;
    const [row] = await getDb()
      .update(conveyorPlays)
      .set({ score, finishedAt: new Date() })
      .where(and(eq(conveyorPlays.userId, user.id), eq(conveyorPlays.day, day), isNull(conveyorPlays.finishedAt)))
      .returning();
    if (row) await tellServers(user.id, day);
    return todayFor(user.id, row ?? (await playFor(user.id, day)), day, items);
  });

  /** Who in this server has finished today, and everyone's record here. Members only. */
  app.get('/api/conveyor/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = conveyorDay();
    await closeLate(day);
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);

    const finishes: ConveyorFinish[] = [];
    if (memberIds.length > 0) {
      const rows = await getDb()
        .select()
        .from(conveyorPlays)
        .where(and(eq(conveyorPlays.day, day), inArray(conveyorPlays.userId, memberIds), isNotNull(conveyorPlays.finishedAt)));
      const items = rows.length > 0 ? await itemsFor(day) : [];
      for (const row of rows) {
        const found = new Set(conveyorFound(items, row.guesses));
        finishes.push({ userId: row.userId, score: row.score, marks: items.map((item) => found.has(item.id)) });
      }
    }

    const standings: ConveyorStanding[] = [];
    for (const [userId, scores] of await scoresOf(memberIds)) {
      if (scores.size > 0) standings.push({ userId, ...conveyorStats(scores, day) });
    }
    return { day, finishes, standings };
  });
}
