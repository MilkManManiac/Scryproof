/**
 * The speaking ring's hold: on the instant a slice is loud, off a little
 * after the last loud one, so the ring does not flicker between syllables.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { withHold } from '../lib/voice-audio';

describe('withHold', () => {
  test('a loud sample turns it on immediately', () => {
    const { speaking } = withHold(0, true, 0, 300);
    assert.equal(speaking, true);
  });

  test('a quiet sample before any loud one stays off', () => {
    const { speaking } = withHold(0, false, 0, 300);
    assert.equal(speaking, false);
  });

  test('it stays on through the hold after the sound stops', () => {
    let until = 0;
    ({ until } = withHold(0, true, until, 300));
    const midway = withHold(200, false, until, 300);
    assert.equal(midway.speaking, true);
    // The hold clock does not reset just because a quiet sample was seen.
    assert.equal(midway.until, until);
  });

  test('it lets go once the hold has fully run out', () => {
    let until = 0;
    ({ until } = withHold(0, true, until, 300));
    const after = withHold(301, false, until, 300);
    assert.equal(after.speaking, false);
  });

  test('another loud sample during the hold pushes the hold forward', () => {
    let until = 0;
    ({ until } = withHold(0, true, until, 300));
    ({ until } = withHold(200, true, until, 300));
    // Without the second loud sample this would have let go by 300; with it,
    // the ring is still meant to be on.
    const stillOn = withHold(350, false, until, 300);
    assert.equal(stillOn.speaking, true);
  });

  test('a run of samples matches hand-worked timings', () => {
    // Loud from 0 to 50ms, silence after. With a 300ms hold the ring should
    // read on up to just under 350ms and off from 350ms.
    let until = 0;
    for (let t = 0; t <= 50; t += 10) ({ until } = withHold(t, true, until, 300));
    assert.equal(withHold(349, false, until, 300).speaking, true);
    assert.equal(withHold(350, false, until, 300).speaking, false);
  });
});
