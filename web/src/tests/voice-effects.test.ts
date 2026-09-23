/**
 * The pitch shifter behind the Chipmunk and Deep voices, checked on numbers
 * rather than by ear. A pure tone makes it measurable: its pitch is how often
 * it crosses zero.
 *
 * Both copies are run: `shiftPitch` in `voice-effects.ts`, and the worklet in
 * `web/public/worklets/pitch-shift.js` that a browser actually loads, so the
 * two cannot drift apart without a test saying so.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { GRAIN_SECONDS, createGrainState, isVoiceEffect, shiftPitch } from '../lib/voice-effects';

const RATE = 48_000;
/** What a browser hands a worklet at a time. */
const BLOCK = 128;

function sine(hz: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let n = 0; n < out.length; n += 1) out[n] = Math.sin((2 * Math.PI * hz * n) / RATE);
  return out;
}

function crossings(signal: Float32Array): number {
  let count = 0;
  for (let n = 1; n < signal.length; n += 1) if (signal[n - 1]! < 0 !== signal[n]! < 0) count += 1;
  return count;
}

function rms(signal: Float32Array): number {
  let sum = 0;
  for (const sample of signal) sum += sample * sample;
  return Math.sqrt(sum / signal.length);
}

/** Feeds `input` through in browser-sized blocks, the way the audio thread would. */
function inBlocks(input: Float32Array, run: (block: Float32Array, out: Float32Array) => void): Float32Array {
  const output = new Float32Array(input.length);
  for (let start = 0; start < input.length; start += BLOCK) {
    const block = input.subarray(start, start + BLOCK);
    const out = new Float32Array(block.length);
    run(block, out);
    output.set(out, start);
  }
  return output;
}

function viaFunction(input: Float32Array, factor: number): Float32Array {
  const state = createGrainState(RATE);
  return inBlocks(input, (block, out) => shiftPitch(state, block, out, factor));
}

/** Loads the worklet file as a browser would, with just enough of the audio thread around it. */
function viaWorklet(input: Float32Array, factor: number): Float32Array {
  const source = readFileSync(new URL('../../public/worklets/pitch-shift.js', import.meta.url), 'utf8');
  class AudioWorkletProcessor {
    port = { onmessage: null as ((event: { data: unknown }) => void) | null };
  }
  type Processor = new (options: unknown) => { process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean };
  const registered: { processor?: Processor } = {};
  const registerProcessor = (_name: string, processor: Processor) => {
    registered.processor = processor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(
    AudioWorkletProcessor,
    registerProcessor,
    RATE,
  );
  assert.ok(registered.processor, 'the worklet registers a processor');
  const processor = new registered.processor({ processorOptions: { factor, grainSeconds: GRAIN_SECONDS } });
  return inBlocks(input, (block, out) => {
    assert.equal(processor.process([[block]], [[out]]), true);
  });
}

/** Past the first grain, once both readers have something real under them. */
const settled = (signal: Float32Array) => signal.subarray(Math.round(GRAIN_SECONDS * 2 * RATE));

describe('voice effects: the pitch shifter', () => {
  for (const [name, shift] of [
    ['shiftPitch', viaFunction],
    ['the worklet', viaWorklet],
  ] as const) {
    test(`${name}: a 440 Hz sine at factor 2 crosses zero twice as often`, () => {
      const input = sine(440, 1);
      const output = shift(input, 2);
      const ratio = crossings(settled(output)) / crossings(settled(input));
      assert.ok(Math.abs(ratio - 2) < 0.1, `expected about twice as many crossings, got ${ratio.toFixed(3)} times`);
    });

    test(`${name}: Deep (0.7) brings a 440 Hz sine down to about 308 Hz`, () => {
      const input = sine(440, 1);
      const ratio = crossings(settled(shift(input, 0.7))) / crossings(settled(input));
      assert.ok(Math.abs(ratio - 0.7) < 0.05, `expected about 0.7, got ${ratio.toFixed(3)}`);
    });

    test(`${name}: factor 1 changes nothing but a delay, and keeps the loudness`, () => {
      const input = sine(440, 0.5);
      const output = settled(shift(input, 1));
      assert.equal(crossings(output), crossings(settled(input)));
      assert.ok(Math.abs(rms(output) - rms(settled(input))) < 0.01);
    });
  }

  test('the two copies agree sample for sample', () => {
    const input = sine(220, 0.3);
    const a = viaFunction(input, 1.5);
    const b = viaWorklet(input, 1.5);
    let worst = 0;
    for (let n = 0; n < a.length; n += 1) worst = Math.max(worst, Math.abs(a[n]! - b[n]!));
    assert.ok(worst < 1e-6, `they differ by up to ${worst}`);
  });

  test('the added delay stays under 60 ms', () => {
    // Left alone (factor 1) the readers stand still, and all that is heard is
    // the one half a grain behind. Shifting moves them between none and one
    // grain behind, so a grain is the most it can ever add.
    const input = sine(440, 0.3);
    const output = viaFunction(input, 1);
    const lag = Math.round((GRAIN_SECONDS / 2) * RATE);
    for (let n = lag; n < input.length; n += 997) assert.ok(Math.abs(output[n]! - input[n - lag]!) < 1e-6);
    assert.ok(GRAIN_SECONDS * 1000 < 60);
  });

  test('a stored choice that is not a voice is refused', () => {
    assert.equal(isVoiceEffect('robot'), true);
    assert.equal(isVoiceEffect('none'), true);
    assert.equal(isVoiceEffect('dalek'), false);
    assert.equal(isVoiceEffect(undefined), false);
  });
});
