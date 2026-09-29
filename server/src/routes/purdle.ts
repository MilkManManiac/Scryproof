/**
 * Purdle's routes: today's board, a guess, and who in a server has finished.
 *
 * The server is the referee. It holds the answer, marks every guess, and
 * refuses a seventh; the app only draws what it is told. The answer goes to
 * someone only once their day is over, and what others see of it is how
 * many tries it took, never the letters.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { PURDLE, markGuess, nextPurdleAt, purdleDay, purdleStanding, purdleStats } from '@scryproof/shared';
import type { PurdleFinish, PurdleStanding, PurdleToday } from '@scryproof/shared';
import { purdleWords } from '@scryproof/shared/purdle-words';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { members, purdlePlays, type PurdlePlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { answerFor } from '../purdle/purdle.js';
import { requireMember } from '../services/permissions.js';

type Finished = Map<number, { solved: boolean; tries: number }>;

/** Every finished day of these people, for streaks and totals. */
async function finishedDays(userIds: string[]): Promise<Map<string, Finished>> {
  const byUser = new Map<string, Finished>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: purdlePlays.userId, day: purdlePlays.day, solved: purdlePlays.solved, guesses: purdlePlays.guesses })
    .from(purdlePlays)
    .where(and(inArray(purdlePlays.userId, userIds), isNotNull(purdlePlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, { solved: row.solved, tries: row.guesses.length });
  return byUser;
}

async function todayFor(userId: string, row: PurdlePlayRow | null, day: number): Promise<PurdleToday> {
  const answer = answerFor(day);
  const guesses = row?.guesses ?? [];
  const state = row?.solved ? 'won' : guesses.length >= PURDLE.tries ? 'lost' : 'playing';
  const finished = (await finishedDays([userId])).get(userId)!;
  return {
    day,
    guesses: guesses.map((word) => ({ word, marks: markGuess(word, answer) })),
    state,
    answer: state === 'playing' ? null : answer,
    nextAt: nextPurdleAt().toISOString(),
    stats: purdleStats(finished, day),
  };
}

async function playFor(userId: string, day: number): Promise<PurdlePlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(purdlePlays)
    .where(and(eq(purdlePlays.userId, userId), eq(purdlePlays.day, day)))
    .limit(1);
  return row ?? null;
}

export async function registerPurdleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/purdle/today', async (request) => {
    const user = requireUser(request);
    const day = purdleDay();
    return todayFor(user.id, await playFor(user.id, day), day);
  });

  app.post('/api/purdle/guess', async (request) => {
    const user = requireUser(request);
    const { word: typed } = z.object({ word: z.string().max(16) }).parse(request.body);
    // Six guesses a day need no more than this; it only stops a script
    // walking the word list.
    const limit = consume(`purdle:${user.id}`, 30, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const word = typed.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(word)) throw badRequest('Five letters.', 'not_five');
    if (!purdleWords().has(word)) throw badRequest('Not in the word list.', 'not_a_word');

    const day = purdleDay();
    const answer = answerFor(day);
    const db = getDb();

    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purdlePlays)
        .where(and(eq(purdlePlays.userId, user.id), eq(purdlePlays.day, day)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict('You have played today. A new word comes at midnight Eastern.', 'finished');

      const guesses = [...(existing?.guesses ?? []), word];
      const solved = word === answer;
      const finishedAt = solved || guesses.length >= PURDLE.tries ? new Date() : null;
      const [saved] = await tx
        .insert(purdlePlays)
        .values({ userId: user.id, day, guesses, solved, finishedAt })
        .onConflictDoUpdate({
          target: [purdlePlays.userId, purdlePlays.day],
          set: { guesses, solved, finishedAt },
        })
        .returning();
      return saved!;
    });

    const today = await todayFor(user.id, row, day);

    // Everyone who shares a server hears how it went, for the list of who
    // has played. Tries and a streak: nothing that gives the word away.
    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, {
          t: 'purdle_done',
          d: { serverId, day, userId: user.id, tries: row.guesses.length, solved: row.solved, streak: today.stats.streak },
        });
      }
    }

    return today;
  });

  /** Who in this server has finished today, and how, and everyone's record here. Members only. */
  app.get('/api/purdle/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = purdleDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);
    const days = await finishedDays(memberIds);

    const finishes: PurdleFinish[] = [];
    const standings: PurdleStanding[] = [];
    for (const [userId, finished] of days) {
      if (finished.size === 0) continue;
      const stats = purdleStats(finished, day);
      standings.push(purdleStanding(userId, stats));
      const today = finished.get(day);
      if (today) finishes.push({ userId, tries: today.tries, solved: today.solved, streak: stats.streak });
    }
    return { day, finishes, standings };
  });
}
