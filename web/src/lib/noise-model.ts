/**
 * Strong noise suppression: RNNoise, a small speech model from the people who
 * made Opus, running on this device inside an AudioWorklet.
 *
 * The browser's own suppression only learns steady sounds, a fan or a hum. A
 * model trained on speech keeps the voice and drops the rest, including the
 * sudden things: keys, a chair, a hand knocking the microphone. Discord does
 * the same job with a commercial model; this one is open, and both of its
 * files are served from our own server (the package is
 * `@sapphi-red/web-noise-suppressor`, MIT). Nothing is fetched from anywhere
 * else and nothing leaves the device: the cleaned voice is what gets encrypted.
 *
 * The model is WebAssembly. A page may only compile that when its policy says
 * 'wasm-unsafe-eval', which allows WebAssembly and nothing else: no eval of
 * JavaScript. A client served under the older policy (the desktop app before
 * shell 0.5.4) cannot run it, so `canRunModel` in `voice-audio.ts` asks once, and the settings
 * fall back to the browser's suppression there and say so.
 *
 * This file is only ever loaded with `import()`, when someone has chosen
 * Strong, so nobody else downloads it.
 */

import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

import { MODEL_SAMPLE_RATE, canRunModel } from './voice-audio';

let binary: Promise<ArrayBuffer> | null = null;
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Fetches the model once per page and loads its worklet once per audio context. A failure is tried again next time. */
async function prepare(context: BaseAudioContext): Promise<ArrayBuffer> {
  if (!binary) {
    binary = loadRnnoise({ url: wasmUrl, simdUrl });
    binary.catch(() => (binary = null));
  }
  let worklet = loaded.get(context);
  if (!worklet) {
    worklet = context.audioWorklet.addModule(workletUrl);
    worklet.catch(() => loaded.delete(context));
    loaded.set(context, worklet);
  }
  const [wasm] = await Promise.all([binary, worklet]);
  return wasm;
}

export interface Suppressor {
  /** Connect the microphone here. Whatever comes in is folded to one channel first. */
  input: AudioNode;
  /** The voice comes out here. */
  output: AudioNode;
  /** Unhooks the output and hands the model back. The caller unhooks whatever it connected to `input`. */
  close(): void;
}

/**
 * Models are kept and handed out again rather than made and thrown away. The
 * package's worklet listens for its "destroy" message on a port it never
 * starts, so a model told to stop never hears it and keeps running until the
 * page closes; making a new one on every change of setting would pile them
 * up. An idle one with nothing connected costs nothing: it skips work when
 * it has no input. There are at most two at once, the call and the settings
 * preview.
 */
const idle = new WeakMap<BaseAudioContext, Suppressor[]>();

/** Takes the microphone in and puts out only the voice. Throws if the model cannot run here. */
export async function openSuppressor(context: BaseAudioContext): Promise<Suppressor> {
  const spare = idle.get(context)?.pop();
  if (spare) return spare;

  if (!canRunModel) throw new Error('This client cannot run the noise model.');
  if (context.sampleRate !== MODEL_SAMPLE_RATE) throw new Error(`The noise model needs ${MODEL_SAMPLE_RATE} Hz audio.`);
  const wasmBinary = await prepare(context);

  // The model cleans the first channel only. A stereo microphone would come
  // out with one side empty and half as loud once the call folds it to mono,
  // so it is folded before the model instead.
  const input = context.createGain();
  input.channelCount = 1;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const node = new RnnoiseWorkletNode(context as AudioContext, { maxChannels: 1, wasmBinary });
  input.connect(node);

  const suppressor: Suppressor = {
    input,
    output: node,
    close: () => {
      node.disconnect();
      const pool = idle.get(context) ?? [];
      if (!pool.includes(suppressor)) pool.push(suppressor);
      idle.set(context, pool);
    },
  };
  return suppressor;
}
