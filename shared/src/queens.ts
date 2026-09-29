/**
 * Queefs: Queens, one board a day for everyone here (Wes, 2026-09-29).
 *
 * A square board cut into as many coloured regions as it has rows. One queen
 * in every row, every column and every region, and no two touching, not even
 * at a corner. There is one way to do it. It is a race: the clock starts
 * when you ask for the board and stops when the server has checked it.
 *
 * The rules both sides need live here. A board says nothing of its answer,
 * so there is nothing to keep back but the board itself until you start.
 */

import { dailyNumber } from './purdle.js';

export const QUEENS = {
  name: 'Queenies',
  size: 8,
  /** #1. */
  firstDay: '2026-09-29',
} as const;

export function queensDay(at: Date = new Date()): number {
  return dailyNumber(QUEENS.firstDay, at);
}

/** Region of each cell, a row at a time. Regions are numbered from 0. */
export type QueensRegions = number[][];

/** A cell as one number: `row * size + column`. */
export const queensCell = (row: number, column: number, size: number) => row * size + column;

/** The queens that break a rule with another queen. */
export function queensClashes(regions: QueensRegions, queens: readonly number[]): Set<number> {
  const size = regions.length;
  const bad = new Set<number>();
  for (let a = 0; a < queens.length; a += 1) {
    for (let b = a + 1; b < queens.length; b += 1) {
      const [ar, ac] = [Math.floor(queens[a]! / size), queens[a]! % size];
      const [br, bc] = [Math.floor(queens[b]! / size), queens[b]! % size];
      const touching = Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
      if (ar === br || ac === bc || touching || regions[ar]![ac] === regions[br]![bc]) {
        bad.add(queens[a]!);
        bad.add(queens[b]!);
      }
    }
  }
  return bad;
}

export function queensSolved(regions: QueensRegions, queens: readonly number[]): boolean {
  const size = regions.length;
  if (queens.length !== size || new Set(queens).size !== size) return false;
  if (queens.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= size * size)) return false;
  return queensClashes(regions, queens).size === 0;
}

/** "1:07", or "1:02:07" on a very bad day. */
export function queensClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  return hours > 0 ? `${hours}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export interface QueensStats {
  /** Days solved. */
  played: number;
  best: number | null;
  average: number | null;
}

/** Your day, as the server has it. */
export interface QueensToday {
  day: number;
  size: number;
  /** `waiting`: not started, and no board yet. */
  state: 'waiting' | 'playing' | 'done';
  regions: QueensRegions | null;
  /** When your clock started, ISO. */
  startedAt: string | null;
  /** How long it took, once done. */
  seconds: number | null;
  /** Where your queens were when it was solved. */
  queens: number[] | null;
  nextAt: string;
  stats: QueensStats;
}

export interface QueensFinish {
  userId: string;
  seconds: number;
}

/** Someone's record since they started. `firsts` is the days they were the quickest in the server asked about. */
export interface QueensStanding extends QueensStats {
  userId: string;
  firsts: number;
}

export function queensStats(seconds: readonly number[]): QueensStats {
  if (seconds.length === 0) return { played: 0, best: null, average: null };
  const total = seconds.reduce((sum, value) => sum + value, 0);
  return { played: seconds.length, best: Math.min(...seconds), average: Math.round(total / seconds.length) };
}

export function queensShare(day: number, seconds: number): string {
  return `${QUEENS.name} #${day}\n👑 ${queensClock(seconds)}`;
}
