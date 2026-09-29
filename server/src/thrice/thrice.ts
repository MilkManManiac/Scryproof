/**
 * Which five questions a day of Threeway gets, and how far into them
 * someone is.
 *
 * Chosen the way Cuntections chooses: the first time a day is opened it
 * takes a set at random from the ones no day has had (all of them again,
 * once every one has been used) and keeps it (`thrice_days`).
 */

import { createHash, randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { THRICE, thriceRight, type ThriceQuestionShown } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { thriceDays } from '../db/schema.js';
import { SETS, type ThriceQuestion, type ThriceSet } from './questions.js';

/** A set's name for the database: its answers, which is what makes it that set. */
export function setId(set: ThriceSet): string {
  return createHash('sha256').update(set.map((question) => question.answer).join('|')).digest('hex').slice(0, 16);
}

const byId = new Map(SETS.map((set) => [setId(set), set]));

/** The day's questions, choosing them if this is the first time anyone has asked. */
export async function setFor(day: number): Promise<ThriceSet> {
  const db = getDb();
  const [kept] = await db.select().from(thriceDays).where(eq(thriceDays.day, day)).limit(1);
  const known = kept ? byId.get(kept.setId) : undefined;
  if (known) return known;

  // Not chosen yet, or the set it had was taken out of the list: choose.
  const used = new Set((await db.select({ setId: thriceDays.setId }).from(thriceDays)).map((row) => row.setId));
  const fresh = [...byId.keys()].filter((id) => !used.has(id));
  const pool = fresh.length > 0 ? fresh : [...byId.keys()];
  const id = pool[randomInt(pool.length)]!;

  if (kept) {
    await db.update(thriceDays).set({ setId: id }).where(eq(thriceDays.day, day));
    return byId.get(id)!;
  }
  // Two people opening a new day at once: the first one's choice stands.
  await db.insert(thriceDays).values({ day, setId: id }).onConflictDoNothing();
  const [won] = await db.select().from(thriceDays).where(eq(thriceDays.day, day)).limit(1);
  return byId.get(won!.setId) ?? byId.get(id)!;
}

export function isRight(question: ThriceQuestion, said: string): boolean {
  return thriceRight(said, [question.answer, ...(question.accept ?? [])]);
}

/** What a question came to, or null if it is still open. */
export function pointsFor(question: ThriceQuestion, tries: readonly string[]): number | null {
  const right = tries.findIndex((said) => isRight(question, said));
  if (right >= 0) return THRICE.clues - right;
  return tries.length >= THRICE.clues ? 0 : null;
}

/** A question as far as these tries have earned: a clue for each try, and one more while it is open. */
export function shown(question: ThriceQuestion, tries: readonly string[]): ThriceQuestionShown {
  const points = pointsFor(question, tries);
  const clues = points === null ? tries.length + 1 : tries.length;
  return {
    category: question.category,
    clues: question.clues.slice(0, clues),
    tries: [...tries],
    points,
    answer: points === null ? null : question.answer,
  };
}
