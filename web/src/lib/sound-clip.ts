/**
 * Cutting a soundboard clip out of a longer file: the arithmetic, with no
 * browser in it, so it can be tested. The screen is `SoundClipper.tsx`; the
 * decoding and encoding are in `sound-cut.ts`.
 *
 * Wes, 2026-09-25: "Adding a sound should let you clip it so you can pick
 * exactly what the sound sounds like."
 *
 * A selection is a start and an end in seconds. It is never longer than a
 * sound may be, never shorter than a tenth of a second, and never outside the
 * file.
 */

import { LIMITS } from '@scryproof/shared';

export interface Selection {
  start: number;
  end: number;
}

/** The shortest clip worth keeping. Shorter than this is a click. */
export const SHORTEST_CLIP = 0.1;

/** How much of the file the big waveform shows at once, so a 15-second clip is not a sliver of a song. */
export const DETAIL_SPAN = LIMITS.soundSeconds * 2;

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** The first 15 seconds, or the whole file if it is shorter. */
export function firstSelection(duration: number, longest = LIMITS.soundSeconds): Selection {
  return { start: 0, end: Math.min(duration, longest) };
}

/** Drag one end. The other end stays put; the selection keeps within the file, the longest length and the shortest. */
export function moveEdge(
  selection: Selection,
  edge: 'start' | 'end',
  at: number,
  duration: number,
  longest = LIMITS.soundSeconds,
): Selection {
  const shortest = Math.min(SHORTEST_CLIP, duration);
  if (edge === 'start') {
    const low = Math.max(0, selection.end - longest);
    return { start: clamp(at, low, Math.max(low, selection.end - shortest)), end: selection.end };
  }
  const high = Math.min(duration, selection.start + longest);
  return { start: selection.start, end: clamp(at, Math.min(high, selection.start + shortest), high) };
}

/** Slide the whole selection, keeping its length. */
export function moveWhole(selection: Selection, start: number, duration: number): Selection {
  const length = selection.end - selection.start;
  const from = clamp(start, 0, Math.max(0, duration - length));
  return { start: from, end: from + length };
}

/**
 * The stretch of the file the big waveform shows: all of it if it is short,
 * otherwise `span` seconds centred on the selection, kept inside the file.
 */
export function viewAround(selection: Selection, duration: number, span = DETAIL_SPAN): Selection {
  if (duration <= span) return { start: 0, end: duration };
  const middle = (selection.start + selection.end) / 2;
  const start = clamp(middle - span / 2, 0, duration - span);
  return { start, end: start + span };
}

/** Whether all of the selection is on screen in this view. */
export function fitsView(selection: Selection, view: Selection): boolean {
  return selection.start >= view.start && selection.end <= view.end;
}

/** "0:03.4", "1:02.0". Tenths, because a tenth of a second is about what an ear can place. */
export function clipTime(seconds: number): string {
  const tenths = Math.max(0, Math.round(seconds * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/**
 * The loudest point in each column of a waveform, from `from` to `to`
 * seconds, over every channel. One number per column, 0 to 1.
 */
export function peaks(
  channels: readonly Float32Array[],
  rate: number,
  from: number,
  to: number,
  columns: number,
): number[] {
  const out: number[] = new Array(Math.max(0, columns)).fill(0);
  const length = channels[0]?.length ?? 0;
  const first = Math.max(0, Math.floor(from * rate));
  const last = Math.min(length, Math.ceil(to * rate));
  if (columns <= 0 || last <= first) return out;
  const per = (last - first) / columns;
  // A long stretch per column is sampled rather than read in full: a song at
  // 400 columns is a hundred thousand samples a column, and a peak does not
  // need all of them to show.
  const stride = Math.max(1, Math.floor(per / 2000));
  for (let column = 0; column < columns; column += 1) {
    const begin = first + Math.floor(column * per);
    const end = Math.min(last, first + Math.floor((column + 1) * per));
    let loudest = 0;
    for (const channel of channels) {
      for (let index = begin; index < end; index += stride) {
        const value = Math.abs(channel[index] ?? 0);
        if (value > loudest) loudest = value;
      }
    }
    out[column] = Math.min(1, loudest);
  }
  return out;
}
