/**
 * The bee's board for a day, and what its words are.
 *
 * The first time a day is opened it takes, at random, a common word with
 * seven different letters whose letters no day has had, and a middle letter
 * that leaves the day neither thin nor endless, and keeps them (`bee_days`).
 * Nothing about the choice follows from the source, so reading the word list
 * says nothing about tomorrow.
 */

import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { BEE, beePoints } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { beeDays } from '../db/schema.js';
import { COMMON, RARE } from './words.js';

/** A day has between this many common words and this many. */
const FEWEST = 20;
const MOST = 50;

/** The letters of a word as bits, a first. */
function bits(word: string): number {
  let out = 0;
  for (let at = 0; at < word.length; at += 1) out |= 1 << (word.charCodeAt(at) - 97);
  return out;
}

interface Lists {
  common: Map<string, number>;
  rare: Set<string>;
  /** Every set of seven letters some common word uses all of. */
  sevens: number[];
}

let lists: Lists | null = null;

function loaded(): Lists {
  if (lists) return lists;
  const common = new Map<string, number>();
  const sevens = new Set<number>();
  for (const word of COMMON.split(' ')) {
    const mask = bits(word);
    common.set(word, mask);
    if (new Set(word).size === BEE.letters) sevens.add(mask);
  }
  lists = { common, rare: new Set(RARE.split(' ')), sevens: [...sevens] };
  return lists;
}

export interface Board {
  /** Lower case, the middle one first. */
  letters: string[];
  max: number;
}

/** The common words of a board: what the day is scored against. */
export function answersFor(letters: readonly string[]): string[] {
  const all = bits(letters.join(''));
  const centre = bits(letters[0]!);
  const out: string[] = [];
  for (const [word, mask] of loaded().common) if ((mask & ~all) === 0 && (mask & centre) !== 0) out.push(word);
  return out.sort();
}

/** Whether the word list has it at all, and whether as a common word. */
export function lookUp(word: string): 'common' | 'rare' | null {
  const { common, rare } = loaded();
  return common.has(word) ? 'common' : rare.has(word) ? 'rare' : null;
}

export function pointsOf(words: readonly string[]): number {
  return words.reduce((sum, word) => sum + beePoints(word), 0);
}

function lettersOf(mask: number): string[] {
  const out: string[] = [];
  for (let at = 0; at < 26; at += 1) if (mask & (1 << at)) out.push(String.fromCharCode(97 + at));
  return out;
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = randomInt(at + 1);
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

/** A board no day in `used` has had the letters of. */
export function choose(used: ReadonlySet<string>): Board {
  const { sevens } = loaded();
  let spare: Board | null = null;
  for (const seven of shuffle(sevens)) {
    const letters = lettersOf(seven);
    if (used.has(letters.join(''))) continue;
    for (const centre of shuffle(letters)) {
      const board = [centre, ...shuffle(letters.filter((letter) => letter !== centre))];
      const answers = answersFor(board);
      spare ??= { letters: board, max: pointsOf(answers) };
      if (answers.length >= FEWEST && answers.length <= MOST) return { letters: board, max: pointsOf(answers) };
    }
  }
  // Every set of letters has been a day (ten years on), or none fits: any will do.
  return spare ?? choose(new Set());
}

const sorted = (letters: string) => [...letters].sort().join('');

/** The day's board, choosing it if this is the first time anyone has asked. */
export async function boardFor(day: number): Promise<Board> {
  const db = getDb();
  const [kept] = await db.select().from(beeDays).where(eq(beeDays.day, day)).limit(1);
  if (kept) return { letters: [...kept.letters], max: kept.max };

  const used = new Set((await db.select({ letters: beeDays.letters }).from(beeDays)).map((row) => sorted(row.letters)));
  const board = choose(used);
  // Two people opening a new day at once: the first one's choice stands.
  await db.insert(beeDays).values({ day, letters: board.letters.join(''), max: board.max }).onConflictDoNothing();
  const [won] = await db.select().from(beeDays).where(eq(beeDays.day, day)).limit(1);
  return { letters: [...won!.letters], max: won!.max };
}

/** A day's board if it ever had one. Never chooses. */
export async function boardOf(day: number): Promise<Board | null> {
  const [kept] = await getDb().select().from(beeDays).where(eq(beeDays.day, day)).limit(1);
  return kept ? { letters: [...kept.letters], max: kept.max } : null;
}
