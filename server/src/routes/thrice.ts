/**
 * Threeway's routes: today, an answer (or a pass), and a server's board.
 *
 * The server is the referee. It holds the questions, gives out a clue only
 * when the one before has been answered or passed, and marks each answer;
 * the app never has a clue you have not reached, or an answer you have not
 * finished with.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { THRICE, nextPurdleAt, thriceDay, thriceStanding } from '@scryproof/shared';
import type { ThriceFinish, ThriceStanding, ThriceToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { members, thricePlays, type ThricePlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { requireMember } from '../services/permissions.js';
import type { ThriceSet } from '../thrice/questions.js';
import { pointsFor, setFor, shown } from '../thrice/thrice.js';

async function scoresOf(userIds: string[]): Promise<Map<string, Map<number, number>>> {
  const byUser = new Map<string, Map<number, number>>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: thricePlays.userId, day: thricePlays.day, score: thricePlays.score })
    .from(thricePlays)
    .where(and(inArray(thricePlays.userId, userIds), isNotNull(thricePlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, row.score);
  return byUser;
}

async function playFor(userId: string, day: number): Promise<ThricePlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(thricePlays)
    .where(and(eq(thricePlays.userId, userId), eq(thricePlays.day, day)))
    .limit(1);
  return row ?? null;
}

/** The points of every question that is closed, in order. */
function pointsOf(set: ThriceSet, tries: readonly string[][]): number[] {
  return tries.map((mine, at) => pointsFor(set[at]!, mine)).filter((points) => points !== null);
}

async function todayFor(userId: string, row: ThricePlayRow | null, day: number, set: ThriceSet): Promise<ThriceToday> {
  const tries = row?.tries ?? [];
  const closed = pointsOf(set, tries);
  const done = closed.length === THRICE.questions;
  // The questions reached: every one with tries, and the next one if the last is closed.
  const reached = done ? THRICE.questions : Math.max(1, closed.length === tries.length ? tries.length + 1 : tries.length);
  const { played, best, average, perfect } = thriceStanding(userId, [...(await scoresOf([userId])).get(userId)!.values()]);
  return {
    day,
    questions: set.slice(0, reached).map((question, at) => shown(question, tries[at] ?? [])),
    score: closed.reduce((sum, points) => sum + points, 0),
    state: done ? 'done' : 'playing',
    nextAt: nextPurdleAt().toISOString(),
    stats: { played, best, average, perfect },
  };
}

export async function registerThriceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/thrice/today', async (request) => {
    const user = requireUser(request);
    const day = thriceDay();
    return todayFor(user.id, await playFor(user.id, day), day, await setFor(day));
  });

  /** An answer to the open clue. An empty one is a pass. */
  app.post('/api/thrice/answer', async (request) => {
    const user = requireUser(request);
    const body = z.object({ said: z.string().max(80) }).parse(request.body);
    const limit = consume(`thrice:${user.id}`, 30, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = thriceDay();
    const set = await setFor(day);
    const said = body.said.trim();

    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(thricePlays)
        .where(and(eq(thricePlays.userId, user.id), eq(thricePlays.day, day)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict('You have played today. New questions come at midnight Eastern.', 'finished');

      const tries = (existing?.tries ?? []).map((mine) => [...mine]);
      const open = tries.length > 0 && pointsFor(set[tries.length - 1]!, tries[tries.length - 1]!) === null;
      if (open) tries[tries.length - 1]!.push(said);
      else tries.push([said]);

      const closed = pointsOf(set, tries);
      const score = closed.reduce((sum, points) => sum + points, 0);
      const finishedAt = closed.length === THRICE.questions ? new Date() : null;
      const [saved] = await tx
        .insert(thricePlays)
        .values({ userId: user.id, day, tries, score, finishedAt })
        .onConflictDoUpdate({ target: [thricePlays.userId, thricePlays.day], set: { tries, score, finishedAt } })
        .returning();
      return saved!;
    });

    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, { t: 'game_done', d: { game: 'thrice', serverId, day, userId: user.id } });
      }
    }
    return todayFor(user.id, row, day, set);
  });

  /** Who in this server has finished today, and everyone's record here. Members only. */
  app.get('/api/thrice/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = thriceDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);

    const finishes: ThriceFinish[] = [];
    if (memberIds.length > 0) {
      const rows = await getDb()
        .select()
        .from(thricePlays)
        .where(and(eq(thricePlays.day, day), inArray(thricePlays.userId, memberIds), isNotNull(thricePlays.finishedAt)));
      const set = rows.length > 0 ? await setFor(day) : null;
      for (const row of rows) finishes.push({ userId: row.userId, score: row.score, points: pointsOf(set!, row.tries) });
    }

    const standings: ThriceStanding[] = [];
    for (const [userId, scores] of await scoresOf(memberIds)) {
      if (scores.size > 0) standings.push(thriceStanding(userId, [...scores.values()]));
    }
    return { day, finishes, standings };
  });
}
