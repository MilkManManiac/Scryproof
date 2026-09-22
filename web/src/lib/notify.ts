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
  /** Server ids that make no sound and no pop-up. The unread marks stay. */
  mutedServers: string[];
  /** Channel ids muted individually, whether or not their server is. */
  mutedChannels: string[];
  /** How loud both sounds are: 1 is as designed, 0 is silent, 2 is twice the level. */
  volume: number;
}

const DEFAULTS: NotifyPrefs = { mention: true, message: 'unfocused', mutedServers: [], mutedChannels: [], volume: 1 };

/** A stored volume is trusted only if it is a number on the slider's range. */
function clampVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : DEFAULTS.volume;
}
const STORAGE_KEY = 'scryproof.notify.v1';

/** Exported so a prefs blob (or an old one missing the newer fields) can be checked directly, in tests and elsewhere. */
export function load(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<NotifyPrefs>;
    return { ...DEFAULTS, ...stored, volume: clampVolume(stored.volume) };
  } catch {
    return DEFAULTS;
  }
}

/** True when the server, or the channel itself, has been silenced. */
export function isMuted(prefs: NotifyPrefs, serverId: string | null, channelId: string): boolean {
  return (serverId !== null && prefs.mutedServers.includes(serverId)) || prefs.mutedChannels.includes(channelId);
}

let current = load();
const listeners = new Set<() => void>();

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

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
  toggleServer(serverId: string): void {
    notifyPrefs.set({ mutedServers: toggle(current.mutedServers, serverId) });
  },
  toggleChannel(channelId: string): void {
    notifyPrefs.set({ mutedChannels: toggle(current.mutedChannels, channelId) });
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
  /** The server this channel belongs to. Null for a direct message. */
  serverId: string | null;
  openChannelId: string | null;
  windowFocused: boolean;
  /** The author is blocked. Nothing they send makes a sound, mention or not. */
  blocked: boolean;
  prefs: NotifyPrefs;
}

export function soundFor(input: SoundContext): 'mention' | 'message' | null {
  // Your own words, on this device or another one, are never news.
  if (!input.selfId || input.authorId === input.selfId) return null;

  // Blocking is stronger than muting: a muted place still counts and still
  // marks unread, while a blocked person reaches nothing at all.
  if (input.blocked) return null;

  // Muting is about noise, not about hiding: a muted place still marks
  // unread and still counts toward the mention badge, it just never makes a
  // sound, even for a mention.
  if (isMuted(input.prefs, input.serverId, input.channelId)) return null;

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
  // The slider scales the designed level; at 2 the sine still cannot clip.
  peak *= current.volume;
  if (peak <= 0) return;
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
  mention: () => tones([698.46, 1046.5], 0.16),
  /** One short note, quiet enough to hear thirty of without minding. Both
      levels went up by half on 2026-09-22 (Wes: "a little quiet"). */
  message: () => tones([880], 0.07),
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
