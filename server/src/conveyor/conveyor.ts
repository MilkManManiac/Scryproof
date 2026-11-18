/**
 * Which twenty things a day of Conveyor gets.
 *
 * The first time a day is opened, twenty are drawn from the bank with the
 * day as the seed: no more than four of one kind, nothing from the last two
 * weeks, and no two that the matcher would mix up. The pick is kept whole in
 * `conveyor_days`, so editing the bank never changes a day already played.
 */

import { desc, eq, gte } from 'drizzle-orm';

import { CONVEYOR, namesMatch, type ConveyorItem } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { conveyorDays } from '../db/schema.js';
import { BANK, type BankItem } from './bank.js';

/** A small seeded shuffle (mulberry32): the same day always draws the same way. */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let at = out.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [out[at], out[other]] = [out[other]!, out[at]!];
  }
  return out;
}

/** Whether two things could be taken for each other by the matcher. */
export function lookalike(a: { name: string; aliases: readonly string[] }, b: { name: string; aliases: readonly string[] }): boolean {
  const bNames = [b.name, ...b.aliases];
  const aNames = [a.name, ...a.aliases];
  return aNames.some((name) => namesMatch(name, bNames)) || bNames.some((name) => namesMatch(name, aNames));
}

/** Twenty for `day`, avoiding the ids in `recent`. Pure, for the tests. */
export function pick(day: number, recent: ReadonlySet<string>, bank: readonly BankItem[] = BANK): ConveyorItem[] {
  const order = shuffled(bank, day * 2654435761);
  const chosen: BankItem[] = [];
  const perKind = new Map<string, number>();
  // First pass keeps the two-week rule; a second, only if the bank ran short, drops it.
  for (const strict of [true, false]) {
    for (const item of order) {
      if (chosen.length === CONVEYOR.items) break;
      if (chosen.includes(item)) continue;
      if (strict && recent.has(item.id)) continue;
      if ((perKind.get(item.category) ?? 0) >= CONVEYOR.perCategory) continue;
      if (chosen.some((other) => lookalike(item, other))) continue;
      chosen.push(item);
      perKind.set(item.category, (perKind.get(item.category) ?? 0) + 1);
    }
  }
  return chosen.map(({ id, name, aliases, file }) => ({ id, name, aliases: [...aliases], file }));
}

/** The day's twenty, choosing them if this is the first time anyone has asked. */
export async function itemsFor(day: number): Promise<ConveyorItem[]> {
  const db = getDb();
  const [kept] = await db.select().from(conveyorDays).where(eq(conveyorDays.day, day)).limit(1);
  if (kept) return kept.items;

  const recentRows = await db
    .select({ items: conveyorDays.items })
    .from(conveyorDays)
    .where(gte(conveyorDays.day, day - CONVEYOR.freshDays))
    .orderBy(desc(conveyorDays.day));
  const recent = new Set(recentRows.flatMap((row) => row.items.map((item) => item.id)));
  const items = pick(day, recent);

  // Two people opening a new day at once: the first one's pick stands.
  await db.insert(conveyorDays).values({ day, items }).onConflictDoNothing();
  const [won] = await db.select().from(conveyorDays).where(eq(conveyorDays.day, day)).limit(1);
  return won?.items ?? items;
}
