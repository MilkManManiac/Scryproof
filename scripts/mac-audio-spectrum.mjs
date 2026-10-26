/** Tone amplitude in interleaved s16 stereo PCM. Average short windows in
 * power: an Opus phase change must not cancel an audible multi-second tone. */
export function pcmToneLevel(pcm, hz, rate = 48000) {
  const frames = Math.floor(pcm.length / 4);
  const window = Math.round(rate / 10);
  const w = 2 * Math.PI * hz / rate;
  let power = 0, windows = 0;
  for (let start = 0; start + window <= frames; start += window) {
    let re = 0, im = 0;
    for (let i = 0; i < window; i++) {
      const x = pcm.readInt16LE((start + i) * 4) / 32768;
      re += x * Math.cos(w * i);
      im -= x * Math.sin(w * i);
    }
    power += (2 * Math.hypot(re, im) / window) ** 2;
    windows++;
  }
  return 10 * Math.log10((windows ? power / windows : 0) + 1e-24);
}
