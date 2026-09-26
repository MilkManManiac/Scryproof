/**
 * How this person likes their calls to sound. Kept in this browser only: none
 * of it is the server's business, and a microphone name is a small fingerprint
 * of the machine, so it never leaves.
 */

import { canRunModel } from './voice-audio';

export type InputMode = 'open' | 'threshold' | 'push';

export type ShareHeight = 720 | 1080 | 1440 | 0;
export type ShareFps = 15 | 30 | 60;
export type CameraHeight = 720 | 1080;
export type CameraFps = 30 | 60;
/**
 * How much picture this device asks for from everyone else.
 *   auto:   as much as the tile on screen can show, and no more
 *   medium: the middle layer, whatever the tile size
 *   low:    the smallest layer, for a connection that is struggling
 */
export type ReceiveQuality = 'auto' | 'medium' | 'low';
/** What the microphone is run through before it is sent. `none` sends the voice as it is. */
export type VoiceEffect = 'none' | 'robot' | 'chipmunk' | 'deep';
export type NoiseMode = 'strong' | 'standard' | 'off';

export function isNoiseMode(value: unknown): value is NoiseMode {
  return value === 'strong' || value === 'standard' || value === 'off';
}

export interface VoicePrefs {
  /** Empty means "whatever the system default is". */
  inputDeviceId: string;
  outputDeviceId: string;
  cameraDeviceId: string;
  /** How tall a shared screen is sent, in lines. 0 means as big as the screen is. */
  shareHeight: ShareHeight;
  shareFps: ShareFps;
  cameraHeight: CameraHeight;
  cameraFps: CameraFps;
  /**
   * strong:   the noise model on this device (`noise-model.ts`), which drops
   *           anything that is not a voice, sudden sounds included
   * standard: the browser's own, which learns steady sounds like a fan
   * off:      the microphone as it is
   */
  noiseMode: NoiseMode;
  echoCancellation: boolean;
  autoGain: boolean;
  /**
   * Keeps knocks, bumps and pops, yours and everyone's, down near talking
   * loudness (`loudness-guard.ts`). On unless someone turns it off.
   */
  loudnessGuard: boolean;
  /**
   * open:      the microphone is live whenever you are unmuted
   * threshold: live only while you are louder than `thresholdDb`
   * push:      live only while `pushKey` is held
   */
  inputMode: InputMode;
  /** Decibels relative to full scale. -100 is silence, 0 is clipping. */
  thresholdDb: number;
  /** A KeyboardEvent.code, so it means the same key on every layout. */
  pushKey: string;
  /** 0 to 2. Everyone you hear is multiplied by this. */
  outputVolume: number;
  /** Per person, 0 to 2, by user id. Missing means 1. */
  volumes: Record<string, number>;
  /**
   * 0 to 1. Every soundboard clip you hear, yours included, on top of the
   * person's own volume. 0 is off: nobody's soundboard reaches you.
   */
  soundboardVolume: number;
  sounds: boolean;
  /** A short tone when you mute, unmute, deafen or undeafen, or a moderator does it to you. */
  muteSounds: boolean;
  /** "You're muted" when the microphone hears you talking while you are muted. Measured here, never sent. */
  mutedTalkNote: boolean;
  /**
   * Muted and deafened as you last left them, Discord's way: set from the bar
   * with no call open, carried into the next call, and kept up to date by
   * whatever you last chose in one.
   */
  selfMute: boolean;
  selfDeaf: boolean;
  receiveQuality: ReceiveQuality;
  voiceEffect: VoiceEffect;
}

const DEFAULTS: VoicePrefs = {
  inputDeviceId: '',
  outputDeviceId: '',
  cameraDeviceId: '',
  shareHeight: 1080,
  shareFps: 30,
  cameraHeight: 720,
  cameraFps: 30,
  noiseMode: 'strong',
  echoCancellation: true,
  autoGain: true,
  loudnessGuard: true,
  inputMode: 'open',
  thresholdDb: -50,
  pushKey: 'Backquote',
  outputVolume: 1,
  volumes: {},
  soundboardVolume: 1,
  sounds: true,
  muteSounds: true,
  mutedTalkNote: true,
  selfMute: false,
  selfDeaf: false,
  receiveQuality: 'auto',
  voiceEffect: 'none',
};

const STORAGE_KEY = 'scryproof.voice-prefs.v1';

function load(): VoicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<VoicePrefs> & { noiseSuppression?: boolean };
    // Before there were three kinds, suppression was a switch. Someone who
    // turned it off meant off; everyone else gets the new default.
    const noiseMode = isNoiseMode(stored.noiseMode) ? stored.noiseMode : stored.noiseSuppression === false ? 'off' : DEFAULTS.noiseMode;
    return { ...DEFAULTS, ...stored, noiseMode, volumes: { ...(stored.volumes ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export const voicePrefs = {
  get: (): VoicePrefs => current,

  set(patch: Partial<VoicePrefs>): void {
    current = { ...current, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Private windows can refuse storage. The setting still holds for this tab.
    }
    for (const listener of listeners) listener();
  },

  setVolumeFor(userId: string, volume: number): void {
    const volumes = { ...current.volumes };
    if (volume === 1) delete volumes[userId];
    else volumes[userId] = volume;
    voicePrefs.set({ volumes });
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Whether the noise model does the suppressing. Where it cannot run, Strong
 * falls back to the browser's, so choosing it never means none at all.
 */
export function usesModel(prefs: VoicePrefs): boolean {
  return prefs.noiseMode === 'strong' && canRunModel;
}

/** What to ask the browser for when opening the microphone. */
export function captureOptions(prefs: VoicePrefs): MediaTrackConstraints {
  return {
    deviceId: prefs.inputDeviceId ? { exact: prefs.inputDeviceId } : undefined,
    // Not both: the browser's pass first leaves the model a voice with holes
    // already cut in it, and two suppressors in a row is what makes a voice
    // sound underwater.
    noiseSuppression: prefs.noiseMode === 'standard' || (prefs.noiseMode === 'strong' && !canRunModel),
    echoCancellation: prefs.echoCancellation,
    autoGainControl: prefs.autoGain,
  };
}

/** Megabits a second for a camera of this height at 30 frames. Faces move less than games. */
const CAMERA_MBPS: Record<CameraHeight, number> = { 720: 1.7, 1080: 3.5 };
const CAMERA_FPS_FACTOR: Record<CameraFps, number> = { 30: 1, 60: 1.5 };

/**
 * What to ask the browser for when opening the camera. 720p at 30 is the
 * default and plenty for a face; the choice is there for the person whose
 * camera is the show (Wes, 2026-09-21: let people stream at high quality).
 */
export function cameraOptions(prefs: Pick<VoicePrefs, 'cameraDeviceId' | 'cameraHeight' | 'cameraFps'>): {
  deviceId?: ConstrainDOMString;
  resolution: { width: number; height: number; frameRate: number };
} {
  const height = prefs.cameraHeight in CAMERA_MBPS ? prefs.cameraHeight : 720;
  const fps = prefs.cameraFps in CAMERA_FPS_FACTOR ? prefs.cameraFps : 30;
  return {
    deviceId: prefs.cameraDeviceId ? { exact: prefs.cameraDeviceId } : undefined,
    resolution: { width: Math.round((height * 16) / 9), height, frameRate: fps },
  };
}

/** How much to spend sending the camera, to match what was asked for. */
export function cameraEncoding(prefs: Pick<VoicePrefs, 'cameraHeight' | 'cameraFps'>): { maxBitrate: number; maxFramerate: number } {
  const height = prefs.cameraHeight in CAMERA_MBPS ? prefs.cameraHeight : 720;
  const fps = prefs.cameraFps in CAMERA_FPS_FACTOR ? prefs.cameraFps : 30;
  return { maxBitrate: Math.round(CAMERA_MBPS[height] * CAMERA_FPS_FACTOR[fps] * 1_000_000), maxFramerate: fps };
}

export function cameraCostLabel(prefs: Pick<VoicePrefs, 'cameraHeight' | 'cameraFps'>): string {
  const mbps = cameraEncoding(prefs).maxBitrate / 1_000_000;
  return `Up to about ${mbps % 1 === 0 ? mbps : mbps.toFixed(1)} megabits a second of your upload.`;
}

/** Megabits a second for a moving picture of this height at 30 frames. Games, not slides. */
const SHARE_MBPS: Record<ShareHeight, number> = { 720: 2.5, 1080: 5, 1440: 8, 0: 12 };
const FPS_FACTOR: Record<ShareFps, number> = { 15: 0.6, 30: 1, 60: 1.6 };

/**
 * What to ask for when sharing a screen, and how much to spend sending it.
 *
 * The person sharing picks (Wes, 2026-09-21): it is their upload and their
 * friends watching. There is no cap from the server, which could not enforce
 * one on encrypted video anyway. If bandwidth ever becomes a problem, this
 * table is where a ceiling goes.
 */
export function screenShareOptions(prefs: Pick<VoicePrefs, 'shareHeight' | 'shareFps'>): {
  resolution: { width: number; height: number; frameRate: number } | undefined;
  encoding: { maxBitrate: number; maxFramerate: number };
} {
  const height = prefs.shareHeight in SHARE_MBPS ? prefs.shareHeight : 1080;
  const fps = prefs.shareFps in FPS_FACTOR ? prefs.shareFps : 30;
  return {
    // 16:9 is a ceiling, not a shape: the browser keeps the screen's own proportions inside it.
    resolution: height === 0 ? undefined : { width: Math.round((height * 16) / 9), height, frameRate: fps },
    encoding: { maxBitrate: Math.round(SHARE_MBPS[height] * FPS_FACTOR[fps] * 1_000_000), maxFramerate: fps },
  };
}

/** Roughly what a choice costs the person sharing, for the settings screen. */
export function shareCostLabel(prefs: Pick<VoicePrefs, 'shareHeight' | 'shareFps'>): string {
  const mbps = screenShareOptions(prefs).encoding.maxBitrate / 1_000_000;
  return `Up to about ${mbps % 1 === 0 ? mbps : mbps.toFixed(1)} megabits a second of your upload.`;
}

/** A key code as a person would say it. */
export function keyLabel(code: string): string {
  if (code === 'Backquote') return '` (the key under Esc)';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}
