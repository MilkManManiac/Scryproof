/**
 * Cuntections' routes: today's board, a guess, and a server's board (who has
 * finished today, and everyone's record since they started).
 *
 * The server is the referee, as with Purdle. It holds the groups, marks every
 * four, says "one away", and stops you at the fourth mistake; the app is only
 * ever told a group once it has been found, and the rest once the day is over.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { CUNTECTIONS, cuntectionsDay, cuntectionsStanding, cuntectionsStats, nextPurdleAt } from '@scryproof/shared';
import type { CuntectionsFinish, CuntectionsLevel, CuntectionsOutcome, CuntectionsToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { dealFor, groupOf, levelOf, normal, oneAway, shown, type Dealt } from '../cuntections/cuntections.js';
import { getDb } from '../db/index.js';
import { cuntectionsPlays, members, type CuntectionsPlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { requireMember } from '../services/permissions.js';

type Finished = Map<number, { solved: boolean; mistakes: number }>;

async function finishedDays(userIds: string[]): Promise<Map<string, Finished>> {
  const byUser = new Map<string, Finished>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({
      userId: cuntectionsPlays.userId,
      day: cuntectionsPlays.day,
      solved: cuntectionsPlays.solved,
      mistakes: cuntectionsPlays.mistakes,
    })
    .from(cuntectionsPlays)
    .where(and(inArray(cuntectionsPlays.userId, userIds), isNotNull(cuntectionsPlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, { solved: row.solved, mistakes: row.mistakes });
  return byUser;
}

async function todayFor(userId: string, row: CuntectionsPlayRow | null, day: number, dealt: Dealt): Promise<CuntectionsToday> {
  const { puzzle, words } = dealt;
  const guesses = row?.guesses ?? [];
  const found = guesses.map((guess) => groupOf(puzzle, guess)).filter((group) => group !== null);
  const misses = guesses.filter((guess) => !groupOf(puzzle, guess));
  const state = row?.solved ? 'won' : misses.length >= CUNTECTIONS.mistakes ? 'lost' : 'playing';
  const over = state !== 'playing';
  const finished = (await finishedDays([userId])).get(userId)!;
  return {
    day,
    words,
    found: found.map(shown),
    mistakes: misses.length,
    misses,
    state,
    groups: over ? [...puzzle].sort((a, b) => a.level - b.level).map(shown) : null,
    grid: over ? guesses.map((guess) => guess.map((word) => levelOf(puzzle, word))) : null,
    nextAt: nextPurdleAt().toISOString(),
    stats: cuntectionsStats(finished, day),
  };
}

async function playFor(userId: string, day: number): Promise<CuntectionsPlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(cuntectionsPlays)
    .where(and(eq(cuntectionsPlays.userId, userId), eq(cuntectionsPlays.day, day)))
    .limit(1);
  return row ?? null;
}

const sameFour = (a: readonly string[], b: readonly string[]) => a.every((word) => b.includes(word));

export async function registerCuntectionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cuntections/today', async (request) => {
    const user = requireUser(request);
    const day = cuntectionsDay();
    return todayFor(user.id, await playFor(user.id, day), day, await dealFor(day));
  });

  app.post('/api/cuntections/guess', async (request) => {
    const user = requireUser(request);
    const body = z.object({ words: z.array(z.string().max(40)).length(CUNTECTIONS.size) }).parse(request.body);
    // A day needs at most seven guesses; this only stops a script trying every four.
    const limit = consume(`cuntections:${user.id}`, 30, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = cuntectionsDay();
    const dealt = await dealFor(day);
    const { puzzle } = dealt;
    const guess = body.words.map(normal);
    if (new Set(guess).size !== guess.length) throw badRequest('Four different words.', 'repeated');
    const dealtWords = new Set(dealt.words.map(normal));
    if (!guess.every((word) => dealtWords.has(word))) throw badRequest('Those are not all on today’s board.', 'not_on_board');

    const db = getDb();
    let outcome: CuntectionsOutcome = 'wrong';
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(cuntectionsPlays)
        .where(and(eq(cuntectionsPlays.userId, user.id), eq(cuntectionsPlays.day, day)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict('You have played today. A new one comes at midnight Eastern.', 'finished');

      const before = existing?.guesses ?? [];
      if (before.some((earlier) => sameFour(earlier, guess))) throw badRequest('You already tried those four.', 'already_tried');
      const foundLevels = new Set<CuntectionsLevel>(
        before.map((earlier) => groupOf(puzzle, earlier)?.level).filter((level): level is CuntectionsLevel => level !== undefined),
      );
      const taken = new Set(puzzle.filter((group) => foundLevels.has(group.level)).flatMap((group) => group.words.map(normal)));
      if (guess.some((word) => taken.has(word))) throw badRequest('One of those is in a group you already found.', 'already_found');

      const group = groupOf(puzzle, guess);
      outcome = group ? 'right' : oneAway(puzzle, guess, foundLevels) ? 'one_away' : 'wrong';
      const guesses = [...before, guess];
      const found = foundLevels.size + (group ? 1 : 0);
      const mistakes = guesses.length - found;
      const solved = found === CUNTECTIONS.size;
      const finishedAt = solved || mistakes >= CUNTECTIONS.mistakes ? new Date() : null;
      const [saved] = await tx
        .insert(cuntectionsPlays)
        .values({ userId: user.id, day, guesses, solved, mistakes, finishedAt })
        .onConflictDoUpdate({
          target: [cuntectionsPlays.userId, cuntectionsPlays.day],
          set: { guesses, solved, mistakes, finishedAt },
        })
        .returning();
      return saved!;
    });

    const today = await todayFor(user.id, row, day, dealt);

    // Everyone who shares a server hears how it went: mistakes and a streak,
    // nothing that gives a group away.
    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, {
          t: 'cuntections_done',
          d: { serverId, day, userId: user.id, mistakes: row.mistakes, solved: row.solved, streak: today.stats.streak },
        });
      }
    }

    return { ...today, outcome };
  });

  /** Who in this server has finished today, and everyone's record here. Members only. */
  app.get('/api/cuntections/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = cuntectionsDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);
    const days = await finishedDays(memberIds);

    const finishes: CuntectionsFinish[] = [];
    const standings = [];
    for (const [userId, finished] of days) {
      if (finished.size === 0) continue;
      standings.push(cuntectionsStanding(userId, finished, day));
      const today = finished.get(day);
      if (today) finishes.push({ userId, mistakes: today.mistakes, solved: today.solved, streak: cuntectionsStats(finished, day).streak });
    }
    return { day, finishes, standings };
  });
}
