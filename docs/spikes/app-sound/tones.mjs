// node tones.mjs file.pcm : level of 440/1000/1500 Hz in 48 kHz stereo s16le
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const n = Math.floor(buf.length / 4);
const x = new Float64Array(n);
for (let i = 0; i < n; i++) x[i] = (buf.readInt16LE(i * 4) + buf.readInt16LE(i * 4 + 2)) / 65536;
const level = (f) => {
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) { const a = (2 * Math.PI * f * i) / 48000; re += x[i] * Math.cos(a); im += x[i] * Math.sin(a); }
  return (20 * Math.log10((2 * Math.hypot(re, im)) / Math.max(n, 1) + 1e-12)).toFixed(0);
};
console.log(`seconds=${(n / 48000).toFixed(2)} own440=${level(440)}dB spotify1000=${level(1000)}dB game1500=${level(1500)}dB`);
