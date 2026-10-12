/**
 * A shared window's own sound, from the desktop app on Windows. When a window
 * is shared with sound, the shell records that program and its children alone
 * (`desktop/app-sound`) and streams raw 48 kHz stereo 16-bit PCM here; this
 * turns it into a track the share publishes. The game in the background and
 * the call's own voices are never in it. Nothing here runs in a browser.
 */
import { onAppSound, stopAppSound } from './desktop';

const RATE = 48_000;
const CHANNELS = 2;
const FRAME_BYTES = 4;
/** A recording nobody took within this long belongs to no share. */
const FRESH_MS = 15_000;

interface Generator extends MediaStreamTrack {
  readonly writable: WritableStream<AudioData>;
}

interface Live {
  track: MediaStreamTrack;
  startedAt: number;
  taken: boolean;
  write(chunk: Uint8Array): void;
  close(): void;
}

let live: Live | null = null;
const waiting = new Set<() => void>();

function open(): Live | null {
  const Make = (globalThis as { MediaStreamTrackGenerator?: new (init: { kind: 'audio' }) => Generator })
    .MediaStreamTrackGenerator;
  if (!Make || typeof AudioData === 'undefined') return null;
  const track = new Make({ kind: 'audio' });
  track.contentHint = 'music';
  const writer = track.writable.getWriter();
  let timestamp = 0;
  // A pipe hands over bytes, not whole frames: the odd tail waits for the next chunk.
  let tail = new Uint8Array(0);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    void writer.close().catch(() => undefined);
    track.stop();
  };
  const write = (chunk: Uint8Array): void => {
    if (closed) return;
    if (track.readyState === 'ended') return drop(track);
    const bytes = tail.length ? new Uint8Array([...tail, ...chunk]) : chunk;
    const frames = Math.floor(bytes.length / FRAME_BYTES);
    tail = bytes.slice(frames * FRAME_BYTES);
    if (frames === 0) return;
    const data = new AudioData({
      format: 's16',
      sampleRate: RATE,
      numberOfChannels: CHANNELS,
      numberOfFrames: frames,
      timestamp,
      data: bytes.slice(0, frames * FRAME_BYTES),
    });
    timestamp += (frames * 1_000_000) / RATE;
    writer.write(data).catch(() => drop(track));
  };
  return { track, startedAt: Date.now(), taken: false, write, close };
}

const fresh = (): boolean => live !== null && !live.taken && Date.now() - live.startedAt < FRESH_MS;

const listening =
  onAppSound(
    () => {
      live?.close();
      live = open();
      if (!live) stopAppSound();
      for (const wake of [...waiting]) wake();
    },
    (chunk) => live?.write(chunk),
    () => {
      live?.close();
      live = null;
    },
  ) !== null;

/**
 * The sound the shell started recording for the share that just began, or
 * null. The shell's start message and the share itself arrive by different
 * routes, so this waits a moment for the first.
 */
export async function takeAppSound(waitMs = 1000): Promise<MediaStreamTrack | null> {
  if (!listening) return null;
  if (!fresh()) {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        waiting.delete(done);
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      waiting.add(done);
    });
  }
  if (!live || !fresh()) return null;
  live.taken = true;
  return live.track;
}

/** The share is over: stop the track and the recording behind it. */
export function drop(track: MediaStreamTrack | null | undefined): void {
  if (!live || live.track !== track) return;
  live.close();
  live = null;
  stopAppSound();
}
