/**
 * Whether something makes a sound or pops up, and which sound.
 *
 * Two halves on purpose. `soundFor` and `popupFor` are pure decisions with no
 * browser in them, because "did that ping me" is the part worth being sure
 * about: a client that pings on everything gets muted within a day, and a
 * client that misses the one message addressed to you is the reason people go
 * back to Discord.
 *
 * Since 2026-10-01 every person picks, per moment, which sound and whether it
 * pops up, and per channel or server whether it follows those choices, wants
 * every message, wants mentions only, or is muted (Wes: "allow each user to
 * be very specific about what they want to hear and see"). None of it reaches
 * the server except the mute lists and the mention switch, which the phone
 * push needs (`lib/push.ts`).
 *
 * The sounds are made on the spot from sine tones, like the call chimes. Wes
 * may replace them with his own clips; the bank below is where they go.
 */

import { audioContext } from './voice-audio';

export type MessageSound = 'off' | 'unfocused' | 'always';

/** The things that can happen, each with its own sound and pop-up choice. */
export type Moment = 'mention' | 'dm' | 'message' | 'joined' | 'left' | 'live' | 'ended' | 'event' | 'game';

/** A sound in the bank, or none. */
export type SoundId = 'two-notes' | 'one-note' | 'three-notes' | 'step-up' | 'step-down' | 'bright' | 'low' | 'none';

export interface MomentPref {
  sound: SoundId;
  popup: boolean;
}

/**
 * What a channel or server does, set from its right-click menu. `default`
 * follows the moments; `watch` sounds and pops up for every message;
 * `mentions` only for things addressed to you; `mute` for nothing at all.
 */
export type PlaceMode = 'default' | 'watch' | 'mentions' | 'mute';

/** How much a pop-up says: who, who and where, or who, where and the first line. */
export type PopupDetail = 'who' | 'where' | 'what';

export interface NotifyPrefs {
  /** Someone said your name, or @everyone and the server allowed it. The phone reads this too. */
  mention: boolean;
  /** Everything else somebody says where you can see it. */
  message: MessageSound;
  /** Server ids that make no sound and no pop-up. The unread marks stay. */
  mutedServers: string[];
  /** Channel ids muted individually, whether or not their server is. */
  mutedChannels: string[];
  /** How loud the sounds are: 1 is as designed, 0 is silent, 2 is twice the level. */
  volume: number;
  /**
   * Phone notifications for every channel message, not just mentions and direct
   * messages. Off by default: a buzz per message in a busy server gets the whole
   * thing switched off (Wes, 2026-09-26).
   */
  pushEvery: boolean;
  /**
   * Phone notifications even while this person is at their computer. On by
   * default: plenty of computers stay open all day while their people are out
   * (Wes, 2026-09-27).
   */
  pushWhileAttending: boolean;
  /** Which sound, and whether it pops up, for each moment. */
  moments: Record<Moment, MomentPref>;
  /** Channel or server ids set to every message. */
  watched: string[];
  /** Channel or server ids set to mentions only. */
  mentionsOnly: string[];
  popupDetail: PopupDetail;
}

/**
 * The sounds there are. Each is a few sine notes; `peak` is the designed level
 * before the volume slider. Labels say what you will hear, not what it is for,
 * so any of them can go on any moment.
 */
export const SOUND_BANK: Record<Exclude<SoundId, 'none'>, { label: string; notes: number[]; peak: number }> = {
  'two-notes': { label: 'Two notes up', notes: [698.46, 1046.5], peak: 0.16 },
  'one-note': { label: 'One soft note', notes: [880], peak: 0.07 },
  'three-notes': { label: 'Three notes up', notes: [523.25, 659.25, 783.99], peak: 0.09 },
  'step-up': { label: 'Step up', notes: [523.25, 783.99], peak: 0.12 },
  'step-down': { label: 'Step down', notes: [659.25, 440], peak: 0.12 },
  bright: { label: 'Bright run', notes: [783.99, 987.77, 1174.66], peak: 0.1 },
  low: { label: 'Low pair', notes: [440, 329.63], peak: 0.1 },
};

export const SOUND_IDS = [...(Object.keys(SOUND_BANK) as Exclude<SoundId, 'none'>[]), 'none'] as const;

/**
 * What a new person gets. Mentions, DMs, events and someone going live pop up;
 * ordinary messages and comings and goings only make a sound, and the daily
 * games make none, since a server of ten would otherwise chirp all morning.
 */
export const DEFAULT_MOMENTS: Record<Moment, MomentPref> = {
  mention: { sound: 'two-notes', popup: true },
  dm: { sound: 'two-notes', popup: true },
  message: { sound: 'one-note', popup: false },
  joined: { sound: 'step-up', popup: false },
  left: { sound: 'step-down', popup: false },
  live: { sound: 'bright', popup: true },
  ended: { sound: 'low', popup: false },
  event: { sound: 'two-notes', popup: true },
  game: { sound: 'none', popup: false },
};

export const MOMENTS = Object.keys(DEFAULT_MOMENTS) as Moment[];

const DEFAULTS: NotifyPrefs = {
  mention: true,
  message: 'unfocused',
  mutedServers: [],
  mutedChannels: [],
  volume: 1,
  pushEvery: false,
  pushWhileAttending: true,
  moments: DEFAULT_MOMENTS,
  watched: [],
  mentionsOnly: [],
  popupDetail: 'where',
};

/** A stored volume is trusted only if it is a number on the slider's range. */
function clampVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : DEFAULTS.volume;
}

const isSound = (value: unknown): value is SoundId =>
  value === 'none' || (typeof value === 'string' && Object.prototype.hasOwnProperty.call(SOUND_BANK, value));

/** Every moment present and every value one that exists, whatever was saved. */
function cleanMoments(stored: unknown): Record<Moment, MomentPref> {
  const saved = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<Moment, Partial<MomentPref>>>;
  const moments = {} as Record<Moment, MomentPref>;
  for (const moment of MOMENTS) {
    const one = saved[moment] ?? {};
    moments[moment] = {
      sound: isSound(one.sound) ? one.sound : DEFAULT_MOMENTS[moment].sound,
      popup: typeof one.popup === 'boolean' ? one.popup : DEFAULT_MOMENTS[moment].popup,
    };
  }
  return moments;
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []);

const STORAGE_KEY = 'scryproof.notify.v1';

/** Exported so a prefs blob (or an old one missing the newer fields) can be checked directly, in tests and elsewhere. */
export function load(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<NotifyPrefs>;
    return {
      ...DEFAULTS,
      ...stored,
      volume: clampVolume(stored.volume),
      moments: cleanMoments(stored.moments),
      watched: ids(stored.watched),
      mentionsOnly: ids(stored.mentionsOnly),
      popupDetail: stored.popupDetail === 'who' || stored.popupDetail === 'what' ? stored.popupDetail : 'where',
    };
  } catch {
    return DEFAULTS;
  }
}

/** What one id (a channel or a server) is set to on its own. */
function ownMode(prefs: NotifyPrefs, id: string): PlaceMode {
  if (prefs.mutedChannels.includes(id) || prefs.mutedServers.includes(id)) return 'mute';
  if (prefs.watched.includes(id)) return 'watch';
  if (prefs.mentionsOnly.includes(id)) return 'mentions';
  return 'default';
}

/**
 * What a channel does: its own setting if it has one, otherwise its
 * server's. So one channel can be watched inside a server that is otherwise
 * mentions-only, the way Discord does it.
 */
export function placeMode(prefs: NotifyPrefs, serverId: string | null, channelId: string | null): PlaceMode {
  const own = channelId ? ownMode(prefs, channelId) : 'default';
  if (own !== 'default') return own;
  return serverId ? ownMode(prefs, serverId) : 'default';
}

/** The setting on this exact id, not inherited, for a menu's check mark. */
export function ownPlaceMode(prefs: NotifyPrefs, id: string): PlaceMode {
  return ownMode(prefs, id);
}

/** True when the server, or the channel itself, has been silenced. */
export function isMuted(prefs: NotifyPrefs, serverId: string | null, channelId: string): boolean {
  return placeMode(prefs, serverId, channelId) === 'mute';
}

let current = load();
const listeners = new Set<() => void>();

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

const without = (list: readonly string[], id: string): string[] => list.filter((entry) => entry !== id);

/** Prefs with one channel or server moved to a mode. Pure, for the test. */
export function withPlace(prefs: NotifyPrefs, id: string, scope: 'server' | 'channel', mode: PlaceMode): NotifyPrefs {
  const next: NotifyPrefs = {
    ...prefs,
    mutedServers: without(prefs.mutedServers, id),
    mutedChannels: without(prefs.mutedChannels, id),
    watched: without(prefs.watched, id),
    mentionsOnly: without(prefs.mentionsOnly, id),
  };
  if (mode === 'mute' && scope === 'server') next.mutedServers.push(id);
  if (mode === 'mute' && scope === 'channel') next.mutedChannels.push(id);
  if (mode === 'watch') next.watched.push(id);
  if (mode === 'mentions') next.mentionsOnly.push(id);
  return next;
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
  setPlace(id: string, scope: 'server' | 'channel', mode: PlaceMode): void {
    const next = withPlace(current, id, scope, mode);
    notifyPrefs.set({
      mutedServers: next.mutedServers,
      mutedChannels: next.mutedChannels,
      watched: next.watched,
      mentionsOnly: next.mentionsOnly,
    });
  },
  setMoment(moment: Moment, patch: Partial<MomentPref>): void {
    notifyPrefs.set({ moments: { ...current.moments, [moment]: { ...current.moments[moment], ...patch } } });
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
  /** A direct message: its own moment, and nothing to mute it by. */
  isDm?: boolean;
}

export function soundFor(input: SoundContext): 'mention' | 'message' | 'dm' | null {
  // Your own words, on this device or another one, are never news.
  if (!input.selfId || input.authorId === input.selfId) return null;

  // Blocking is stronger than muting: a muted place still counts and still
  // marks unread, while a blocked person reaches nothing at all.
  if (input.blocked) return null;

  if (input.isDm) {
    const looking = input.windowFocused && input.channelId === input.openChannelId;
    return !looking && input.prefs.moments.dm.sound !== 'none' ? 'dm' : null;
  }

  // Muting is about noise, not about hiding: a muted place still marks
  // unread and still counts toward the mention badge, it just never makes a
  // sound, even for a mention.
  const mode = placeMode(input.prefs, input.serverId, input.channelId);
  if (mode === 'mute') return null;

  const pingsMe = input.mentionsEveryone || input.mentions.includes(input.selfId);
  if (pingsMe) return input.prefs.mention ? 'mention' : null;

  // Being looked at is the same as being heard. A message in the channel on
  // screen, in a window someone is sitting in front of, has already arrived.
  const watching = input.windowFocused && input.channelId === input.openChannelId;
  if (watching) return null;

  if (mode === 'mentions') return null;
  // Watching a channel is asking for every message, whatever the default says.
  if (mode === 'watch') return 'message';

  if (input.prefs.message === 'always') return 'message';
  if (input.prefs.message === 'unfocused' && !input.windowFocused) return 'message';
  return null;
}

export interface PopupContext {
  moment: Moment;
  authorId: string;
  selfId: string | null;
  blocked: boolean;
  /** The channel or server's setting, from `placeMode`. A DM is always `default`. */
  mode: PlaceMode;
  /** The thing is already on screen in a window someone is sitting at. */
  onScreen: boolean;
  prefs: NotifyPrefs;
}

/**
 * Whether something pops up. Where it pops up (a card in the app, or the
 * computer's own notification while the app is in the background) is the
 * caller's business; this is only whether.
 */
export function popupFor(input: PopupContext): boolean {
  if (!input.selfId || input.authorId === input.selfId || input.blocked) return false;
  if (input.mode === 'mute' || input.onScreen) return false;
  const chosen = input.prefs.moments[input.moment].popup;
  if (input.moment === 'message') {
    if (input.mode === 'watch') return true;
    if (input.mode === 'mentions') return false;
    return chosen;
  }
  // Watching a voice room is asking to hear when people arrive and go live in it.
  if (input.mode === 'watch' && (input.moment === 'joined' || input.moment === 'live')) return true;
  if (input.mode === 'mentions' && input.moment !== 'mention' && input.moment !== 'event') return false;
  return chosen;
}

/**
 * Whether a moment that is not a message (someone joining, going live, an
 * event, a game) makes a sound in this place.
 */
export function momentSounds(prefs: NotifyPrefs, moment: Moment, mode: PlaceMode): boolean {
  if (mode === 'mute') return false;
  if (mode === 'mentions' && moment !== 'event') return false;
  if (mode === 'watch' && (moment === 'joined' || moment === 'live')) return true;
  return prefs.moments[moment].sound !== 'none';
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

/** One sound from the bank, now, at the volume set here. For "Hear it" and for `play`. */
export function playSound(id: SoundId): void {
  if (id === 'none') return;
  const sound = SOUND_BANK[id];
  try {
    tones(sound.notes, sound.peak);
  } catch {
    // No audio device, or a browser that has not been clicked in yet.
  }
}

export const notifySounds = {
  /** Two notes rising. It has to be findable across a room. */
  mention: () => playSound(current.moments.mention.sound),
  /** One short note, quiet enough to hear thirty of without minding. Both
      levels went up by half on 2026-09-22 (Wes: "a little quiet"). */
  message: () => playSound(current.moments.message.sound),
  /** A call coming in: three soft notes rising, played again every couple of
      seconds while it waits. Soft on purpose (Wes, 2026-09-23: "a soft call
      sound"), under the level of a mention. */
  ring: () => tones(SOUND_BANK['three-notes'].notes, SOUND_BANK['three-notes'].peak),
};

/** One ring of an incoming call. Not held back by the gap: it has its own rhythm. */
export function ring(): void {
  try {
    notifySounds.ring();
  } catch {
    // No audio device, or not clicked in yet; the pop-up still shows.
  }
}

/**
 * Two of these inside a few hundred milliseconds is one noise, not two. A room
 * that suddenly says twelve things should not sound like an alarm.
 */
let lastPlayed = 0;
const GAP_MS = 350;

/**
 * The sound chosen for a moment. A watched channel asks for a sound even when
 * the message sound is set to none, so `force` falls back to the default one.
 */
export function play(moment: Moment, options: { force?: boolean } = {}): void {
  const now = Date.now();
  if (now - lastPlayed < GAP_MS) return;
  let id = current.moments[moment].sound;
  if (id === 'none' && options.force) id = DEFAULT_MOMENTS[moment].sound;
  if (id === 'none') return;
  lastPlayed = now;
  playSound(id);
}
