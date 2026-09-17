/**
 * How this person likes their calls to sound. Kept in this browser only: none
 * of it is the server's business, and a microphone name is a small fingerprint
 * of the machine, so it never leaves.
 */

export type InputMode = 'open' | 'threshold' | 'push';

export interface VoicePrefs {
  /** Empty means "whatever the system default is". */
  inputDeviceId: string;
  outputDeviceId: string;
  cameraDeviceId: string;
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

const STORAGE_KEY = 'gooffline.voice-prefs.v1';

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

/** What to ask the browser for when opening the camera. 720p is plenty for a face. */
export function cameraOptions(prefs: VoicePrefs): { deviceId?: ConstrainDOMString; resolution: { width: number; height: number; frameRate: number } } {
  return {
    deviceId: prefs.cameraDeviceId ? { exact: prefs.cameraDeviceId } : undefined,
    resolution: { width: 1280, height: 720, frameRate: 30 },
  };
}

/** A key code as a person would say it. */
export function keyLabel(code: string): string {
  if (code === 'Backquote') return '` (the key under Esc)';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/([a-z])([A-Z])/g, '$1 $2');
}
