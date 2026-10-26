import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pcmToneLevel } from '../mac-audio-spectrum.mjs';
test('audible call-tone control survives codec phase changes', () => {
  const pcm = Buffer.alloc(48000 * 4);
  for (let i=0; i<48000; i++) {
    const sign = Math.floor(i/4800)%2 ? -1 : 1;
    const n = Math.round(32768 * 0.1 * Math.sin(2*Math.PI*700*i/48000) * sign);
    pcm.writeInt16LE(n,i*4); pcm.writeInt16LE(n,i*4+2);
  }
  assert.ok(Math.abs(pcmToneLevel(pcm,700) - (-20)) < 0.1);
});
test('missing or silent call audio cannot pass the audible positive control', () => {
  assert.ok(pcmToneLevel(Buffer.alloc(48000*4),700) < -200);
  assert.ok(pcmToneLevel(Buffer.alloc(0),700) < -200);
});
