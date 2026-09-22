import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MAX_SCALE, MIN_SCALE, clampScale, fitScale, wheelFactor, zoomAround } from '../lib/zoom';

describe('fitScale', () => {
  it('shrinks a big picture to the box and never enlarges a small one', () => {
    assert.equal(fitScale({ width: 4000, height: 2000 }, { width: 1000, height: 1000 }), 0.25);
    assert.equal(fitScale({ width: 300, height: 200 }, { width: 1000, height: 1000 }), 1);
  });
});

describe('zoomAround', () => {
  it('keeps the point under the pointer where it was', () => {
    // The picture is centred (offset 0). The pointer is 100px right of centre,
    // over picture point 100 at scale 1. At scale 2 that point must still be
    // 100px right of centre: 100 * 2 + x = 100, so x = -100.
    const view = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 0 });
    assert.deepEqual(view, { scale: 2, x: -100, y: 0 });
  });

  it('zooming at the centre only changes the scale', () => {
    const view = zoomAround({ scale: 1, x: 0, y: 0 }, 3, { x: 0, y: 0 });
    assert.deepEqual(view, { scale: 3, x: 0, y: 0 });
  });

  it('stays within the limits', () => {
    assert.equal(zoomAround({ scale: 1, x: 0, y: 0 }, 100, { x: 0, y: 0 }).scale, MAX_SCALE);
    assert.equal(clampScale(0.0001), MIN_SCALE);
  });
});

describe('wheelFactor', () => {
  it('scrolling up zooms in and scrolling down zooms out, by the same amount', () => {
    const inward = wheelFactor(-100);
    const outward = wheelFactor(100);
    assert.ok(inward > 1);
    assert.ok(outward < 1);
    assert.ok(Math.abs(inward * outward - 1) < 1e-9);
  });
});
