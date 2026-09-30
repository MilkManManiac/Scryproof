/**
 * Which five photos a day of Whereabouts or Lowball gets, and what a guess
 * at one of them is worth.
 *
 * Chosen the way Threeway chooses: the first time a day is opened it takes
 * five at random from the ones no earlier day has had (from all of them
 * again, once every one has been used) and keeps them (`rounds_days`).
 */

import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  kmBetween,
  lowballPoints,
  ROUNDS,
  wherePoints,
  type HomeRound,
  type LatLng,
  type RoundsGame,
  type WhereRound,
} from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { roundsDays } from '../db/schema.js';
import { HOMES, PLACES, STOCK, photosOf } from './stock.js';

/** The day's items, choosing them if this is the first time anyone has asked. */
export async function itemsFor(game: RoundsGame, day: number): Promise<string[]> {
  const db = getDb();
  const stock = STOCK[game];
  const count = ROUNDS[game].rounds;
  const [kept] = await db
    .select()
    .from(roundsDays)
    .where(and(eq(roundsDays.game, game), eq(roundsDays.day, day)))
    .limit(1);
  // Kept, and every item still in the stock: that is the day.
  if (kept && kept.items.length === count && kept.items.every((id) => stock.has(id))) return kept.items;

  const used = new Set(
    (await db.select({ items: roundsDays.items }).from(roundsDays).where(eq(roundsDays.game, game))).flatMap((row) => row.items),
  );
  const all = [...stock.keys()];
  const fresh = all.filter((id) => !used.has(id));
  const pool = fresh.length >= count ? fresh : all;
  const items: string[] = [];
  while (items.length < Math.min(count, pool.length)) {
    const id = pool[randomInt(pool.length)]!;
    if (!items.includes(id)) items.push(id);
  }

  if (kept) {
    await db.update(roundsDays).set({ items }).where(and(eq(roundsDays.game, game), eq(roundsDays.day, day)));
    return items;
  }
  // Two people opening a new day at once: the first one's choice stands.
  await db.insert(roundsDays).values({ game, day, items }).onConflictDoNothing();
  const [won] = await db
    .select()
    .from(roundsDays)
    .where(and(eq(roundsDays.game, game), eq(roundsDays.day, day)))
    .limit(1);
  return won?.items ?? items;
}

/** A guess as the app sends it, checked; null if it is not one. */
export function readGuess(game: RoundsGame, raw: unknown): LatLng | number | null {
  if (game === 'whereabouts') {
    const at = raw as Partial<LatLng> | null;
    if (typeof at?.lat !== 'number' || typeof at.lng !== 'number') return null;
    if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng) || Math.abs(at.lat) > 90) return null;
    // A map dragged round the back of the world still means somewhere on it.
    const lng = ((((at.lng + 180) % 360) + 360) % 360) - 180;
    return { lat: at.lat, lng };
  }
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1000 && raw <= 1_000_000_000 ? Math.round(raw) : null;
}

/** What one guess at one item came to. */
export function pointsFor(game: RoundsGame, id: string, guess: unknown): number {
  if (game === 'whereabouts') {
    const place = PLACES.get(id);
    return place ? wherePoints(kmBetween(place, guess as LatLng)) : 0;
  }
  const home = HOMES.get(id);
  return home ? lowballPoints(guess as number, home.price) : 0;
}

const photoUrl = (file: string) => `/api/rounds/photo/${file}`;

/** A round as this guess (or none yet) has earned it: the answer only after the guess. */
export function shown(game: RoundsGame, id: string, guess: unknown): WhereRound | HomeRound {
  const guessed = guess !== undefined && guess !== null;
  const points = guessed ? pointsFor(game, id, guess) : null;
  if (game === 'whereabouts') {
    const place = PLACES.get(id)!;
    return {
      photo: photoUrl(photosOf(game, id)[0]!),
      width: place.width,
      height: place.height,
      guess: guessed ? (guess as LatLng) : null,
      points,
      km: guessed ? Math.round(kmBetween(place, guess as LatLng) * 10) / 10 : null,
      answer: guessed
        ? {
            lat: place.lat,
            lng: place.lng,
            country: place.country,
            credit: place.credit,
            license: place.license,
            source: place.source,
            captured: place.captured,
          }
        : null,
    } satisfies WhereRound;
  }
  const home = HOMES.get(id)!;
  return {
    photos: photosOf(game, id).map(photoUrl),
    city: home.city,
    state: home.state,
    beds: home.beds,
    baths: home.baths,
    sqft: home.sqft,
    lotSqft: home.lotSqft,
    yearBuilt: home.yearBuilt,
    propertyType: home.propertyType,
    guess: guessed ? (guess as number) : null,
    points,
    answer: guessed ? { price: home.price, priceKind: home.priceKind, soldDate: home.soldDate, source: home.source } : null,
  } satisfies HomeRound;
}
