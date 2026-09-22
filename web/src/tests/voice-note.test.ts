import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { clock, isVoiceFile, isVoiceLabel, peaks, voiceFileName, voiceLabel } from '../lib/voice-note';

describe('peaks', () => {
  it('gives 48 even bars for a steady sine, the loudest at 1', () => {
    const rate = 48_000;
    const samples = new Float32Array(rate);
    for (let i = 0; i < samples.length; i += 1) samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate);
    const bars = peaks(samples);
    assert.equal(bars.length, 48);
    assert.equal(Math.max(...bars), 1);
    for (const bar of bars) assert.ok(bar > 0.95, `a steady tone should be even, got ${bar}`);
  });

  it('follows the loudness when it changes', () => {
    const samples = new Float32Array(4800);
    for (let i = 0; i < samples.length; i += 1) samples[i] = (i < 2400 ? 0.1 : 0.8) * Math.sin(i / 3);
    const bars = peaks(samples, 4);
    assert.ok(bars[0]! < 0.2 && bars[1]! < 0.2, 'the quiet half is low');
    assert.ok(bars[2]! > 0.9 && bars[3]! > 0.9, 'the loud half is high');
  });

  it('leaves silence at zero instead of dividing by nothing', () => {
    const bars = peaks(new Float32Array(9600));
    assert.equal(bars.length, 48);
    assert.ok(bars.every((bar) => bar === 0));
  });

  it('copes with fewer samples than bars, and with none', () => {
    assert.equal(peaks(new Float32Array([0.5, -0.5]), 48).length, 48);
    assert.deepEqual(peaks(new Float32Array(0), 3), [0, 0, 0]);
  });
});

describe('labels and names', () => {
  it('writes the body and the file name as the brief says', () => {
    assert.equal(voiceLabel(12.4), '[voice 0:12]');
    assert.equal(voiceLabel(90), '[voice 1:30]');
    assert.equal(clock(0), '0:00');
    assert.equal(voiceFileName(1_790_000_000_999), 'voice-1790000000.webm');
  });

  it('knows its own clips and nothing else', () => {
    assert.ok(isVoiceFile('voice-1790000000.webm'));
    assert.ok(!isVoiceFile('voice-notes.txt'));
    assert.ok(!isVoiceFile('holiday.webm'));
    assert.ok(isVoiceLabel('[voice 0:12]'));
    assert.ok(!isVoiceLabel('[voice 0:12] and more'));
    assert.ok(!isVoiceLabel(null));
  });
});
