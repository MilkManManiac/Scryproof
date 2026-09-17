/**
 * Whether a message makes a sound, and what that sound is.
 *
 * Two halves on purpose. `soundFor` is a pure decision with no browser in it,
 * because "did that ping me" is the part worth being sure about: a client that
 * pings on everything gets muted within a day, and a client that misses the
 * one message addressed to you is the reason people go back to Discord.
 *
 * The sounds themselves are made on the spot from sine tones, like the call
 * chimes. No audio files: nothing to download, nothing to license, and nothing
 * that could be mistaken for another app.
 */

import { audioContext } from './voice-audio';

export type MessageSound = 'off' | 'unfocused' | 'always';

export interface NotifyPrefs {
  /** Someone said your name, or @everyone and the server allowed it. */
  mention: boolean;
  /** Everything else somebody says where you can see it. */
  message: MessageSound;
}

const DEFAULTS: NotifyPrefs = { mention: true, message: 'unfocused' };
const STORAGE_KEY = 'gooffline.notify.v1';

function load(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export const notifyPrefs = {
  get: (): NotifyPrefs => current,
  set(patch: Partial<NotifyPrefs>): void {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Private windows can refuse storage. The setting still holds for this tab.
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/* -------------------------------- the rules -------------------------------- */

export interface SoundContext {
  authorId: string;
  /** Who this message pings, as the server worked it out. Never what the body says. */
  mentions: readonly string[];
  mentionsEveryone: boolean;
  selfId: string | null;
  /** The channel this arrived in, and the one being looked at. */
  channelId: string;
  openChannelId: string | null;
  windowFocused: boolean;
  prefs: NotifyPrefs;
}

export function soundFor(input: SoundContext): 'mention' | 'message' | null {
  // Your own words, on this device or another one, are never news.
  if (!input.selfId || input.authorId === input.selfId) return null;

  const pingsMe = input.mentionsEveryone || input.mentions.includes(input.selfId);
  if (pingsMe) return input.prefs.mention ? 'mention' : null;

  // Being looked at is the same as being heard. A message in the channel on
  // screen, in a window someone is sitting in front of, has already arrived.
  const watching = input.windowFocused && input.channelId === input.openChannelId;
  if (watching) return null;

  if (input.prefs.message === 'always') return 'message';
  if (input.prefs.message === 'unfocused' && !input.windowFocused) return 'message';
  return null;
}

/* ------------------------------- the sounds -------------------------------- */

function tones(notes: readonly number[], peak: number): void {
  const context = audioContext();
  const start = context.currentTime + 0.01;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const at = start + index * 0.085;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.23);
  });
}

export const notifySounds = {
  /** Two notes rising. It has to be findable across a room. */
  mention: () => tones([698.46, 1046.5], 0.1),
  /** One short note, quiet enough to hear thirty of without minding. */
  message: () => tones([880], 0.045),
};

/**
 * Two of these inside a few hundred milliseconds is one noise, not two. A room
 * that suddenly says twelve things should not sound like an alarm.
 */
let lastPlayed = 0;
const GAP_MS = 350;

export function play(sound: 'mention' | 'message'): void {
  const now = Date.now();
  if (now - lastPlayed < GAP_MS) return;
  lastPlayed = now;
  try {
    notifySounds[sound]();
  } catch {
    // No audio device, or a browser that has not been clicked in yet. The
    // badge already said the same thing.
  }
}
