/**
 * The loudness guard, as the app uses it: no knock, bump or pop from anyone's
 * microphone comes out much louder than that person's own talking. The
 * sample-by-sample work is `web/public/worklets/loudness-guard.js`, tested in
 * `tests/loudness-guard.test.ts`.
 *
 * Why (Wes, 2026-09-25, about a friend's microphone): "seth mic goes nutty
 * when he hits his mic", then "its better, but def still happens". Measured on
 * Wes's recording of it: talking sits around -33 dBFS, and one handling blast
 * reached -6, about 27 dB over. Noise suppression takes the ring after a knock
 * but lets its first quarter second through, and no app publishes a fix for
 * that part, so this is ours.
 *
 * It runs in two places:
 *   - On the microphone, before encryption: a 100 Hz high-pass (the knock's
 *     thump sits at 60 to 100 Hz, speech above), then the noise model, then
 *     the guard. Run on the recording, the blast came down to -20 dBFS and
 *     talking moved by 0.4 dB.
 *   - On each voice we hear, after decryption, so a friend on an old copy of
 *     the app, or with the guard switched off, cannot blast anyone either.
 *     Guard only: their own high-pass, if any, has already run.
 *
 * Headroom 14 dB ("gentle") rather than 10 ("firm"): firm took the blast 4 dB
 * lower but pulled talking down 1.7 dB and would flatten a laugh or a shout.
 * Gentle leaves a blast about as loud as an emphatic word.
 */

import { type Bridge, loadWorklet } from './audio-graph';

export const GUARD_HEADROOM_DB = 14;
export const HIGH_PASS_HZ = 100;

/**
 * A 100 Hz high-pass that falls away at 24 dB an octave: two 12 dB filters in
 * a row, as measured.
 */
export function openHighPass(context: BaseAudioContext): Bridge {
  const filters = [0, 1].map(() => {
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = HIGH_PASS_HZ;
    filter.Q.value = Math.SQRT1_2;
    return filter;
  });
  const [first, second] = filters as [BiquadFilterNode, BiquadFilterNode];
  first.connect(second);
  return {
    input: first,
    output: second,
    close: () => {
      first.disconnect();
      second.disconnect();
    },
  };
}

/** The guard itself, on one voice. Mono in and mono out, so a stereo source cannot come out one-sided. */
export async function openGuard(context: BaseAudioContext): Promise<Bridge> {
  await loadWorklet(context, '/worklets/loudness-guard.js');
  const node = new AudioWorkletNode(context, 'loudness-guard', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: 1,
    channelCountMode: 'explicit',
    processorOptions: { headroomDb: GUARD_HEADROOM_DB },
  });
  return {
    input: node,
    output: node,
    close: () => {
      node.disconnect();
      node.port.postMessage('stop');
    },
  };
}
