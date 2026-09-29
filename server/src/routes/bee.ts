/**
 * The bee's routes: today's board, a word, and a server's board (where
 * everyone is today, and everyone's record since they started).
 *
 * The server is the referee, as with the other two. It holds the word list
 * and says yes or no to each word; the app is told how many points the day
 * is worth and how many words, never which, until the day is over.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { BEE_REFUSALS, beeDay, beePoints, beeRank, beeRefusal, beeStanding, isPangram, nextPurdleAt } from '@scryproof/shared';
import type { BeeRefusal, BeeScore, BeeStanding, BeeTaken, BeeToday, BeeYesterday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { answersFor, boardFor, boardOf, lookUp, pointsOf, type Board } from '../bee/bee.js';
import { getDb } from '../db/index.js';
import { beeDays, beePlays, members, type BeePlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { requireMember } from '../services/permissions.js';

/** Every day each of these people scored on, with what the day was worth. */
async function daysOf(userIds: string[]): Promise<Map<string, { day: number; score: number; max: number }[]>> {
  const byUser = new Map<string, { day: number; score: number; max: number }[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: beePlays.userId, day: beePlays.day, score: beePlays.score, max: beeDays.max })
    .from(beePlays)
    .innerJoin(beeDays, eq(beeDays.day, beePlays.day))
    .where(and(inArray(beePlays.userId, userIds), gt(beePlays.score, 0)));
  for (const row of rows) byUser.get(row.userId)?.push({ day: row.day, score: row.score, max: row.max });
  return byUser;
}

async function playFor(userId: string, day: number): Promise<BeePlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(beePlays)
    .where(and(eq(beePlays.userId, userId), eq(beePlays.day, day)))
    .limit(1);
  return row ?? null;
}

async function yesterdayFor(userId: string, day: number): Promise<BeeYesterday | null> {
  const board = await boardOf(day - 1);
  if (!board) return null;
  const row = await playFor(userId, day - 1);
  return { day: day - 1, letters: board.letters, answers: answersFor(board.letters), found: row?.words ?? [] };
}

async function todayFor(userId: string, row: BeePlayRow | null, day: number, board: Board): Promise<BeeToday> {
  const words = row?.words ?? [];
  const score = row?.score ?? 0;
  const { played, genius, best, average } = beeStanding(userId, (await daysOf([userId])).get(userId)!);
  return {
    day,
    letters: board.letters,
    max: board.max,
    answers: answersFor(board.letters).length,
    words,
    extra: words.filter((word) => lookUp(word) !== 'common'),
    score,
    rank: beeRank(score, board.max),
    nextAt: nextPurdleAt().toISOString(),
    stats: { played, genius, best, average },
    yesterday: await yesterdayFor(userId, day),
  };
}

const refuse = (why: BeeRefusal) => badRequest(BEE_REFUSALS[why], why);

export async function registerBeeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/bee/today', async (request) => {
    const user = requireUser(request);
    const day = beeDay();
    return todayFor(user.id, await playFor(user.id, day), day, await boardFor(day));
  });

  app.post('/api/bee/word', async (request) => {
    const user = requireUser(request);
    const body = z.object({ word: z.string().max(40) }).parse(request.body);
    // Nobody types a word a second for a minute; this only stops a script reading the list off us.
    const limit = consume(`bee:${user.id}`, 60, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = beeDay();
    const board = await boardFor(day);
    const word = body.word.trim().toLowerCase();
    const early = beeRefusal(word, board.letters, []);
    if (early) throw refuse(early);
    const kind = lookUp(word);
    if (!kind) throw refuse('not_a_word');

    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(beePlays)
        .where(and(eq(beePlays.userId, user.id), eq(beePlays.day, day)))
        .for('update')
        .limit(1);
      const before = existing?.words ?? [];
      if (before.includes(word)) throw refuse('already_found');
      const words = [...before, word];
      const score = pointsOf(words);
      const [saved] = await tx
        .insert(beePlays)
        .values({ userId: user.id, day, words, score })
        .onConflictDoUpdate({ target: [beePlays.userId, beePlays.day], set: { words, score } })
        .returning();
      return saved!;
    });

    const today = await todayFor(user.id, row, day, board);

    // Everyone who shares a server sees the race move: points, never the word.
    const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
    for (const { serverId } of servers) {
      hub.broadcastToServer(serverId, {
        t: 'bee_score',
        d: { serverId, day, userId: user.id, score: today.score, words: today.words.length, rank: today.rank },
      });
    }

    const taken: BeeTaken = { word, points: beePoints(word), pangram: isPangram(word), extra: kind === 'rare' };
    return { ...today, taken };
  });

  /** Where everyone in this server is today, and everyone's record here. Members only. */
  app.get('/api/bee/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = beeDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);

    const scores: BeeScore[] = [];
    if (memberIds.length > 0) {
      const rows = await getDb()
        .select()
        .from(beePlays)
        .where(and(eq(beePlays.day, day), inArray(beePlays.userId, memberIds), gt(beePlays.score, 0)));
      const board = rows.length > 0 ? await boardFor(day) : null;
      for (const row of rows) {
        scores.push({ userId: row.userId, score: row.score, words: row.words.length, rank: beeRank(row.score, board!.max) });
      }
    }

    const standings: BeeStanding[] = [];
    for (const [userId, days] of await daysOf(memberIds)) if (days.length > 0) standings.push(beeStanding(userId, days));
    return { day, scores, standings };
  });
}
