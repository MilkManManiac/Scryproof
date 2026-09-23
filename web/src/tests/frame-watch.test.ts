/**
 * "No picture for N seconds", as a function of decoded-frame samples.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { noPictureLabel, noteFrames, stalledSeconds, type FrameWatch } from '../lib/frame-watch';

/** Feed samples taken every two seconds, as the call's stats poll does. */
function feed(counts: number[], every = 2000): { watch: FrameWatch; now: number } {
  let watch: FrameWatch | undefined;
  let now = 0;
  for (const [i, frames] of counts.entries()) {
    now = i * every;
    watch = noteFrames(watch, frames, now);
  }
  return { watch: watch!, now };
}

describe('frame watch', () => {
  test('a picture whose count keeps climbing is never stalled', () => {
    const { watch, now } = feed([0, 60, 120, 180, 240]);
    assert.equal(stalledSeconds(watch, now), null);
  });

  test('two seconds still is not yet worth saying; four is', () => {
    const one = feed([0, 60, 120, 120]);
    assert.equal(stalledSeconds(one.watch, one.now), null);
    const two = feed([0, 60, 120, 120, 120]);
    assert.equal(stalledSeconds(two.watch, two.now), 4);
  });

  test('the count stays in whole seconds and keeps growing while nothing arrives', () => {
    const { watch } = feed([0, 60, 120, 120]);
    assert.equal(stalledSeconds(watch, 4000 + 5400), 5);
  });

  test('a picture that never arrives is reported, from the moment watching began', () => {
    const { watch, now } = feed([0, 0, 0]);
    assert.equal(stalledSeconds(watch, now), 4);
  });

  test('movement again clears it', () => {
    const { watch, now } = feed([0, 60, 60, 60, 61]);
    assert.equal(stalledSeconds(watch, now), null);
  });

  test('a count that drops is a new track starting over, not a stall', () => {
    const { watch, now } = feed([0, 500, 500, 3]);
    assert.equal(stalledSeconds(watch, now), null);
  });

  test('the words on the tile', () => {
    assert.equal(noPictureLabel('Zach', 5), "No picture from Zach's screen for 5 s");
  });
});
