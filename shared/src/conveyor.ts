/**
 * Conveyor (Wes, 2026-11-17): "like 20 items come by on the screen. Like a
 * picture and the text. It goes through and then you have a minute to recite
 * how many you saw."
 *
 * Twenty things ride past on a belt once. Then a minute to name as many as
 * you can. The same twenty for everyone, new ones at midnight Eastern.
 *
 * The clock is the server's: `start` stamps the time, and the belt and the
 * minute both run off that stamp, so a reload carries on where the clock is.
 */

import { namesMatch } from './match.js';
import { dailyNumber } from './purdle.js';

export const CONVEYOR = {
  /** The name on screen. Wes may rename it; this is the only place it is written. */
  name: 'Conveyor',
  items: 20,
  /** #1. Set to the day it goes out. */
  firstDay: '2026-11-17',
  /** From one thing coming on to the belt to the next. */
  gapMs: 2400,
  /** From the start until the last thing has left the belt. */
  beltMs: 55_000,
  /** The minute to name them, from the moment the belt is empty. */
  recallMs: 60_000,
  /** How long after the minute a guess still counts (a slow connection). */
  graceMs: 5_000,
  /** No more than this many from one kind of thing in a day. */
  perCategory: 4,
  /** Nothing comes back within this many days. */
  freshDays: 14,
} as const;

/** How long one thing takes to cross the belt. */
export const CONVEYOR_CROSS_MS = CONVEYOR.beltMs - (CONVEYOR.items - 1) * CONVEYOR.gapMs;

export function conveyorDay(at: Date = new Date()): number {
  return dailyNumber(CONVEYOR.firstDay, at);
}

/** One thing on the belt. */
export interface ConveyorItem {
  id: string;
  name: string;
  aliases: string[];
  /** Under `/conveyor/` on the site. */
  file: string;
}

export interface ConveyorStats {
  played: number;
  best: number;
  average: number | null;
  /** Days in a row played, up to today or yesterday. */
  streak: number;
}

/** Your day, as the server has it. */
export interface ConveyorToday {
  day: number;
  /** `fresh`: not started, and the belt is not sent yet. */
  state: 'fresh' | 'playing' | 'done';
  /** In belt order. Empty until you start. */
  items: ConveyorItem[];
  startedAt: string | null;
  /** The server's clock when it answered, so the app can line its own up. */
  now: string;
  /** What you typed that named something, in order. */
  guesses: string[];
  score: number;
  nextAt: string;
  stats: ConveyorStats;
}

export interface ConveyorFinish {
  userId: string;
  score: number;
  /** One per item, belt order: remembered or not. */
  marks: boolean[];
}

export interface ConveyorStanding extends ConveyorStats {
  userId: string;
}

/** Which phase the clock is in, `elapsed` ms after the start. */
export function conveyorPhase(elapsed: number): 'belt' | 'recall' | 'over' {
  if (elapsed < CONVEYOR.beltMs) return 'belt';
  if (elapsed < CONVEYOR.beltMs + CONVEYOR.recallMs) return 'recall';
  return 'over';
}

/** The last moment the server takes a guess, in ms after the start. */
export const CONVEYOR_DEADLINE_MS = CONVEYOR.beltMs + CONVEYOR.recallMs + CONVEYOR.graceMs;

/** The item a guess names, if any, among those not already found. */
export function conveyorHit(items: readonly ConveyorItem[], found: ReadonlySet<string>, said: string): ConveyorItem | null {
  const open = items.filter((item) => !found.has(item.id));
  return open.find((item) => namesMatch(said, [item.name, ...item.aliases])) ?? null;
}

/** Whether a guess names one already found. */
export function conveyorRepeat(items: readonly ConveyorItem[], found: ReadonlySet<string>, said: string): boolean {
  return items.some((item) => found.has(item.id) && namesMatch(said, [item.name, ...item.aliases]));
}

/** The ids these guesses found, in the order they were found. */
export function conveyorFound(items: readonly ConveyorItem[], guesses: readonly string[]): string[] {
  const found = new Set<string>();
  for (const said of guesses) {
    const hit = conveyorHit(items, found, said);
    if (hit) found.add(hit.id);
  }
  return [...found];
}

/** Played, best, average and the streak, from day number to score. */
export function conveyorStats(scores: ReadonlyMap<number, number>, today: number): ConveyorStats {
  const values = [...scores.values()];
  let streak = 0;
  // Today not played yet does not break it.
  let day = scores.has(today) ? today : today - 1;
  while (scores.has(day)) {
    streak += 1;
    day -= 1;
  }
  return {
    played: values.length,
    best: values.length ? Math.max(...values) : 0,
    average: values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null,
    streak,
  };
}

/** What "Copy result" copies: the score and a square per thing, never a name. */
export function conveyorShare(day: number, marks: readonly boolean[]): string {
  const score = marks.filter(Boolean).length;
  return `${CONVEYOR.name} #${day}\n${score}/${CONVEYOR.items}\n${marks.map((got) => (got ? '🟩' : '⬛')).join('')}`;
}
