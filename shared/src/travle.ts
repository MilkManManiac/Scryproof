/**
 * Travhole: Travle, one route a day for everyone here (Wes, 2026-09-29).
 *
 * Two countries. Name the ones between them until there is a way from one to
 * the other over land borders. A guess is green if it is on a shortest way,
 * amber if it is one country out of the way, red if it is no help. The
 * fewer guesses beyond what the shortest way needs, the better.
 *
 * The map of who touches whom is no secret, so the marking lives here and
 * the app can draw as it goes; the server still marks every guess itself
 * (`server/src/routes/travle.ts`).
 */

import { dailyNumber } from './purdle.js';
import { TRAVLE_COUNTRIES, type TravleCountry } from './travle-countries.js';

export const TRAVLE = {
  name: 'Trundle',
  /** A day's shortest way has this many countries in between, at least and at most. */
  fewest: 2,
  most: 6,
  /** #1. */
  firstDay: '2026-09-29',
} as const;

export function travleDay(at: Date = new Date()): number {
  return dailyNumber(TRAVLE.firstDay, at);
}

const byCode = new Map<string, TravleCountry>(TRAVLE_COUNTRIES.map((country) => [country.code, country]));

export function travleCountry(code: string): TravleCountry | undefined {
  return byCode.get(code);
}

/** How many borders from `from` to everywhere that can be reached. */
export function travleDistances(from: string): Map<string, number> {
  const out = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift()!;
    for (const next of byCode.get(at)?.borders ?? []) {
      if (out.has(next)) continue;
      out.set(next, out.get(at)! + 1);
      queue.push(next);
    }
  }
  return out;
}

/** How many guesses a day gets: what the shortest way needs, and some to spare. */
export function travleAllowed(between: number): number {
  return between + (between <= 3 ? 4 : between <= 5 ? 5 : 6);
}

export type TravleMark = 'good' | 'near' | 'off';

/** `good`: on a shortest way. `near`: a way through it is one or two borders longer. */
export function travleMark(from: string, to: string, code: string): TravleMark {
  const a = travleDistances(from);
  const b = travleDistances(to);
  const through = (a.get(code) ?? Infinity) + (b.get(code) ?? Infinity);
  const extra = through - (a.get(to) ?? Infinity);
  return extra === 0 ? 'good' : extra <= 2 ? 'near' : 'off';
}

/** Whether the guesses join the two ends. */
export function travleJoined(from: string, to: string, guesses: readonly string[]): boolean {
  const open = new Set([to, ...guesses]);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === to) return true;
    for (const next of byCode.get(at)?.borders ?? []) {
      if (!open.has(next) || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/** A shortest way, both ends included. Through `open` only, if given. */
export function travleRoute(from: string, to: string, open?: ReadonlySet<string>): string[] {
  const back = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === to) break;
    for (const next of byCode.get(at)?.borders ?? []) {
      if (back.has(next) || (open && next !== to && !open.has(next))) continue;
      back.set(next, at);
      queue.push(next);
    }
  }
  if (!back.has(to)) return [];
  const out: string[] = [];
  for (let at: string | null = to; at !== null; at = back.get(at) ?? null) out.unshift(at);
  return out;
}

export interface TravleGuess {
  code: string;
  mark: TravleMark;
}

export interface TravleStats {
  /** Days finished, won or lost. */
  played: number;
  wins: number;
  /** Wins with not one guess to spare. */
  perfect: number;
  /** Guesses beyond the shortest way, over the days won. */
  averageExtra: number | null;
  streak: number;
}

/** Your day, as the server has it. */
export interface TravleToday {
  day: number;
  from: string;
  to: string;
  /** Countries between the two on a shortest way. */
  between: number;
  allowed: number;
  guesses: TravleGuess[];
  state: 'playing' | 'won' | 'lost';
  /** A shortest way, once the day is over. */
  route: string[] | null;
  nextAt: string;
  stats: TravleStats;
}

export interface TravleFinish {
  userId: string;
  solved: boolean;
  /** Guesses beyond the shortest way. */
  extra: number;
}

export interface TravleStanding extends TravleStats {
  userId: string;
}

export function travleStats(days: ReadonlyMap<number, { solved: boolean; extra: number }>, today: number): TravleStats {
  let wins = 0;
  let perfect = 0;
  let extra = 0;
  for (const entry of days.values()) {
    if (!entry.solved) continue;
    wins += 1;
    extra += entry.extra;
    if (entry.extra === 0) perfect += 1;
  }
  let streak = 0;
  let day = days.get(today)?.solved ? today : today - 1;
  while (days.get(day)?.solved) {
    streak += 1;
    day -= 1;
  }
  return { played: days.size, wins, perfect, streak, averageExtra: wins ? Math.round((extra / wins) * 10) / 10 : null };
}

const SQUARE: Record<TravleMark, string> = { good: '🟩', near: '🟧', off: '🟥' };

/** What "Copy result" copies: a square a guess, never a country. */
export function travleShare(today: Pick<TravleToday, 'day' | 'guesses' | 'between' | 'state' | 'allowed'>): string {
  const squares = today.guesses.map((guess) => SQUARE[guess.mark]).join('');
  const extra = today.guesses.length - today.between;
  const how = today.state === 'won' ? (extra === 0 ? 'Perfect' : `+${extra}`) : `Lost (${today.guesses.length}/${today.allowed})`;
  return `${TRAVLE.name} #${today.day}\n${squares} ${how}`;
}
