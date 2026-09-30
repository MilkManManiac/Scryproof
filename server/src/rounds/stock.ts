/**
 * What Whereabouts and Lowball are played with: a list of places and a list
 * of homes, each with its photos' names. Both lists were made once on Wes's
 * PC (`scripts/geo-stock.py`, `scripts/homes-stock.py`); the photos
 * themselves are on the box under `config.gamePhotosDir`, not in the repo.
 *
 * A photo's file name is a random id, and its metadata was stripped, so
 * nothing about a photo says where it was or what it cost.
 */

import type { RoundsGame } from '@scryproof/shared';

import places from '../geo/stock.json';
import homes from '../homes/stock.json';

export interface Place {
  id: string;
  lat: number;
  lng: number;
  country: string | null;
  width: number;
  height: number;
  credit: string | null;
  license: string;
  source: string;
  captured: string | null;
}

export interface Home {
  id: string;
  price: number;
  priceKind: 'sold' | 'listed';
  soldDate: string | null;
  city: string;
  state: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  propertyType: string;
  /** How many photos: `<id>_1.jpg` (the front) to `<id>_<n>.jpg`. */
  photos: number;
  source: string;
}

export const PLACES = new Map((places as unknown as Place[]).map((place) => [place.id, place]));
export const HOMES = new Map((homes as unknown as Home[]).map((home) => [home.id, home]));

export const STOCK: Record<RoundsGame, ReadonlyMap<string, Place | Home>> = {
  whereabouts: PLACES,
  lowball: HOMES,
};

/** Each game's photos, in a folder of its own under `config.gamePhotosDir`. */
export const PHOTO_FOLDER: Record<RoundsGame, string> = {
  whereabouts: 'geo',
  lowball: 'homes',
};

/** The photo files a stock item has. */
export function photosOf(game: RoundsGame, id: string): string[] {
  if (game === 'whereabouts') return [`${id}.jpg`];
  const home = HOMES.get(id);
  return Array.from({ length: home?.photos ?? 0 }, (_, at) => `${id}_${at + 1}.jpg`);
}
