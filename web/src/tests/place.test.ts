import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { placeBeside } from '../lib/place';

const viewport = { width: 1200, height: 800 };
const card = { width: 300, height: 360 };

describe('placeBeside', () => {
  it('goes to the right of something on the left, level with its top', () => {
    const spot = placeBeside({ top: 100, left: 40, right: 80, bottom: 120 }, card, viewport);
    assert.deepEqual(spot, { top: 100, left: 88 });
  });

  it('goes to the left of something at the right edge, like a member row', () => {
    const spot = placeBeside({ top: 100, left: 980, right: 1190, bottom: 120 }, card, viewport);
    assert.deepEqual(spot, { top: 100, left: 672 });
  });

  it('is pushed up rather than running off the bottom', () => {
    const spot = placeBeside({ top: 760, left: 40, right: 80, bottom: 780 }, card, viewport);
    assert.equal(spot.top, 800 - 360 - 8);
    assert.equal(spot.left, 88);
  });

  it('fits somewhere on a screen narrower than both sides', () => {
    const spot = placeBeside({ top: 50, left: 100, right: 140, bottom: 70 }, card, { width: 380, height: 700 });
    assert.equal(spot.left, 380 - 300 - 8);
    assert.equal(spot.top, 50);
  });
});
