/**
 * Voice messages: a short clip recorded from the microphone and sent as an
 * ordinary attachment. In a channel it is a plain upload; in a DM it is sealed
 * like any other DM file before it leaves the machine, so nothing here knows
 * or cares where the clip is going.
 *
 * A clip is recognised by its name alone (`voice-<unix seconds>.webm`), not by
 * a new message field. The server stores it as any other file, which is why
 * this needed no change there.
 */

import { captureOptions, voicePrefs } from './voice-prefs';

/** Longest clip, in seconds. The recorder stops itself here and the clip is sent. */
export const MAX_VOICE_SECONDS = 120;
/** Shorter than this and it was a tap, not a recording. */
export const MIN_VOICE_MS = 500;
/** How many bars the player draws. */
export const VOICE_BARS = 48;

const MIME = 'audio/webm;codecs=opus';

/** `0:07`, `1:30`. Always whole seconds. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The message body sent with a clip. Only this, so search and the notification
 * preview say what the message is without anyone having to play it.
 */
export function voiceLabel(seconds: number): string {
  return `[voice ${clock(seconds)}]`;
}

/** True for a body that is nothing but the label, which the player stands in for. */
export function isVoiceLabel(text: string | null | undefined): boolean {
  return typeof text === 'string' && /^\[voice \d+:\d{2}\]$/.test(text.trim());
}

export function voiceFileName(now = Date.now()): string {
  return `voice-${Math.floor(now / 1000)}.webm`;
}

/** True for a file this feature made, which is drawn as a player instead of a file row. */
export function isVoiceFile(name: string): boolean {
  return name.startsWith('voice-') && name.endsWith('.webm');
}

/**
 * The loudness of `count` equal slices of the clip, as root mean square,
 * scaled so the loudest slice is 1. Silence stays all zeros rather than
 * dividing by nothing.
 */
export function peaks(samples: Float32Array, count = VOICE_BARS): number[] {
  const out = new Array<number>(Math.max(0, count)).fill(0);
  if (samples.length === 0 || count <= 0) return out;
  for (let slice = 0; slice < count; slice += 1) {
    const start = Math.floor((slice * samples.length) / count);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor(((slice + 1) * samples.length) / count)));
    let sum = 0;
    for (let i = start; i < end; i += 1) sum += samples[i]! * samples[i]!;
    out[slice] = end > start ? Math.sqrt(sum / (end - start)) : 0;
  }
  const loudest = Math.max(...out);
  return loudest > 0 ? out.map((value) => value / loudest) : out;
}

export interface Recording {
  /** Settles once the microphone is open, or rejects with a sentence for the person. */
  started: Promise<void>;
  /** Stop and hand back the clip. */
  stop(): Promise<Blob>;
  /** Stop and throw it away. */
  cancel(): void;
}

/**
 * Open the microphone chosen in voice settings and start recording. The
 * microphone is asked for here, on the press, and let go as soon as the clip
 * ends, so the browser's recording light is only on while someone is talking.
 */
export function record(): Recording {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let cancelled = false;
  const chunks: Blob[] = [];

  function release() {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  }

  const started = (async () => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(MIME)) {
      throw new Error('This browser cannot record voice messages.');
    }
    const prefs = voicePrefs.get();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: captureOptions(prefs) });
    } catch (problem) {
      const name = problem instanceof Error ? problem.name : '';
      if (name === 'NotAllowedError') {
        throw new Error('The microphone is blocked for this site. Allow it in the browser to record.');
      }
      // The microphone picked in settings may have been unplugged since. The
      // system default is a better answer than no clip at all.
      if (name !== 'OverconstrainedError' || !prefs.inputDeviceId) {
        throw new Error('The microphone could not be opened.');
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: captureOptions({ ...prefs, inputDeviceId: '' }) });
      } catch {
        throw new Error('The microphone could not be opened.');
      }
    }
    if (cancelled) {
      release();
      return;
    }
    recorder = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: 64_000 });
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.start();
  })();
  // Whoever calls stop() sees the failure; this only keeps an unwatched
  // rejection from being reported as unhandled.
  started.catch(() => undefined);

  return {
    started,
    async stop() {
      await started;
      const active = recorder;
      if (!active || cancelled) throw new Error('Nothing was recorded.');
      const done = new Promise<void>((resolve) => active.addEventListener('stop', () => resolve(), { once: true }));
      if (active.state !== 'inactive') active.stop();
      await done;
      release();
      return new Blob(chunks, { type: 'audio/webm' });
    },
    cancel() {
      cancelled = true;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      release();
    },
  };
}
