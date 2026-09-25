/**
 * Who gets the walkthrough by itself, and where its card goes.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { markOnFirstSight, placeCard } from '../lib/walkthrough';

describe('the walkthrough, by itself', () => {
  it('is due once for everyone, members from before it shipped included', () => {
    assert.equal(markOnFirstSight(null), 'due');
  });

  it('never changes its mind once written', () => {
    assert.equal(markOnFirstSight('due'), null);
    assert.equal(markOnFirstSight('done'), null);
  });
});

describe('the card', () => {
  const view = { width: 1440, height: 900 };
  const card = { width: 380, height: 300 };

  it('sits in the middle when there is nothing to point at', () => {
    assert.deepEqual(placeCard(null, card, view), { top: 300, left: 530 });
  });

  it('sits beside a column, level with its middle', () => {
    const rail = { top: 0, left: 0, width: 80, height: 900 };
    assert.deepEqual(placeCard(rail, card, view), { top: 300, left: 96 });
  });

  it('stays on screen next to something at the bottom', () => {
    const corner = { top: 820, left: 68, width: 250, height: 80 };
    const at = placeCard(corner, card, view);
    assert.equal(at.top + card.height, view.height - 16);
    assert.equal(at.left, 68 + 250 + 16);
  });

  it('goes to the left of something on the right edge', () => {
    const lock = { top: 10, left: 1300, width: 120, height: 30 };
    assert.equal(placeCard(lock, card, view).left, 1300 - 16 - 380);
  });

  it('goes above a target as wide as a phone', () => {
    const phone = { width: 390, height: 844 };
    const panel = { top: 760, left: 0, width: 390, height: 84 };
    const at = placeCard(panel, { width: 358, height: 300 }, phone);
    assert.equal(at.top, 760 - 16 - 300);
    assert.equal(at.left, 16);
  });
});
