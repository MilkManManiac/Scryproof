/**
 * Voice changers: Robot, Chipmunk and Deep.
 *
 * The microphone runs through one of these before LiveKit sees it, so the
 * changed voice is what gets encrypted and sent. Nothing here touches keys,
 * and nobody else in the call can hear the voice as it was.
 *
 * Robot is a ring modulator: the voice multiplied by a slow sine, which is
 * what every film robot since the 1960s has been. Chipmunk and Deep move the
 * pitch by a fixed factor with two overlapping grains read at a different
 * speed from the one they were written at. That work happens sample by sample
 * in an AudioWorklet, whose source is `web/public/worklets/pitch-shift.js`:
 * plain JavaScript served as it is, because a worklet is loaded by URL and
 * the page's policy only runs scripts from this server. `shiftPitch` below is
 * the same arithmetic, kept here so it can be tested without a browser, and
 * the tests run both.
 */

import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';

import type { VoiceEffect } from './voice-prefs';

export const VOICE_EFFECTS: { id: VoiceEffect; label: string; note: string }[] = [
  { id: 'none', label: 'Off', note: 'Your own voice.' },
  { id: 'robot', label: 'Robot', note: 'A metal voice with a buzz in it.' },
  { id: 'chipmunk', label: 'Chipmunk', note: 'Half as high again.' },
  { id: 'deep', label: 'Deep', note: 'A good deal lower.' },
];

export function isVoiceEffect(value: unknown): value is VoiceEffect {
  return VOICE_EFFECTS.some((effect) => effect.id === value);
}

/** How far each pitch effect moves the voice. 1.5 is a fifth up; 0.7 is about a sixth down. */
export const PITCH_FACTORS = { chipmunk: 1.5, deep: 0.7 } as const;

/**
 * How long one grain lasts. Long enough that a grain holds a couple of cycles
 * of the lowest voices, short enough to keep the added delay under 60 ms: a
 * grain is read on average half its length behind the microphone, and never
 * more than its full length.
 */
export const GRAIN_SECONDS = 0.05;

/** How fast the robot's carrier runs. Between 30 and 50 Hz it buzzes; much higher and it turns into a bell. */
const ROBOT_HZ = 40;

/* --------------------------- the grain scheduler --------------------------- */

/** Everything the pitch shifter carries from one block of samples to the next. */
export interface GrainState {
  /** The last stretch of input, written in a circle. */
  buffer: Float32Array;
  /** Where the next input sample goes. */
  write: number;
  /** How far through its grain the first of the two readers is, from 0 to 1. */
  phase: number;
  /** One grain, in samples. */
  grain: number;
}

export function createGrainState(sampleRate: number, grainSeconds = GRAIN_SECONDS): GrainState {
  const grain = Math.max(2, Math.round(grainSeconds * sampleRate));
  return { buffer: new Float32Array(grain * 2), write: 0, phase: 0, grain };
}

/**
 * Moves the pitch of `input` by `factor`, into `output`, carrying on from
 * wherever `state` left off.
 *
 * Two readers trail the writer through the circle of recent input. Each is a
 * delay between zero and one grain, and each moves through the buffer at
 * `factor` samples per sample written, so what it reads comes out `factor`
 * times higher. A reader that runs out of room jumps back to the other end of
 * its grain; that jump is a click, so each reader is faded by a Hann window
 * that is silent at exactly the moment it jumps. The two are half a grain
 * apart, and two Hann windows half a length apart always add up to one, so
 * the loudness stays level while each takes its turn.
 */
export function shiftPitch(state: GrainState, input: Float32Array, output: Float32Array, factor: number): void {
  const { buffer, grain } = state;
  const size = buffer.length;
  const step = (1 - factor) / grain;

  for (let n = 0; n < output.length; n += 1) {
    buffer[state.write] = input[n] ?? 0;

    let sum = 0;
    for (const offset of [0, 0.5]) {
      let phase = state.phase + offset;
      if (phase >= 1) phase -= 1;
      let at = state.write - phase * grain;
      if (at < 0) at += size;
      const before = Math.floor(at);
      const fraction = at - before;
      const a = buffer[before] ?? 0;
      const b = buffer[(before + 1) % size] ?? 0;
      const window = Math.sin(Math.PI * phase);
      sum += window * window * (a + (b - a) * fraction);
    }
    output[n] = sum;

    state.phase += step;
    state.phase -= Math.floor(state.phase);
    state.write = (state.write + 1) % size;
  }
}

/* ------------------------------- the chains -------------------------------- */

/** The pitch worklet is loaded once per audio context, and a failed load is tried again next time. */
const worklets = new WeakMap<BaseAudioContext, Promise<void>>();

function loadPitchWorklet(context: BaseAudioContext): Promise<void> {
  let loading = worklets.get(context);
  if (!loading) {
    loading = context.audioWorklet.addModule('/worklets/pitch-shift.js');
    loading.catch(() => worklets.delete(context));
    worklets.set(context, loading);
  }
  return loading;
}

export interface EffectChain {
  /** Where the changed voice comes out. */
  output: AudioNode;
  /** Unhooks the chain at both ends and stops anything in it that runs on its own. */
  close(): void;
}

/**
 * Builds `effect` onto `input`. `none` is a plain pass-through, so a caller
 * can treat every choice the same.
 */
export async function effectChain(context: BaseAudioContext, input: AudioNode, effect: VoiceEffect): Promise<EffectChain> {
  if (effect === 'robot') {
    // A gain whose gain is driven by an oscillator multiplies the voice by
    // that oscillator: a ring modulator. The band-pass takes off the boom and
    // the hiss so the buzz sits in the middle, like a small speaker. The
    // modulator halves the average loudness, so some of it is given back.
    const carrier = context.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = ROBOT_HZ;
    const ring = context.createGain();
    ring.gain.value = 0;
    carrier.connect(ring.gain);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 0.5;
    const level = context.createGain();
    level.gain.value = 1.6;
    input.connect(ring).connect(band).connect(level);
    carrier.start();
    return {
      output: level,
      close: () => {
        input.disconnect(ring);
        carrier.stop();
        carrier.disconnect();
        ring.disconnect();
        band.disconnect();
        level.disconnect();
      },
    };
  }

  if (effect === 'chipmunk' || effect === 'deep') {
    await loadPitchWorklet(context);
    const shifter = new AudioWorkletNode(context, 'pitch-shift', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { factor: PITCH_FACTORS[effect], grainSeconds: GRAIN_SECONDS },
    });
    input.connect(shifter);
    return {
      output: shifter,
      close: () => {
        input.disconnect(shifter);
        shifter.disconnect();
        shifter.port.postMessage('stop');
      },
    };
  }

  const through = context.createGain();
  input.connect(through);
  return {
    output: through,
    close: () => {
      input.disconnect(through);
      through.disconnect();
    },
  };
}

/* ------------------------ the microphone, for LiveKit ----------------------- */

/** The noise model and the voice changer together: what `MicProcessor` runs, in that order. */
export interface MicChoice {
  /** Run the noise model first (`noise-model.ts`). */
  suppress: boolean;
  effect: VoiceEffect;
}

/** Whether a microphone needs a processor at all. Without one it is sent as the browser hands it over. */
export function needsProcessor(choice: MicChoice): boolean {
  return choice.suppress || choice.effect !== 'none';
}

/**
 * Sits between the microphone and LiveKit, as a LiveKit track processor:
 * microphone, then the noise model, then the voice changer, then out to be
 * encrypted. So the changer never has to work on a keyboard, and nothing
 * anyone hears was ever the raw room.
 *
 * LiveKit sends `processedTrack` in place of the microphone and keeps it
 * there when the microphone is restarted (a new device, or a track the
 * browser ended), handing us the new one through `restart`. Swapping the
 * track happens on the existing sender, which is what keeps the same
 * publication and the same encryption: the frame encryptor belongs to the
 * sender, not the track.
 *
 * The output track stays the same one for this processor's whole life,
 * whatever the microphone, the model or the effect does: a change rebuilds
 * only the middle, and nobody else sees a thing.
 */
export class MicProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'scryproof-microphone';
  processedTrack?: MediaStreamTrack;

  /** The raw microphone, before anything. The gate listens to this one. */
  microphone: MediaStreamTrack | null = null;

  /** Whether the noise model really is running; false after asking for it where it could not start. */
  suppressing = false;

  private readonly inlet: GainNode;
  /** Where the cleaned voice comes out, whether or not the model is in front of it. */
  private readonly cleaned: GainNode;
  private readonly outlet: MediaStreamAudioDestinationNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private suppressor: { input: AudioNode; output: AudioNode; close(): void } | null = null;
  private chain: EffectChain | null = null;
  private chainEffect: VoiceEffect | null = null;
  /** What the front was last built for; null before the first build. */
  private suppressWanted: boolean | null = null;
  private work: Promise<void> = Promise.resolve();
  private closed = false;

  /**
   * `context` is the app's own, not the one LiveKit offers in `init`: the
   * worklets are loaded per context, and the settings preview has already
   * loaded them into this one. It runs at 48 kHz, which the model needs.
   */
  constructor(
    private current: MicChoice,
    private readonly context: AudioContext,
  ) {
    this.inlet = context.createGain();
    this.cleaned = context.createGain();
    this.outlet = context.createMediaStreamDestination();
  }

  get choice(): MicChoice {
    return this.current;
  }

  async init(options: AudioProcessorOptions): Promise<void> {
    this.listenTo(options.track);
    await this.build(this.current);
    this.processedTrack = this.outlet.stream.getAudioTracks()[0];
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    this.listenTo(options.track);
  }

  /** Change the model or the effect in place. The published track does not change. */
  async set(choice: MicChoice): Promise<void> {
    if (choice.suppress === this.current.suppress && choice.effect === this.current.effect) return;
    this.current = choice;
    await this.build(choice);
  }

  async destroy(): Promise<void> {
    this.closed = true;
    this.processedTrack?.stop();
    this.chain?.close();
    this.chain = null;
    if (this.suppressor) this.inlet.disconnect(this.suppressor.input);
    this.suppressor?.close();
    this.suppressor = null;
    this.source?.disconnect();
    this.source = null;
    this.microphone = null;
    this.inlet.disconnect();
    this.cleaned.disconnect();
  }

  private listenTo(track: MediaStreamTrack): void {
    this.source?.disconnect();
    this.microphone = track;
    this.source = this.context.createMediaStreamSource(new MediaStream([track]));
    this.source.connect(this.inlet);
  }

  /**
   * Changes run one after another, each finishing before the next starts, so
   * a slow model load cannot land after a newer choice or leave the
   * microphone hooked to nothing. A failure reaches the caller of that change
   * and does not stop the ones after it.
   */
  private build(choice: MicChoice): Promise<void> {
    const run = this.work.then(() => this.apply(choice));
    this.work = run.catch(() => undefined);
    return run;
  }

  private async apply(choice: MicChoice): Promise<void> {
    if (this.closed) return;

    if (this.suppressWanted !== choice.suppress) {
      // A model that will not start leaves the voice as the browser gave it,
      // which beats silence; the caller turns the browser's own suppression
      // on when `suppressing` comes back false.
      let suppressor: MicProcessor['suppressor'] = null;
      if (choice.suppress) {
        suppressor = await import('./noise-model').then((model) => model.openSuppressor(this.context)).catch(() => null);
      }
      if (this.closed) {
        suppressor?.close();
        return;
      }
      // The new path is joined before the old one goes: a moment of both
      // rather than a moment of nothing. Joining a pair twice is harmless.
      const old = this.suppressor;
      if (suppressor) {
        this.inlet.connect(suppressor.input);
        suppressor.output.connect(this.cleaned);
      } else {
        this.inlet.connect(this.cleaned);
      }
      if (old) {
        this.inlet.disconnect(old.input);
        old.close();
      } else if (suppressor) {
        this.inlet.disconnect(this.cleaned);
      }
      this.suppressor = suppressor;
      this.suppressing = suppressor !== null;
      this.suppressWanted = choice.suppress;
    }

    // The changer hangs off `cleaned`, which never changes, so a new model
    // in front does not need a new changer behind.
    if (this.chain && this.chainEffect === choice.effect) return;
    const chain = await effectChain(this.context, this.cleaned, choice.effect);
    if (this.closed) {
      chain.close();
      return;
    }
    chain.output.connect(this.outlet);
    this.chain?.close();
    this.chain = chain;
    this.chainEffect = choice.effect;
  }
}
