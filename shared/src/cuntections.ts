/**
 * Cuntections: Connections, one puzzle a day for everyone here (Wes,
 * 2026-09-28: "make a connections thing too... Call the connections game
 * cuntections").
 *
 * Sixteen words, four groups of four hidden in them, four mistakes allowed.
 * Same day as Purdle, turning over at the same midnight Eastern. The rules
 * that both sides need live here; the puzzles, and so the groups, stay on the
 * server until you have finished (`server/src/routes/cuntections.ts`).
 */

import { dailyNumber } from './purdle.js';

export const CUNTECTIONS = {
  /** Words in a group, and groups in a puzzle. */
  size: 4,
  mistakes: 4,
  /** Cuntections #1. */
  firstDay: '2026-09-29',
} as const;

/** 0 is the easiest group (yellow), 3 the hardest (purple). */
export type CuntectionsLevel = 0 | 1 | 2 | 3;

export function cuntectionsDay(at: Date = new Date()): number {
  return dailyNumber(CUNTECTIONS.firstDay, at);
}

/** A group, once someone has found it or the day is over. */
export interface CuntectionsGroupShown {
  name: string;
  level: CuntectionsLevel;
  words: string[];
}

export interface CuntectionsStats {
  /** Days finished, won or lost. */
  played: number;
  wins: number;
  streak: number;
  best: number;
  /** Wins with no mistakes at all. */
  perfect: number;
  /** How many wins had 0, 1, 2 and 3 mistakes. */
  spread: number[];
}

/** Your day, as the server has it. */
export interface CuntectionsToday {
  day: number;
  /** The sixteen, in the order the day deals them. */
  words: string[];
  /** Groups found, in the order they were found. */
  found: CuntectionsGroupShown[];
  mistakes: number;
  /** Every four tried that was not a group, so the same four are not tried twice. */
  misses: string[][];
  state: 'playing' | 'won' | 'lost';
  /** All four groups, easiest first, once the day is over. */
  groups: CuntectionsGroupShown[] | null;
  /** The level of each word of each guess, in order, once the day is over: the share. */
  grid: CuntectionsLevel[][] | null;
  /** When the next puzzle starts, ISO. */
  nextAt: string;
  stats: CuntectionsStats;
}

/** What a guess came to, beside the new state of the day. */
export type CuntectionsOutcome = 'right' | 'one_away' | 'wrong';

export interface CuntectionsFinish {
  userId: string;
  mistakes: number;
  solved: boolean;
  streak: number;
}

/** Someone's record since they started. `averageMistakes` counts every day finished, a loss as four. */
export interface CuntectionsStanding {
  userId: string;
  played: number;
  wins: number;
  streak: number;
  best: number;
  perfect: number;
  averageMistakes: number | null;
}

export const CUNTECTIONS_PRAISE = ['Flawless', 'Nice', 'Close call', 'Phew'] as const;

/** Streaks and totals, the same way as Purdle's: a loss or a missed day breaks a streak. */
export function cuntectionsStats(
  days: ReadonlyMap<number, { solved: boolean; mistakes: number }>,
  today: number,
): CuntectionsStats {
  const spread = Array.from({ length: CUNTECTIONS.mistakes }, () => 0);
  let wins = 0;
  for (const entry of days.values()) {
    if (!entry.solved) continue;
    wins += 1;
    spread[Math.min(entry.mistakes, CUNTECTIONS.mistakes - 1)]! += 1;
  }

  let streak = 0;
  let day = days.get(today)?.solved ? today : today - 1;
  while (days.get(day)?.solved) {
    streak += 1;
    day -= 1;
  }

  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const number of [...days.keys()].sort((a, b) => a - b)) {
    run = days.get(number)!.solved ? (number === previous + 1 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    previous = number;
  }

  return { played: days.size, wins, streak, best: Math.max(best, streak), perfect: spread[0]!, spread };
}

export function cuntectionsStanding(
  userId: string,
  days: ReadonlyMap<number, { solved: boolean; mistakes: number }>,
  today: number,
): CuntectionsStanding {
  const stats = cuntectionsStats(days, today);
  let mistakes = 0;
  for (const entry of days.values()) mistakes += entry.mistakes;
  return {
    userId,
    played: stats.played,
    wins: stats.wins,
    streak: stats.streak,
    best: stats.best,
    perfect: stats.perfect,
    averageMistakes: stats.played ? Math.round((mistakes / stats.played) * 100) / 100 : null,
  };
}

/** What "Copy result" copies: a row of colours per guess, never the words. */
export function cuntectionsShare(day: number, grid: readonly (readonly CuntectionsLevel[])[]): string {
  const square = ['🟨', '🟩', '🟦', '🟪'] as const;
  return `Cuntections #${day}\n${grid.map((row) => row.map((level) => square[level]).join('')).join('\n')}`;
}
