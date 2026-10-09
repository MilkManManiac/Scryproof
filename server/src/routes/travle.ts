/**
 * Travhole's routes: today, a guess, and a server's board. A day has three
 * routes (`TRAVLE.legs`), each its own game; "today" is the first one you
 * have not finished, unless you ask for another.
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
  travleRegion,
  travleRoute,
  travleStats,
  TRAVLE_REGIONS,
} from '@scryproof/shared';
import type { TravleFinish, TravleRegion, TravleStanding, TravleToday } from '@scryproof/shared';

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

/** Two countries with a fair way between them, not the two any day in `used` had. Starts in `region`, if given. */
export function choose(used: ReadonlySet<string>, region?: TravleRegion): Ends {
  const joined = region
    ? TRAVLE_REGIONS[region].filter((code) => (travleCountry(code)?.borders.length ?? 0) > 0)
    : TRAVLE_COUNTRIES.filter((country) => country.borders.length > 0).map((country) => country.code);
  for (;;) {
    const from = joined[randomInt(joined.length)]!;
    const far = [...travleDistances(from)].filter(
      ([code, borders]) => borders - 1 >= TRAVLE.fewest && borders - 1 <= TRAVLE.most && !used.has(`${from}-${code}`),
    );
    if (far.length > 0) return { from, to: far[randomInt(far.length)]![0] };
  }
}

/** One route's two countries, choosing them if this is the first time anyone has asked. */
export async function endsFor(day: number, leg: number): Promise<Ends> {
  const db = getDb();
  const at = and(eq(travleDays.day, day), eq(travleDays.leg, leg));
  const [kept] = await db.select().from(travleDays).where(at).limit(1);
  if (kept && travleCountry(kept.from) && travleCountry(kept.to)) return { from: kept.from, to: kept.to };

  // No pair any route has had, the day's other routes included.
  const used = new Set<string>();
  for (const row of await db.select().from(travleDays)) used.add(`${row.from}-${row.to}`).add(`${row.to}-${row.from}`);
  const ends = choose(used, travleRegion(day, leg));
  if (kept) {
    await db.update(travleDays).set(ends).where(at);
    return ends;
  }
  // Two people opening a new route at once: the first one's choice stands.
  await db.insert(travleDays).values({ day, leg, ...ends }).onConflictDoNothing();
  const [won] = await db.select().from(travleDays).where(at).limit(1);
  return { from: won!.from, to: won!.to };
}

type Finished = { day: number; leg: number; solved: boolean; extra: number }[];

async function finishedRoutes(userIds: string[]): Promise<Map<string, Finished>> {
  const byUser = new Map<string, Finished>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return byUser;
  const rows = await getDb()
    .select({ userId: travlePlays.userId, day: travlePlays.day, leg: travlePlays.leg, solved: travlePlays.solved, extra: travlePlays.extra })
    .from(travlePlays)
    .where(and(inArray(travlePlays.userId, userIds), isNotNull(travlePlays.finishedAt)));
  for (const { userId, ...row } of rows) byUser.get(userId)?.push(row);
  return byUser;
}

/** Every route of the day someone has started, by leg. */
async function playsFor(userId: string, day: number): Promise<Map<number, TravlePlayRow>> {
  const rows = await getDb()
    .select()
    .from(travlePlays)
    .where(and(eq(travlePlays.userId, userId), eq(travlePlays.day, day)));
  return new Map(rows.map((row) => [row.leg, row]));
}

/** The route asked for, or the first not finished (the last, once all are). */
function legAsked(asked: number | undefined, plays: Map<number, TravlePlayRow>): number {
  if (asked !== undefined) return asked;
  for (let leg = 0; leg < TRAVLE.legs; leg += 1) if (!plays.get(leg)?.finishedAt) return leg;
  return TRAVLE.legs - 1;
}

const Leg = z.coerce.number().int().min(0).max(TRAVLE.legs - 1);

const betweenOf = (ends: Ends) => travleDistances(ends.from).get(ends.to)! - 1;

async function todayFor(userId: string, plays: Map<number, TravlePlayRow>, day: number, leg: number, ends: Ends): Promise<TravleToday> {
  const row = plays.get(leg);
  const guesses = row?.guesses ?? [];
  const between = betweenOf(ends);
  const allowed = travleAllowed(between);
  const state = row?.solved ? 'won' : row?.finishedAt ? 'lost' : 'playing';
  const legs = Array.from({ length: TRAVLE.legs }, (_, at) => {
    const play = plays.get(at);
    return {
      state: play?.solved ? ('won' as const) : play?.finishedAt ? ('lost' as const) : ('playing' as const),
      said: play?.guesses.length ?? 0,
      extra: play?.extra ?? 0,
    };
  });
  return {
    day,
    leg,
    legs,
    ...ends,
    between,
    allowed,
    guesses: guesses.map((code) => ({ code, mark: travleMark(ends.from, ends.to, code) })),
    state,
    route: state === 'playing' ? null : travleRoute(ends.from, ends.to),
    nextAt: nextPurdleAt().toISOString(),
    stats: travleStats((await finishedRoutes([userId])).get(userId)!, day),
  };
}

export async function registerTravleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/travle/today', async (request) => {
    const user = requireUser(request);
    const { leg: asked } = z.object({ leg: Leg.optional() }).parse(request.query);
    const day = travleDay();
    const plays = await playsFor(user.id, day);
    const leg = legAsked(asked, plays);
    return todayFor(user.id, plays, day, leg, await endsFor(day, leg));
  });

  app.post('/api/travle/guess', async (request) => {
    const user = requireUser(request);
    const body = z.object({ code: z.string().max(3), leg: Leg.optional() }).parse(request.body);
    const limit = consume(`travle:${user.id}`, 40, 60_000);
    if (!limit.allowed) throw tooManyRequests('Slow down a little.', limit.retryAfterSeconds);

    const day = travleDay();
    const leg = legAsked(body.leg, await playsFor(user.id, day));
    const ends = await endsFor(day, leg);
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
        .where(and(eq(travlePlays.userId, user.id), eq(travlePlays.day, day), eq(travlePlays.leg, leg)))
        .for('update')
        .limit(1);
      if (existing?.finishedAt) throw conflict('You have played this route. New ones come at midnight Eastern.', 'finished');
      const before = existing?.guesses ?? [];
      if (before.includes(code)) throw badRequest('You already said that one.', 'already_said');

      const guesses = [...before, code];
      const solved = travleJoined(ends.from, ends.to, guesses);
      const finishedAt = solved || guesses.length >= allowed ? new Date() : null;
      const extra = Math.max(0, guesses.length - between);
      const [saved] = await tx
        .insert(travlePlays)
        .values({ userId: user.id, day, leg, guesses, solved, extra, finishedAt })
        .onConflictDoUpdate({ target: [travlePlays.userId, travlePlays.day, travlePlays.leg], set: { guesses, solved, extra, finishedAt } })
        .returning();
      return saved!;
    });

    if (row.finishedAt) {
      const servers = await db.select({ serverId: members.serverId }).from(members).where(eq(members.userId, user.id));
      for (const { serverId } of servers) {
        hub.broadcastToServer(serverId, { t: 'game_done', d: { game: 'travle', serverId, day, userId: user.id } });
      }
    }
    return todayFor(user.id, await playsFor(user.id, day), day, leg, ends);
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
    for (const [userId, finished] of await finishedRoutes(memberIds)) {
      if (finished.length === 0) continue;
      standings.push({ userId, ...travleStats(finished, day) });
      const today = finished.filter((entry) => entry.day === day);
      if (today.length === 0) continue;
      finishes.push({
        userId,
        legs: Array.from({ length: TRAVLE.legs }, (_, leg) => {
          const entry = today.find((route) => route.leg === leg);
          return entry ? { solved: entry.solved, extra: entry.extra } : null;
        }),
      });
    }
    return { day, finishes, standings };
  });
}
