/**
 * The loudness guard, run in Node: the shipped worklet file itself, loaded
 * with a stand-in for the browser's worklet globals, fed synthetic talking and
 * a synthetic mic knock.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const RATE = 48000;
const BLOCK = 128;

type Processor = {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  port: { onmessage: ((event: { data: unknown }) => void) | null };
};

function loadGuard(headroomDb?: number): Processor {
  const source = readFileSync(new URL('../../public/worklets/loudness-guard.js', import.meta.url), 'utf8');
  let made: (new (options: unknown) => Processor) | undefined;
  class AudioWorkletProcessor {
    port = { onmessage: null };
  }
  const register = (_name: string, processor: new (options: unknown) => Processor) => {
    made = processor;
  };
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(AudioWorkletProcessor, register, RATE);
  assert.ok(made, 'the file registers a processor');
  return new made({ processorOptions: headroomDb === undefined ? {} : { headroomDb } });
}

function run(guard: Processor, signal: Float32Array): Float32Array {
  const out = new Float32Array(signal.length);
  for (let at = 0; at < signal.length; at += BLOCK) {
    const input = signal.subarray(at, Math.min(at + BLOCK, signal.length));
    const output = new Float32Array(input.length);
    guard.process([[input]], [[output]]);
    out.set(output, at);
  }
  return out;
}

const db = (x: number) => 20 * Math.log10(x);
const peak = (x: Float32Array, from = 0, to = x.length) => {
  let top = 0;
  for (let n = from; n < to; n += 1) top = Math.max(top, Math.abs(x[n]));
  return top;
};

/** Talking, roughly: a 160 Hz voice at -26 dBFS RMS, in syllables with gaps. */
function talking(seconds: number, rmsDb = -26): Float32Array {
  const amp = Math.SQRT2 * 10 ** (rmsDb / 20);
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let n = 0; n < out.length; n += 1) {
    const t = n / RATE;
    const syllable = (t * 4) % 1 < 0.7 ? 1 : 0;
    out[n] = syllable * amp * Math.sin(2 * Math.PI * 160 * t);
  }
  return out;
}

/** A knock like Seth's: a 79 Hz thump near full scale, ringing down over half a second. */
function knock(): Float32Array {
  const out = new Float32Array(Math.round(0.6 * RATE));
  for (let n = 0; n < out.length; n += 1) {
    const t = n / RATE;
    out[n] = 0.95 * Math.exp(-t / 0.12) * Math.sin(2 * Math.PI * 79 * t);
  }
  return out;
}

function join(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const DELAY = Math.round(0.005 * RATE);

describe('the loudness guard', () => {
  it('leaves ordinary talking alone, only delayed by the look-ahead', () => {
    const input = talking(6);
    const output = run(loadGuard(), input);
    // After the first second, output is input shifted by the look-ahead.
    let worst = 0;
    for (let n = RATE; n < input.length; n += 1) worst = Math.max(worst, Math.abs(output[n] - input[n - DELAY]));
    assert.ok(worst < 1e-4, `talking changed by ${worst}`);
  });

  it('holds a knock to about the ceiling above the talker', () => {
    const before = talking(6);
    const input = join(before, knock(), talking(2));
    const output = run(loadGuard(14), input);
    const knockAt = before.length;
    const inPeak = peak(input, knockAt, knockAt + RATE / 2);
    const outPeak = peak(output, knockAt, knockAt + RATE / 2);
    // Ceiling: talking RMS -26 dBFS + 14 dB = -12 dBFS. The knock went in at about -0.5.
    assert.ok(db(inPeak) > -1, `knock in at ${db(inPeak).toFixed(1)} dBFS`);
    assert.ok(db(outPeak) < -11, `knock out at ${db(outPeak).toFixed(1)} dBFS`);
  });

  it('catches the very first sample of a knock, because it looks ahead', () => {
    const before = talking(6);
    const input = join(before, knock());
    const output = run(loadGuard(14), input);
    const firstOut = peak(output, before.length + DELAY, before.length + DELAY + 48);
    assert.ok(db(firstOut) < -11, `the first millisecond came out at ${db(firstOut).toFixed(1)} dBFS`);
  });

  it('a knock does not teach it that loud is normal', () => {
    const input = join(talking(6), knock(), knock(), knock(), talking(1));
    const output = run(loadGuard(14), input);
    // The third knock is held as hard as the first.
    const third = 6 * RATE + 2 * knock().length;
    assert.ok(db(peak(output, third, third + RATE / 2)) < -11);
  });

  it('follows a quiet talker down, so their knocks are held lower', () => {
    const before = talking(20, -38);
    const input = join(before, knock());
    const output = run(loadGuard(14), input);
    // Learned about -38, so the ceiling is about -24.
    const outPeak = db(peak(output, before.length, before.length + RATE / 2));
    assert.ok(outPeak < -21, `knock out at ${outPeak.toFixed(1)} dBFS`);
  });

  it('gets back to full volume soon after the knock', () => {
    const before = talking(6);
    const after = talking(2);
    const input = join(before, knock(), after);
    const output = run(loadGuard(14), input);
    const afterAt = before.length + knock().length;
    // Half a second later, talking is within 1 dB of what went in.
    const from = afterAt + RATE / 2;
    const ratio = peak(output, from + DELAY, from + RATE / 4 + DELAY) / peak(input, from, from + RATE / 4);
    assert.ok(Math.abs(db(ratio)) < 1, `talking after the knock is off by ${db(ratio).toFixed(2)} dB`);
  });
});
