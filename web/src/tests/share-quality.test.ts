/**
 * What a screen share asks for, given what the person sharing picked.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { screenShareOptions, shareCostLabel } from '../lib/voice-prefs';

describe('screen share quality', () => {
  test('the default is what it always was: 1080 lines, 30 frames, 5 megabits', () => {
    assert.deepEqual(screenShareOptions({ shareHeight: 1080, shareFps: 30 }), {
      resolution: { width: 1920, height: 1080, frameRate: 30 },
      encoding: { maxBitrate: 5_000_000, maxFramerate: 30 },
    });
  });

  test('more frames cost more, fewer cost less', () => {
    const at = (shareFps: 15 | 30 | 60) => screenShareOptions({ shareHeight: 1440, shareFps }).encoding.maxBitrate;
    assert.ok(at(15) < at(30) && at(30) < at(60));
    assert.equal(at(60), 12_800_000);
  });

  test('full size asks for no particular size, and still says how fast', () => {
    const full = screenShareOptions({ shareHeight: 0, shareFps: 60 });
    assert.equal(full.resolution, undefined);
    assert.equal(full.encoding.maxFramerate, 60);
  });

  test('a value nobody offered falls back to the default rather than sending nonsense', () => {
    const odd = screenShareOptions({ shareHeight: 999 as never, shareFps: 7 as never });
    assert.deepEqual(odd.resolution, { width: 1920, height: 1080, frameRate: 30 });
  });

  test('the settings screen says what it costs in plain numbers', () => {
    assert.equal(shareCostLabel({ shareHeight: 1080, shareFps: 30 }), 'Up to about 5 megabits a second of your upload.');
    assert.equal(shareCostLabel({ shareHeight: 720, shareFps: 15 }), 'Up to about 1.5 megabits a second of your upload.');
  });
});
