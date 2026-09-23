/**
 * The sound side of a call, after decryption and before the speakers, and
 * between the microphone and encryption.
 *
 * Nothing here touches keys. By the time audio reaches this file LiveKit has
 * already decrypted it, and what leaves the gate is encrypted afterwards.
 */

import { effectChain, type EffectChain } from './voice-effects';
import type { VoiceEffect } from './voice-prefs';

/* --------------------------------- levels ---------------------------------- */

/** Loudness of whatever is flowing through an analyser right now, in dBFS. */
function readDb(analyser: AnalyserNode, scratch: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (const sample of scratch) sum += sample * sample;
  const rms = Math.sqrt(sum / scratch.length);
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
}

let sharedContext: AudioContext | null = null;

/** One context for the whole app. Browsers cap how many a page may open. */
export function audioContext(): AudioContext {
  if (!sharedContext || sharedContext.state === 'closed') sharedContext = new AudioContext();
  if (sharedContext.state === 'suspended') void sharedContext.resume().catch(() => undefined);
  return sharedContext;
}

/* ------------------------------- the output -------------------------------- */

interface Voice {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  /**
   * Chrome only pulls a remote WebRTC track through Web Audio while some media
   * element is also playing it. This one is silent and exists for that reason.
   */
  pump: HTMLAudioElement;
  /** Running total of sound that has reached the mix from this person, after their volume. */
  energy: number;
  /** The clock time until which this person counts as talking. */
  loudUntil: number;
}

/**
 * Below this, a 20ms slice is a pause, not a word. -45 dBFS: speech at any
 * normal distance is well above it, and the far end's own gate and noise
 * suppression keep their room tone below it.
 */
const TALKING = Math.pow(10, -45 / 10);
/** How long one loud slice keeps someone "talking", so the ring does not flicker between syllables. */
const HOLD_MS = 300;

/**
 * Everyone you can hear, each with their own volume, mixed into one output.
 * Volumes go past 100%, which a plain <audio> element cannot do; that is why
 * this is a graph and not a row of elements.
 */
export class OutputMix {
  private readonly context = audioContext();
  private readonly master = this.context.createGain();
  private readonly voices = new Map<string, Voice>();
  private readonly scratch = new Float32Array(1024);
  private deafened = false;
  private volume = 1;
  private readonly sampler: ReturnType<typeof setInterval>;

  constructor() {
    this.master.connect(this.context.destination);
    // A running total rather than a level, because a level is a single instant
    // and speech (or a test beep) is mostly gaps. The total only ever climbs
    // while decrypted sound is really arriving.
    this.sampler = setInterval(() => {
      const now = Date.now();
      for (const voice of this.voices.values()) {
        voice.analyser.getFloatTimeDomainData(this.scratch);
        let sum = 0;
        for (const sample of this.scratch) sum += sample * sample;
        const meanSquare = sum / this.scratch.length;
        voice.energy += meanSquare;
        if (meanSquare > TALKING) voice.loudUntil = now + HOLD_MS;
      }
    }, 20);
  }

  add(userId: string, track: MediaStreamTrack, volume: number): void {
    this.remove(userId);
    const stream = new MediaStream([track]);

    const pump = new Audio();
    pump.srcObject = stream;
    pump.muted = true;
    void pump.play().catch(() => undefined);

    const source = this.context.createMediaStreamSource(stream);
    const gain = this.context.createGain();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    gain.gain.value = volume;
    source.connect(gain).connect(analyser).connect(this.master);
    this.voices.set(userId, { source, gain, analyser, pump, energy: 0, loudUntil: 0 });
  }

  remove(userId: string): void {
    const voice = this.voices.get(userId);
    if (!voice) return;
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.analyser.disconnect();
    voice.pump.srcObject = null;
    this.voices.delete(userId);
  }

  setVolumeFor(userId: string, volume: number): void {
    const voice = this.voices.get(userId);
    if (voice) voice.gain.gain.value = volume;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    this.master.gain.value = this.deafened ? 0 : volume;
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    this.master.gain.value = deafened ? 0 : this.volume;
  }

  /** Send the mix to a chosen speaker. Not every browser can; those keep the default. */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    const context = this.context as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (!context.setSinkId) return false;
    try {
      await context.setSinkId(deviceId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Who is talking right now, by mix key, measured on the decrypted sound
   * itself. This does not depend on the server noticing: with end-to-end
   * encryption the server has only the packet headers to go by, and here it
   * has proved unreliable, so the ring is drawn from what the ear gets.
   */
  talking(): string[] {
    const now = Date.now();
    const out: string[] = [];
    for (const [key, voice] of this.voices) if (voice.loudUntil > now) out.push(key);
    return out;
  }

  /** Sound that has reached the mix from one person so far. Flat means silence or undecryptable. */
  energyOf(userId: string): number {
    return this.voices.get(userId)?.energy ?? 0;
  }

  close(): void {
    clearInterval(this.sampler);
    for (const userId of [...this.voices.keys()]) this.remove(userId);
    this.master.disconnect();
  }
}

/* -------------------------------- the gate --------------------------------- */

/**
 * Decides, many times a second, whether the microphone is live.
 *
 * The gate works by switching the outgoing track's `enabled` flag, which makes
 * the browser send silence. That is deliberately not LiveKit's mute: mute is a
 * message to everyone ("Wes muted"), and a gate that flickers it would make the
 * mute icon flash on every pause for breath.
 *
 * The level is measured on a clone of the track, because a disabled track
 * reads as silence and the gate would never hear you start talking again.
 * With a voice changer on, the track sent is the changer's output and the
 * one listened to is the raw microphone: the threshold is about your voice,
 * not the robot's, and a pitch shifter's small delay would clip the start of
 * every word if the gate waited for it.
 */
export class MicGate {
  private readonly probe: MediaStreamTrack;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly scratch = new Float32Array(1024);
  private readonly timer: ReturnType<typeof setInterval>;
  private openUntil = 0;
  private held = false;

  level = -100;
  open = true;

  constructor(
    private readonly track: MediaStreamTrack,
    private readonly rule: () => { mode: 'open' | 'threshold' | 'push'; thresholdDb: number },
    private readonly onChange: () => void,
    listenTo: MediaStreamTrack = track,
  ) {
    const context = audioContext();
    this.probe = listenTo.clone();
    this.probe.enabled = true;
    this.source = context.createMediaStreamSource(new MediaStream([this.probe]));
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source.connect(this.analyser);
    this.timer = setInterval(() => this.tick(), 40);
  }

  /** Push-to-talk key went down or up. */
  hold(down: boolean): void {
    this.held = down;
    this.tick();
  }

  private tick(): void {
    this.level = readDb(this.analyser, this.scratch);
    const { mode, thresholdDb } = this.rule();
    const now = performance.now();

    let open: boolean;
    if (mode === 'open') open = true;
    else if (mode === 'push') open = this.held;
    else {
      // Stay open a little after the level drops, or word endings get clipped.
      if (this.level >= thresholdDb) this.openUntil = now + 350;
      open = now < this.openUntil;
    }

    if (open !== this.open) {
      this.open = open;
      this.track.enabled = open;
      this.onChange();
    }
  }

  close(): void {
    clearInterval(this.timer);
    this.source.disconnect();
    this.probe.stop();
    this.track.enabled = true;
  }
}

/* ------------------------- a meter for the settings ------------------------- */

/**
 * Opens the microphone just to show its level, for choosing a device and a
 * threshold outside a call. Nothing is sent anywhere.
 *
 * With `preview` set to a voice changer, the changed voice is also played
 * back to this device's own speakers, so people hear it before the table
 * does. The bar keeps measuring the raw microphone, because that is what the
 * gate listens to in a call and the threshold line has to mean the same thing.
 */
export async function openMeter(
  constraints: MediaTrackConstraints,
  onLevel: (db: number) => void,
  preview: VoiceEffect = 'none',
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  const context = audioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const scratch = new Float32Array(1024);
  const timer = setInterval(() => onLevel(readDb(analyser, scratch)), 50);

  let chain: EffectChain | null = null;
  const stop = () => {
    clearInterval(timer);
    chain?.close();
    source.disconnect();
    for (const track of stream.getTracks()) track.stop();
  };
  if (preview !== 'none') {
    try {
      chain = await effectChain(context, source, preview);
      chain.output.connect(context.destination);
    } catch (problem) {
      stop();
      throw problem;
    }
  }
  return stop;
}

/* --------------------------------- sounds ---------------------------------- */

/**
 * Join and leave sounds, made on the spot from two sine tones. No audio files:
 * nothing to download, nothing to license, and they cannot be mistaken for
 * anybody else's app.
 */
function chime(notes: number[]): void {
  const context = audioContext();
  const start = context.currentTime + 0.01;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const at = start + index * 0.09;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(0.12, at + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  });
}

export const sounds = {
  joined: () => chime([523.25, 783.99]),
  left: () => chime([659.25, 440]),
  muted: () => chime([392]),
  unmuted: () => chime([587.33]),
};
