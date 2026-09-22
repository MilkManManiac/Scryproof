/**
 * How this person likes their calls to sound. Kept in this browser only: none
 * of it is the server's business, and a microphone name is a small fingerprint
 * of the machine, so it never leaves.
 */

export type InputMode = 'open' | 'threshold' | 'push';

export type ShareHeight = 720 | 1080 | 1440 | 0;
export type ShareFps = 15 | 30 | 60;
export type CameraHeight = 720 | 1080;
export type CameraFps = 30 | 60;

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
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
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
  sounds: boolean;
}

const DEFAULTS: VoicePrefs = {
  inputDeviceId: '',
  outputDeviceId: '',
  cameraDeviceId: '',
  shareHeight: 1080,
  shareFps: 30,
  cameraHeight: 720,
  cameraFps: 30,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  inputMode: 'open',
  thresholdDb: -50,
  pushKey: 'Backquote',
  outputVolume: 1,
  volumes: {},
  sounds: true,
};

const STORAGE_KEY = 'scryproof.voice-prefs.v1';

function load(): VoicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<VoicePrefs>;
    return { ...DEFAULTS, ...stored, volumes: { ...(stored.volumes ?? {}) } };
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

/** What to ask the browser for when opening the microphone. */
export function captureOptions(prefs: VoicePrefs): MediaTrackConstraints {
  return {
    deviceId: prefs.inputDeviceId ? { exact: prefs.inputDeviceId } : undefined,
    noiseSuppression: prefs.noiseSuppression,
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
