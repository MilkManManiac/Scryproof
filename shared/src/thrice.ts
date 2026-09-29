/**
 * Threeway: Thrice, five questions a day for everyone here (Wes, 2026-09-29).
 *
 * Every question has three clues, hardest first. Get it on the first clue
 * for three points, the second for two, the third for one. One guess a
 * clue; a wrong guess or a pass brings the next clue. Fifteen is a perfect
 * day.
 *
 * The rules both sides need live here. The questions stay on the server,
 * and a clue is sent only once you have earned or paid for it
 * (`server/src/routes/thrice.ts`).
 */

import { dailyNumber } from './purdle.js';

export const THRICE = {
  name: 'Threeway',
  questions: 5,
  clues: 3,
  /** #1. */
  firstDay: '2026-09-29',
} as const;

export const THRICE_MAX = THRICE.questions * THRICE.clues;

export function thriceDay(at: Date = new Date()): number {
  return dailyNumber(THRICE.firstDay, at);
}

/** A question as far as you have got with it. */
export interface ThriceQuestionShown {
  category: string;
  /** The clues you have seen, in order. */
  clues: string[];
  /** What you said to each clue you have answered. Empty: you passed. */
  tries: string[];
  /** Null while it is still open. */
  points: number | null;
  /** Once it is closed, right or wrong. */
  answer: string | null;
}

export interface ThriceStats {
  played: number;
  best: number;
  average: number | null;
  /** Days of fifteen. */
  perfect: number;
}

/** Your day, as the server has it. */
export interface ThriceToday {
  day: number;
  /** The questions you have reached; the last one is open unless the day is done. */
  questions: ThriceQuestionShown[];
  score: number;
  state: 'playing' | 'done';
  nextAt: string;
  stats: ThriceStats;
}

export interface ThriceFinish {
  userId: string;
  score: number;
  /** Points for each question, for the row of squares. */
  points: number[];
}

export interface ThriceStanding extends ThriceStats {
  userId: string;
  total: number;
}

export function thriceStanding(userId: string, scores: readonly number[]): ThriceStanding {
  const total = scores.reduce((sum, value) => sum + value, 0);
  return {
    userId,
    played: scores.length,
    total,
    best: scores.length ? Math.max(...scores) : 0,
    average: scores.length ? Math.round((total / scores.length) * 10) / 10 : null,
    perfect: scores.filter((score) => score === THRICE_MAX).length,
  };
}

/** How an answer is compared: case, accents, punctuation, a leading article and spacing do not count. */
export function thricePlain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/^\s*(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length]!;
}

/** Right if it is one of the accepted answers, give or take a slip of the finger in a long one. */
export function thriceRight(said: string, accepted: readonly string[]): boolean {
  const plain = thricePlain(said);
  if (!plain) return false;
  return accepted.some((answer) => {
    const want = thricePlain(answer);
    if (plain === want || plain.replace(/ /g, '') === want.replace(/ /g, '')) return true;
    if (/\d/.test(want)) return false;
    // A slip is never the first letter, and a short answer gets none: Wario is not Mario, Plato is not Pluto.
    if (plain[0] !== want[0]) return false;
    const slips = want.length >= 10 ? 2 : want.length >= 6 ? 1 : 0;
    return slips > 0 && distance(plain, want) <= slips;
  });
}

const SQUARE = ['❌', '1️⃣', '2️⃣', '3️⃣'] as const;

/** What "Copy result" copies: what each question was worth, never a question. */
export function thriceShare(day: number, points: readonly number[]): string {
  const score = points.reduce((sum, value) => sum + value, 0);
  return `${THRICE.name} #${day}\n${points.map((value) => SQUARE[value]).join('')} ${score}/${THRICE_MAX}`;
}
