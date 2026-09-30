/**
 * Two daily games of five rounds, played with a photo and one guess a round
 * (Wes, 2026-09-29: "add a geoguesser and a house price guesser").
 *
 * Whereabouts: a street somewhere in the world. Click where you think it is.
 * Lowball: a home for sale in the US. Say what it went for.
 *
 * Each round is worth up to 5000, so 25000 is a perfect day. The rules both
 * sides need live here. The places and the prices stay on the server, and an
 * answer is sent only once you have guessed (`server/src/routes/rounds.ts`).
 * The photos were downloaded once and are served from our own box: nobody's
 * browser ever asks Panoramax or Redfin for anything.
 */

import { dailyNumber } from './purdle.js';

export type RoundsGame = 'whereabouts' | 'lowball';

export const WHEREABOUTS = {
  name: 'Whereabouts',
  rounds: 5,
  /** #1. */
  firstDay: '2026-09-30',
} as const;

export const LOWBALL = {
  name: 'Lowball',
  rounds: 5,
  /** #1. */
  firstDay: '2026-09-30',
} as const;

export const ROUNDS = { whereabouts: WHEREABOUTS, lowball: LOWBALL } as const;

export const ROUND_MAX = 5000;
export const ROUNDS_MAX = ROUND_MAX * 5;

export function roundsDay(game: RoundsGame, at: Date = new Date()): number {
  return dailyNumber(ROUNDS[game].firstDay, at);
}

/* ------------------------------------------------------------------ scoring */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function kmBetween(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * GeoGuessr's own curve for the world map: 5000 on the spot, about half at
 * 1000 km, next to nothing on the wrong continent. Within a kilometre is a
 * full score, because nobody clicks a world map to the metre.
 */
export function wherePoints(km: number): number {
  if (km <= 1) return ROUND_MAX;
  return Math.round(ROUND_MAX * Math.exp(-km / 1492.7));
}

/**
 * By how far off, as a ratio, so $50k out on a $100k shack costs what $500k
 * out on a $1M house does. Within 2% is a full score; 10% off is about 3700,
 * a quarter off about 2600, half again about 1500, double about 600.
 */
export function lowballPoints(guess: number, price: number): number {
  if (guess <= 0 || price <= 0) return 0;
  const off = Math.abs(Math.log(guess / price));
  if (off <= 0.02) return ROUND_MAX;
  return Math.round(ROUND_MAX * Math.exp(-3 * off));
}

/**
 * What people type for a price: "450000", "$450,000", "450k", "1.2m",
 * "1.2 mil". Null for anything that is not one.
 */
export function parsePrice(text: string): number | null {
  const match = /^\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|thousand|m|mil|million)?\s*$/i.exec(text);
  if (!match) return null;
  const number = Number(match[1]!.replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const price = Math.round(unit.startsWith('k') || unit === 'thousand' ? number * 1000 : unit.startsWith('m') ? number * 1_000_000 : number);
  return price >= 1000 && price <= 1_000_000_000 ? price : null;
}

/** $475,000, or $1.25M once it is a million or more. */
export function priceText(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(price >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  return `$${price.toLocaleString('en-US')}`;
}

/* ------------------------------------------------------------ what is shown */

/** A Whereabouts round as far as you have got with it. */
export interface WhereRound {
  /** Served from our box, `/api/rounds/photo/...`. */
  photo: string;
  width: number;
  height: number;
  /** Your click, once made. */
  guess: LatLng | null;
  points: number | null;
  km: number | null;
  /** Once you have guessed. */
  answer: {
    lat: number;
    lng: number;
    /** ISO3, as on the Travhole map; null out at sea or off the outlines. */
    country: string | null;
    credit: string | null;
    license: string;
    source: string;
    captured: string | null;
  } | null;
}

/** A Lowball round: the home and its facts, and the price once you have guessed. */
export interface HomeRound {
  photos: string[];
  city: string;
  state: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string;
  guess: number | null;
  points: number | null;
  answer: {
    price: number;
    /** Sold is what someone paid; listed is what the seller asked. */
    priceKind: 'sold' | 'listed';
    soldDate: string | null;
    source: string;
  } | null;
}

export interface RoundsStats {
  played: number;
  best: number;
  average: number | null;
}

export interface RoundsToday<Round> {
  day: number;
  /** The rounds you have reached; the last one is open unless the day is done. */
  rounds: Round[];
  score: number;
  state: 'playing' | 'done';
  nextAt: string;
  stats: RoundsStats;
}

export type WhereToday = RoundsToday<WhereRound>;
export type LowballToday = RoundsToday<HomeRound>;

export interface RoundsFinish {
  userId: string;
  score: number;
  points: number[];
}

export interface RoundsStanding extends RoundsStats {
  userId: string;
  total: number;
}

export function roundsStanding(userId: string, scores: readonly number[]): RoundsStanding {
  const total = scores.reduce((sum, value) => sum + value, 0);
  return {
    userId,
    played: scores.length,
    total,
    best: scores.length ? Math.max(...scores) : 0,
    average: scores.length ? Math.round(total / scores.length) : null,
  };
}

/** A round's square in a shared result. */
export function roundSquare(points: number): string {
  if (points >= 4500) return '🟩';
  if (points >= 3000) return '🟨';
  if (points >= 1000) return '🟧';
  return '🟥';
}

/** What "Copy result" copies: how each round went, never where or how much. */
export function roundsShare(game: RoundsGame, day: number, points: readonly number[]): string {
  const score = points.reduce((sum, value) => sum + value, 0);
  return `${ROUNDS[game].name} #${day}\n${points.map(roundSquare).join('')} ${score.toLocaleString('en-US')}/${ROUNDS_MAX.toLocaleString('en-US')}`;
}
