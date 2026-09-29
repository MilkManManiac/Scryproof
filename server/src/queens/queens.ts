/**
 * The board for a day of Queefs.
 *
 * Made, not written: put the queens down first, grow a region out from each
 * one until the board is full, then count the answers. A board with more
 * than one is mended where the other answer stands, or thrown away. The
 * first time a day is opened it makes one and keeps it (`queens_days`), so
 * nothing about tomorrow can be read off the source.
 */

import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { QUEENS, type QueensRegions } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { queensDays } from '../db/schema.js';

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = randomInt(at + 1);
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

/** A column for each row: no column twice, and no two rows running on from each other's corner. */
function placeQueens(size: number): number[] {
  const columns: number[] = [];
  const used = new Set<number>();
  const place = (row: number): boolean => {
    if (row === size) return true;
    for (const column of shuffle(Array.from({ length: size }, (_, at) => at))) {
      if (used.has(column) || (row > 0 && Math.abs(columns[row - 1]! - column) <= 1)) continue;
      columns[row] = column;
      used.add(column);
      if (place(row + 1)) return true;
      used.delete(column);
    }
    return false;
  };
  place(0);
  return columns;
}

/** Up to `most` answers to a board, each a column for every row. */
export function answersTo(regions: QueensRegions, most = 2): number[][] {
  const size = regions.length;
  const out: number[][] = [];
  const columns: number[] = [];
  let usedColumns = 0;
  let usedRegions = 0;
  const place = (row: number): void => {
    if (out.length >= most) return;
    if (row === size) {
      out.push([...columns]);
      return;
    }
    for (let column = 0; column < size; column += 1) {
      const region = 1 << regions[row]![column]!;
      if (usedColumns & (1 << column) || usedRegions & region) continue;
      if (row > 0 && Math.abs(columns[row - 1]! - column) <= 1) continue;
      columns[row] = column;
      usedColumns |= 1 << column;
      usedRegions |= region;
      place(row + 1);
      usedColumns &= ~(1 << column);
      usedRegions &= ~region;
    }
  };
  place(0);
  return out;
}

const AROUND = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

function grow(size: number, queens: readonly number[]): QueensRegions {
  const regions: QueensRegions = Array.from({ length: size }, () => Array.from({ length: size }, () => -1));
  // Some regions are greedy and some are not, or every board looks the same.
  const hunger = queens.map(() => 1 + randomInt(6));
  queens.forEach((column, row) => (regions[row]![column] = row));
  let left = size * size - size;
  while (left > 0) {
    const open: [number, number, number][] = [];
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (regions[row]![column] !== -1) continue;
        for (const [dr, dc] of AROUND) {
          const region = regions[row + dr]?.[column + dc];
          if (region === undefined || region === -1) continue;
          for (let times = 0; times < hunger[region]!; times += 1) open.push([row, column, region]);
        }
      }
    }
    const [row, column, region] = open[randomInt(open.length)]!;
    regions[row]![column] = region;
    left -= 1;
  }
  return regions;
}

/** Whether a region is still all one piece without this cell. */
function holdsWithout(regions: QueensRegions, row: number, column: number): boolean {
  const size = regions.length;
  const region = regions[row]![column]!;
  const cells: [number, number][] = [];
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (regions[r]![c] === region && (r !== row || c !== column)) cells.push([r, c]);
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]![0] * size + cells[0]![1]]);
  const queue = [cells[0]!];
  while (queue.length > 0) {
    const [r, c] = queue.pop()!;
    for (const [dr, dc] of AROUND) {
      const [nr, nc] = [r + dr, c + dc];
      if ((nr === row && nc === column) || regions[nr]?.[nc] !== region || seen.has(nr * size + nc)) continue;
      seen.add(nr * size + nc);
      queue.push([nr, nc]);
    }
  }
  return seen.size === cells.length;
}

/** A board with exactly one answer. */
export function makeBoard(size: number = QUEENS.size): QueensRegions {
  for (;;) {
    const queens = placeQueens(size);
    const regions = grow(size, queens);
    // Mend it a few times before giving up on it.
    for (let mends = 0; mends < 40; mends += 1) {
      const answers = answersTo(regions);
      if (answers.length === 1) {
        if (tooPlain(regions)) break;
        return regions;
      }
      const other = answers.find((answer) => answer.some((column, row) => column !== queens[row]))!;
      // Give a cell the other answer stands on to a neighbour that already holds one of its queens.
      const moves: [number, number, number][] = [];
      other.forEach((column, row) => {
        if (column === queens[row] || !holdsWithout(regions, row, column)) return;
        for (const [dr, dc] of AROUND) {
          const region = regions[row + dr]?.[column + dc];
          if (region === undefined || region === regions[row]![column]) continue;
          moves.push([row, column, region]);
        }
      });
      if (moves.length === 0) break;
      const [row, column, region] = moves[randomInt(moves.length)]!;
      regions[row]![column] = region;
    }
  }
}

/** A board that gives itself away: too many regions of one or two cells. */
function tooPlain(regions: QueensRegions): boolean {
  const sizes = new Map<number, number>();
  for (const row of regions) for (const region of row) sizes.set(region, (sizes.get(region) ?? 0) + 1);
  return [...sizes.values()].filter((count) => count <= 2).length > 2;
}

/** The day's board, making it if this is the first time anyone has asked. */
export async function boardFor(day: number): Promise<QueensRegions> {
  const db = getDb();
  const [kept] = await db.select().from(queensDays).where(eq(queensDays.day, day)).limit(1);
  if (kept) return kept.regions;
  // Two people opening a new day at once: the first one's board stands.
  await db.insert(queensDays).values({ day, regions: makeBoard() }).onConflictDoNothing();
  const [won] = await db.select().from(queensDays).where(eq(queensDays.day, day)).limit(1);
  return won!.regions;
}
