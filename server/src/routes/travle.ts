/**
 * Travhole's routes: today, a guess, and a server's board.
 *
 * Who touches whom is public, so there is no answer to keep back; the
 * server is here so that a day's guesses are counted once, in one place,
 * and cannot be taken back.
 */

import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  TRAVLE,
  TRAVLE_COUNTRIES,
  nextPurdleAt,
  travleAllowed,
  travleCountry,
  travleDay,
  travleDistances,
  travleJoined,
  travleMark,
  travleRoute,
  travleStats,
} from '@scryproof/shared';
import type { TravleFinish, TravleStanding, TravleToday } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { members, travleDays, travlePlays, type TravlePlayRow } from '../db/schema.js';
import * as hub from '../gateway/hub.js';
import { badRequest, conflict, tooManyRequests } from '../lib/http-error.js';
import { consume } from '../lib/rate-limit.js';
import { requireMember } from '../services/permissions.js';

export interface Ends {
  from: string;
  to: string;
}

/** Two countries with a fair way between them, not the two any day in `used` had. */
export function choose(used: ReadonlySet<string>): Ends {
  const joined = TRAVLE_COUNTRIES.filter((country) => country.borders.length > 0);
  for (;;) {
    const from = joined[randomInt(joined.length)]!.code;
    const far = [...travleDistances(from)].filter(
      ([code, borders]) => borders - 1 >= TRAVLE.fewest && borders - 1 <= TRAVLE.most && !used.has(`${from}-${code}`),
    );
    if (far.length > 0) return { from, to: far[randomInt(far.length)]![0] };
  }
}

/** The day's two countries, choosing them if this is the first time anyone has asked. */
export async function endsFor(day: number): Promise<Ends> {
  const db = getDb();
  const [kept] = await db.select().from(travleDays).where(eq(travleDays.day, day)).limit(1);
  if (kept && travleCountry(kept.from) && travleCountry(kept.to)) return { from: kept.from, to: kept.to };

  const used = new Set<string>();
  for (const row of await db.select().from(travleDays)) used.add(`${row.from}-${row.to}`).add(`${row.to}-${row.from}`);
  const ends = choose(used);
  if (kept) {
    await db.update(travleDays).set(ends).where(eq(travleDays.day, day));
    return ends;
  }
  // Two people opening a new day at once: the first one's choice stands.
  await db.insert(travleDays).values({ day, ...ends }).onConflictDoNothing();
  const [won] = await db.select().from(travleDays).where(eq(travleDays.day, day)).limit(1);
  return { from: won!.from, to: won!.to };
}

type Finished = Map<number, { solved: boolean; extra: number }>;

async function finishedDays(userIds: string[]): Promise<Map<string, Finished>> {
  const byUser = new Map<string, Finished>(userIds.map((id) => [id, new Map()]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: travlePlays.userId, day: travlePlays.day, solved: travlePlays.solved, extra: travlePlays.extra })
    .from(travlePlays)
    .where(and(inArray(travlePlays.userId, userIds), isNotNull(travlePlays.finishedAt)));
  for (const row of rows) byUser.get(row.userId)?.set(row.day, { solved: row.solved, extra: row.extra });
  return byUser;
}

async function playFor(userId: string, day: number): Promise<TravlePlayRow | null> {
  const [row] = await getDb()
    .select()
    .from(travlePlays)
    .where(and(eq(travlePlays.userId, userId), eq(travlePlays.day, day)))
    .limit(1);
  return row ?? null;
}

const betweenOf = (ends: Ends) => travleDistances(ends.from).get(ends.to)! - 1;

async function todayFor(userId: string, row: TravlePlayRow | null, day: number, ends: Ends): Promise<TravleToday> {
  const guesses = row?.guesses ?? [];
  const between = betweenOf(ends);
  const allowed = travleAllowed(between);
  const state = row?.solved ? 'won' : row?.finishedAt ? 'lost' : 'playing';
  return {
    day,
    ...ends,
    between,
    allowed,
    guesses: guesses.map((code) => ({ code, mark: travleMark(ends.from, ends.to, code) })),
    state,
    route: state === 'playing' ? null : travleRoute(ends.from, ends.to),
    nextAt: nextPurdleAt().toISOString(),
    stats: travleStats((await finishedDays([userId])).get(userId)!, day),
  };
}

export async function registerTravleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/travle/today', async (request) => {
    const user = requireUser(request);
    const day = travleDay();
    return todayFor(user.id, await playFor(user.id, day), day, await endsFor(day));
  });

  app.post('/api/travle/guess', async (request) => {
    const user = requireUser(request);
    const body = z.object({ code: z.string().max(3) }).parse(request.body);
    const limit = consume(`travle:${user.id}`, 40, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = travleDay();
    const ends = await endsFor(day);
    const code = body.code.toUpperCase();
    if (!travleCountry(code)) throw badRequest('That is not a country we know.', 'not_a_country');
    if (code === ends.from || code === ends.to) throw badRequest('That is one of the two ends.', 'an_end');

    const between = betweenOf(ends);
    const allowed = travleAllowed(between);
    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(travlePlays)
        .where(and(eq(travlePlays.userId, user.id), eq(travlePlays.day, day)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict('You have played today. A new route comes at midnight Eastern.', 'finished');
      const before = existing?.guesses ?? [];
      if (before.includes(code)) throw badRequest('You already said that one.', 'already_said');

      const guesses = [...before, code];
      const solved = travleJoined(ends.from, ends.to, guesses);
      const finishedAt = solved || guesses.length >= allowed ? new Date() : null;
      const extra = Math.max(0, guesses.length - between);
      const [saved] = await tx
        .insert(travlePlays)
        .values({ userId: user.id, day, guesses, solved, extra, finishedAt })
        .onConflictDoUpdate({ target: [travlePlays.userId, travlePlays.day], set: { guesses, solved, extra, finishedAt } })
        .returning();
      return saved!;
    });

    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, { t: 'game_done', d: { game: 'travle', serverId, day, userId: user.id } });
      }
    }
    return todayFor(user.id, row, day, ends);
  });

  /** Who in this server has finished today, and everyone's record here. Members only. */
  app.get('/api/travle/servers/:serverId', async (request) => {
    const user = requireUser(request);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    await requireMember(serverId, user.id);

    const day = travleDay();
    const memberIds = (
      await getDb().select({ userId: members.userId }).from(members).where(eq(members.serverId, serverId))
    ).map((row) => row.userId);

    const finishes: TravleFinish[] = [];
    const standings: TravleStanding[] = [];
    for (const [userId, finished] of await finishedDays(memberIds)) {
      if (finished.size === 0) continue;
      standings.push({ userId, ...travleStats(finished, day) });
      const today = finished.get(day);
      if (today) finishes.push({ userId, solved: today.solved, extra: today.extra });
    }
    return { day, finishes, standings };
  });
}
