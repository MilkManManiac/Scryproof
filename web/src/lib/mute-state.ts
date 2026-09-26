/**
 * Whether people can tell they are muted or deafened (Wes, 2026-09-25: "Need
 * to make sure people are aware of when they are muted / deafened").
 *
 * Three pieces, all pure so they can be tested without a call: what the red
 * label in the call says, which little sound plays when that changes, and
 * when to say "You're muted" to someone who is talking into a muted mic.
 */

import type { VoiceState } from '@scryproof/shared';

type MuteFlags = Pick<VoiceState, 'selfMute' | 'selfDeaf' | 'serverMute' | 'serverDeaf'>;

export interface MuteLabel {
  kind: 'muted' | 'deafened';
  text: string;
  /** What clicking the label does, or null when a moderator did it and only they can undo it. */
  undo: { selfMute: false } | { selfDeaf: false } | null;
  /** The longer line for a tooltip or a screen reader. */
  detail: string;
}

/** Deafened wins over muted, since it includes it; a moderator's wins over your own. */
export function muteLabel(state: MuteFlags | undefined): MuteLabel | null {
  if (!state) return null;
  if (state.serverDeaf) {
    return {
      kind: 'deafened',
      text: 'Deafened by a moderator',
      undo: null,
      detail: 'A moderator deafened you. You cannot hear the call and nobody can hear you until they undo it.',
    };
  }
  if (state.selfDeaf) {
    return {
      kind: 'deafened',
      text: 'Deafened',
      undo: { selfDeaf: false },
      detail: 'You cannot hear the call and nobody can hear you. Click to undeafen.',
    };
  }
  if (state.serverMute) {
    return {
      kind: 'muted',
      text: 'Muted by a moderator',
      undo: null,
      detail: 'A moderator muted you. Nobody can hear you until they undo it.',
    };
  }
  if (state.selfMute) {
    return { kind: 'muted', text: 'Muted', undo: { selfMute: false }, detail: 'Nobody can hear you. Click to unmute.' };
  }
  return null;
}

export type MuteCue = 'muted' | 'unmuted' | 'deafened' | 'undeafened';

/**
 * The sound for going from one state to the next, or null. Deafening says
 * "deafened" even though it mutes too; undeafening into a mute that is still
 * on says "undeafened", not "unmuted", because you are not.
 */
export function muteCue(before: MuteFlags | undefined, after: MuteFlags): MuteCue | null {
  if (!before) return null;
  const deafBefore = before.selfDeaf || before.serverDeaf;
  const deafAfter = after.selfDeaf || after.serverDeaf;
  if (deafBefore !== deafAfter) return deafAfter ? 'deafened' : 'undeafened';
  if (deafAfter) return null;
  const muteBefore = before.selfMute || before.serverMute;
  const muteAfter = after.selfMute || after.serverMute;
  if (muteBefore !== muteAfter) return muteAfter ? 'muted' : 'unmuted';
  return null;
}

/** How often the level is read, in milliseconds. */
export const WATCH_EVERY_MS = 100;
/** How far back to look for talking. */
const WINDOW_MS = 1500;
/** Of that, how much has to count as talking: about a second of speech. */
const LOUD_MS = 800;
/** A loud reading counts for this long after, so the gaps between syllables do not reset it. */
const HOLD_MS = 300;
/** Just after muting, the end of your own sentence is not "talking while muted". */
const SETTLE_MS = 1500;
/** Said once, then not again for this long. */
export const COOLDOWN_MS = 20_000;

/**
 * Notices someone talking into a muted microphone. Fed a yes or no a few
 * times a second (is the mic louder than speech right now), it answers true
 * once, when there has been about a second of it, and then keeps quiet for
 * twenty seconds.
 */
export class MutedTalkWatch {
  private loud: number[] = [];
  private since: number | null = null;
  private quietUntil = 0;
  private loudUntil = 0;

  /** `watching` is false whenever the note would not apply: unmuted, deafened, a moderator's mute, no call. */
  feed(now: number, loud: boolean, watching: boolean): boolean {
    if (!watching) {
      this.loud = [];
      this.since = null;
      this.loudUntil = 0;
      return false;
    }
    if (this.since === null) this.since = now;
    if (now - this.since < SETTLE_MS) return false;
    if (loud) this.loudUntil = now + HOLD_MS;
    if (now < this.loudUntil) this.loud.push(now);
    this.loud = this.loud.filter((at) => now - at < WINDOW_MS);
    if (now < this.quietUntil) return false;
    if (this.loud.length * WATCH_EVERY_MS < LOUD_MS) return false;
    this.loud = [];
    this.quietUntil = now + COOLDOWN_MS;
    return true;
  }
}

/** Speech, not a fan: the person's own threshold, but never below -42 dBFS. */
export function talkingLevel(thresholdDb: number): number {
  return Math.max(thresholdDb, -42);
}

/* ----------------------- the note, for whoever shows it ----------------------- */

/** How long the note stays up. */
export const NOTE_MS = 5000;

let noteUntil = 0;
let noteTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function tell(): void {
  for (const listener of listeners) listener();
}

export const mutedTalkNote = {
  visible: (): boolean => Date.now() < noteUntil,
  show(): void {
    noteUntil = Date.now() + NOTE_MS;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(tell, NOTE_MS + 20);
    tell();
  },
  hide(): void {
    noteUntil = 0;
    tell();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
