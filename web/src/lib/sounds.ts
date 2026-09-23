/**
 * The soundboard's clips, on this side: checking a file before it is
 * uploaded, and turning a clip into something the call can play.
 *
 * The server checks size and type and nothing more, because knowing how long
 * a clip is means decoding it. The browser decodes audio anyway, so the length
 * rule lives here. That makes it a courtesy rather than a control, which is
 * fine: the worst a longer clip does is play for longer, and the size cap on
 * the server bounds that.
 */

import { LIMITS, SOUND_TYPES, isSoundType, type SoundType } from '@scryproof/shared';

import { audioContext } from './voice-audio';

/**
 * Encoders pad the end of a clip to a whole frame, so an honest five-second
 * recording can decode a few hundredths over. This much slack is inaudible
 * and saves turning people away over rounding.
 */
const LENGTH_SLACK_SECONDS = 0.05;

/** What the file picker offers. `video/webm` is there because browsers label audio-only WebM files that way. */
export const SOUND_ACCEPT = [...SOUND_TYPES, 'video/webm', '.webm', '.ogg', '.oga', '.opus', '.mp3'].join(',');

const BY_EXTENSION: Record<string, SoundType> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
};

/**
 * The type the server will accept for this file, or null if there is none.
 *
 * The label a browser puts on a file is a guess from its extension, and the
 * guesses differ: Chrome calls a `.webm` "video/webm" even with no picture in
 * it, some call an MP3 "audio/mp3", and some leave the type empty. This maps
 * those onto the three names the server knows. It does not look inside the
 * file; decoding it (see `soundLengthProblem`) is what proves it is audio.
 */
export function soundTypeFor(declared: string, fileName: string): SoundType | null {
  const base = declared.split(';')[0]?.trim().toLowerCase() ?? '';
  if (isSoundType(base)) return base;
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'audio/mp3') return 'audio/mpeg';
  if (base === 'audio/opus') return 'audio/ogg';
  if (base === '' || base === 'application/octet-stream') {
    const extension = fileName.toLowerCase().split('.').pop() ?? '';
    return BY_EXTENSION[extension] ?? null;
  }
  return null;
}

/** Why a file of this type cannot be a sound, or null if it can. */
export function soundTypeProblem(declared: string, fileName: string): string | null {
  return soundTypeFor(declared, fileName) ? null : 'A sound has to be a WebM, Ogg or MP3 file.';
}

/** Why a clip this long cannot be a sound, or null if it can. */
export function soundLengthProblem(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'That file has no sound in it.';
  if (seconds > LIMITS.soundSeconds + LENGTH_SLACK_SECONDS) {
    return `A sound can be at most ${LIMITS.soundSeconds} seconds long. That one is ${seconds.toFixed(1)}.`;
  }
  return null;
}

/** Why a file this big cannot be a sound, or null if it can. The server says the same. */
export function soundSizeProblem(bytes: number): string | null {
  if (bytes > LIMITS.soundBytes) return `A sound is limited to ${Math.round(LIMITS.soundBytes / 1024 / 1024)} MB.`;
  return null;
}

export class SoundFileError extends Error {}

/**
 * Check a file the way the server will, plus the length, and hand back a copy
 * labelled with the type the server expects. Throws `SoundFileError` with a
 * sentence for the person when it will not do.
 */
export async function prepareSound(file: File): Promise<File> {
  const type = soundTypeFor(file.type, file.name);
  if (!type) throw new SoundFileError(soundTypeProblem(file.type, file.name) ?? 'That file cannot be a sound.');
  const sizeProblem = soundSizeProblem(file.size);
  if (sizeProblem) throw new SoundFileError(sizeProblem);

  let seconds: number;
  try {
    seconds = (await audioContext().decodeAudioData(await file.arrayBuffer())).duration;
  } catch {
    throw new SoundFileError('This browser could not play that file, so it cannot be a sound.');
  }
  const lengthProblem = soundLengthProblem(seconds);
  if (lengthProblem) throw new SoundFileError(lengthProblem);

  return type === file.type ? file : new File([file], file.name, { type });
}

/* ------------------------------- for playing -------------------------------- */

/**
 * Decoded clips, by address. A clip is decoded the first time it is played
 * and kept, so a second click plays at once. The address changes on a rename,
 * which only costs one more fetch from the browser's cache.
 */
const decoded = new Map<string, Promise<AudioBuffer>>();

export function loadSound(url: string): Promise<AudioBuffer> {
  let pending = decoded.get(url);
  if (!pending) {
    pending = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('That sound could not be fetched.');
        return response.arrayBuffer();
      })
      .then((bytes) => audioContext().decodeAudioData(bytes));
    // A failure is not remembered, so the next click tries again.
    pending.catch(() => decoded.delete(url));
    decoded.set(url, pending);
  }
  return pending;
}

let preview: AudioBufferSourceNode | null = null;

/** Play a clip on this device only, for the settings page. Starting another stops the last. */
export async function previewSound(url: string): Promise<void> {
  const buffer = await loadSound(url);
  preview?.stop();
  const context = audioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (preview === source) preview = null;
  };
  preview = source;
  source.start();
}
