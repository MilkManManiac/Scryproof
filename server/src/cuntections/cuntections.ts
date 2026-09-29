/**
 * Which Cuntections puzzle a day gets, and how a guess is marked.
 *
 * The first time a day is opened it takes a puzzle at random from the ones no
 * day has had yet (all of them again, once every one has been used), deals
 * its sixteen words in a random order, and keeps both (`cuntections_days`).
 * Nothing about the choice follows from the source, so reading the puzzle
 * list says nothing about tomorrow, and adding puzzles moves no day that has
 * already been played.
 */

import { createHash, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import type { CuntectionsGroupShown, CuntectionsLevel } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { cuntectionsDays } from '../db/schema.js';
import { PUZZLES, type CuntectionsPuzzle } from './puzzles.js';

/** A puzzle's name for the database: its words, which is what makes it that puzzle. */
export function puzzleId(puzzle: CuntectionsPuzzle): string {
  const words = puzzle.flatMap((group) => group.words.map(normal)).sort();
  return createHash('sha256').update(words.join('|')).digest('hex').slice(0, 16);
}

const byId = new Map(PUZZLES.map((puzzle) => [puzzleId(puzzle), puzzle]));

/** How a word is compared: the tiles show it upper case, a guess may come any way. */
export function normal(word: string): string {
  return word.trim().toUpperCase();
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = randomInt(at + 1);
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

export interface Dealt {
  puzzle: CuntectionsPuzzle;
  words: string[];
}

/** The day's puzzle and its deal, choosing them if this is the first time anyone has asked. */
export async function dealFor(day: number): Promise<Dealt> {
  const db = getDb();
  const [kept] = await db.select().from(cuntectionsDays).where(eq(cuntectionsDays.day, day)).limit(1);
  const known = kept ? byId.get(kept.puzzleId) : undefined;
  if (kept && known) return { puzzle: known, words: kept.words };

  // Not chosen yet, or the puzzle it had was taken out of the list: choose.
  const used = new Set((await db.select({ puzzleId: cuntectionsDays.puzzleId }).from(cuntectionsDays)).map((row) => row.puzzleId));
  const fresh = [...byId.keys()].filter((id) => !used.has(id));
  const pool = fresh.length > 0 ? fresh : [...byId.keys()];
  const id = pool[randomInt(pool.length)]!;
  const puzzle = byId.get(id)!;
  const words = shuffle(puzzle.flatMap((group) => [...group.words]));

  if (kept) {
    await db.update(cuntectionsDays).set({ puzzleId: id, words }).where(eq(cuntectionsDays.day, day));
    return { puzzle, words };
  }
  // Two people opening a new day at once: the first one's choice stands.
  await db.insert(cuntectionsDays).values({ day, puzzleId: id, words }).onConflictDoNothing();
  const [won] = await db.select().from(cuntectionsDays).where(eq(cuntectionsDays.day, day)).limit(1);
  return { puzzle: byId.get(won!.puzzleId) ?? puzzle, words: won!.words };
}

export function shown(group: CuntectionsPuzzle[number]): CuntectionsGroupShown {
  return { name: group.name, level: group.level, words: [...group.words] };
}

/** The group these four are, or null. */
export function groupOf(puzzle: CuntectionsPuzzle, guess: readonly string[]): CuntectionsPuzzle[number] | null {
  const wanted = new Set(guess.map(normal));
  return puzzle.find((group) => group.words.every((word) => wanted.has(normal(word)))) ?? null;
}

/** Three of the four are one group. Only said of a group not found yet. */
export function oneAway(puzzle: CuntectionsPuzzle, guess: readonly string[], found: ReadonlySet<CuntectionsLevel>): boolean {
  const wanted = new Set(guess.map(normal));
  return puzzle.some(
    (group) => !found.has(group.level) && group.words.filter((word) => wanted.has(normal(word))).length === group.words.length - 1,
  );
}

export function levelOf(puzzle: CuntectionsPuzzle, word: string): CuntectionsLevel {
  return puzzle.find((group) => group.words.some((entry) => normal(entry) === normal(word)))?.level ?? 0;
}
