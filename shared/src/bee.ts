/**
 * The bee: Spelling Bee, one board a day for everyone here (Wes, 2026-09-29).
 *
 * Seven letters, one of them in the middle. Make words of four letters or
 * more out of them, as often as you like each, the middle one in every word.
 * Unlike the other two it does not end: the board is open all day and the
 * points are a race. Same midnight Eastern as Purdle.
 *
 * The rules both sides need live here. The word list, and so the answers,
 * stay on the server (`server/src/bee/`).
 */

import { dailyNumber } from './purdle.js';

export const BEE = {
  /** What it is called everywhere it is shown. */
  name: 'Smelling Pee',
  letters: 7,
  shortest: 4,
  /** On top of its length, for a word that uses all seven. */
  pangramBonus: 7,
  /** #1. */
  firstDay: '2026-09-29',
} as const;

export function beeDay(at: Date = new Date()): number {
  return dailyNumber(BEE.firstDay, at);
}

export function isPangram(word: string): boolean {
  return new Set(word).size === BEE.letters;
}

/** A four-letter word is one point; a longer one, a point a letter; all seven letters, seven more. */
export function beePoints(word: string): number {
  return (word.length === BEE.shortest ? 1 : word.length) + (isPangram(word) ? BEE.pangramBonus : 0);
}

/** Each rank and the share of the day's points it starts at. */
export const BEE_RANKS = [
  { name: 'Beginner', at: 0 },
  { name: 'Good start', at: 0.02 },
  { name: 'Moving up', at: 0.05 },
  { name: 'Good', at: 0.08 },
  { name: 'Solid', at: 0.15 },
  { name: 'Nice', at: 0.25 },
  { name: 'Great', at: 0.4 },
  { name: 'Amazing', at: 0.5 },
  { name: 'Genius', at: 0.7 },
  { name: 'Golden shower', at: 1 },
] as const;

export const BEE_GENIUS = 8;

/** The points a rank starts at, on a day worth `max`. */
export function beeRankAt(rank: number, max: number): number {
  return Math.ceil(BEE_RANKS[rank]!.at * max);
}

/** The index in `BEE_RANKS` that `score` has reached. */
export function beeRank(score: number, max: number): number {
  let rank = 0;
  for (let at = 1; at < BEE_RANKS.length; at += 1) if (max > 0 && score >= beeRankAt(at, max)) rank = at;
  return rank;
}

/** Why a word was not taken, in the order they are checked. */
export type BeeRefusal = 'too_short' | 'bad_letters' | 'no_centre' | 'already_found' | 'not_a_word';

export const BEE_REFUSALS: Record<BeeRefusal, string> = {
  too_short: 'Too short',
  bad_letters: 'Bad letters',
  no_centre: 'Missing the middle letter',
  already_found: 'Already found',
  not_a_word: 'Not in the word list',
};

/** What can be said of a word without the word list. Null: ask the server. */
export function beeRefusal(word: string, letters: readonly string[], found: readonly string[]): BeeRefusal | null {
  if (word.length < BEE.shortest) return 'too_short';
  if ([...word].some((letter) => !letters.includes(letter))) return 'bad_letters';
  if (!word.includes(letters[0]!)) return 'no_centre';
  if (found.includes(word)) return 'already_found';
  return null;
}

export interface BeeStats {
  /** Days with at least one word. */
  played: number;
  /** Days that reached Genius. */
  genius: number;
  best: number;
  average: number | null;
}

/** A day that is over, with everything that was in it. */
export interface BeeYesterday {
  day: number;
  letters: string[];
  /** Every word the day was scored against. */
  answers: string[];
  /** What you found, the uncommon ones too. */
  found: string[];
}

/** Your day, as the server has it. */
export interface BeeToday {
  day: number;
  /** Lower case, the middle one first. */
  letters: string[];
  /** The points and the words the day is scored against. Uncommon words score on top. */
  max: number;
  answers: number;
  /** Found so far, in the order found. */
  words: string[];
  /** Which of those are uncommon ones, that the day did not need. */
  extra: string[];
  score: number;
  rank: number;
  /** When the next board starts, ISO. */
  nextAt: string;
  stats: BeeStats;
  yesterday: BeeYesterday | null;
}

/** What the word just taken came to. */
export interface BeeTaken {
  word: string;
  points: number;
  pangram: boolean;
  extra: boolean;
}

/** Where someone is today. */
export interface BeeScore {
  userId: string;
  score: number;
  words: number;
  rank: number;
}

/** Someone's record since they started. */
export interface BeeStanding extends BeeStats {
  userId: string;
  total: number;
}

export function beeStanding(userId: string, days: Iterable<{ score: number; max: number }>): BeeStanding {
  let played = 0;
  let genius = 0;
  let best = 0;
  let total = 0;
  for (const day of days) {
    played += 1;
    total += day.score;
    best = Math.max(best, day.score);
    if (beeRank(day.score, day.max) >= BEE_GENIUS) genius += 1;
  }
  return { userId, played, genius, best, total, average: played ? Math.round((total / played) * 10) / 10 : null };
}

/** What "Copy result" copies: where you got to, never a word. */
export function beeShare(today: Pick<BeeToday, 'day' | 'score' | 'words' | 'rank'>): string {
  const pangrams = today.words.filter(isPangram).length;
  const words = `${today.words.length} word${today.words.length === 1 ? '' : 's'}`;
  const all = pangrams ? `, ${pangrams} with all seven` : '';
  return `${BEE.name} #${today.day}\n${BEE_RANKS[today.rank]!.name}: ${today.score} points\n${words}${all}`;
}
