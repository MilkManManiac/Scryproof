/**
 * Opening a conversation lands on the newest message and stays there.
 *
 * The box below behaves like a scrolling element: scrollTop is clamped to
 * what the content allows, and growing the content does not move it. That is
 * the whole of the bug: a picture that loads after the first scroll makes the
 * list taller and leaves the reader partway up, with no scroll event and no
 * new message to say so.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { BottomPin, distanceFromBottom } from '../lib/stick-to-bottom';

class Box {
  private top = 0;
  constructor(
    public scrollHeight: number,
    public clientHeight: number,
  ) {}
  get scrollTop(): number {
    return this.top;
  }
  set scrollTop(value: number) {
    this.top = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight));
  }
  /** A picture loading, a poll filling in: taller, and the position stays. */
  grow(by: number): void {
    this.scrollHeight += by;
  }
}

/** The rule the timeline used before: pinned is whatever the distance says, on every scroll event. */
function distanceOnly(box: Box): boolean {
  return distanceFromBottom(box) < 80;
}

describe('opening a conversation', () => {
  it('lands at the bottom', () => {
    const box = new Box(3000, 600);
    new BottomPin().open(box);
    assert.equal(distanceFromBottom(box), 0);
  });

  it('is left partway up when a picture loads and nothing follows it (the bug)', () => {
    const box = new Box(3000, 600);
    box.scrollTop = box.scrollHeight;
    // Scrolling only when the message count changes: a picture is not a message.
    box.grow(340);
    assert.equal(distanceFromBottom(box), 340);
  });

  it('follows pictures and the unread bar down while pinned', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.open(box);
    box.grow(340);
    pin.settle(box);
    assert.equal(distanceFromBottom(box), 0);
    // The unread bar appears above the list and takes 36px of its height.
    box.clientHeight -= 36;
    pin.settle(box);
    assert.equal(distanceFromBottom(box), 0);
  });

  it('keeps the pin when our own scroll event arrives after the list has grown', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.open(box);
    // The scroll event for open() is still queued when two pictures load.
    box.grow(340);
    box.grow(340);
    // Deciding from distance alone lets go here, and nothing brings it back.
    assert.equal(distanceOnly(box), false);
    assert.equal(pin.scrolled(box), true);
    pin.settle(box);
    assert.equal(distanceFromBottom(box), 0);
  });
});

describe('reading history', () => {
  it('lets go when the reader scrolls up, and the list stops following', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.open(box);
    box.scrollTop -= 500;
    assert.equal(pin.scrolled(box), false);
    const where = box.scrollTop;
    box.grow(340);
    pin.settle(box);
    assert.equal(box.scrollTop, where);
  });

  it('takes the pin back when the reader returns to the bottom', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.open(box);
    box.scrollTop -= 500;
    pin.scrolled(box);
    box.scrollTop = box.scrollHeight - box.clientHeight - 20;
    assert.equal(pin.scrolled(box), true);
    box.grow(100);
    pin.settle(box);
    assert.equal(distanceFromBottom(box), 0);
  });

  it('never pins a jump window, even at its last row', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.release(box);
    box.scrollTop = box.scrollHeight;
    assert.equal(pin.scrolled(box, false), false);
    box.grow(200);
    pin.settle(box);
    assert.equal(distanceFromBottom(box), 200);
  });

  it('opening another conversation pins again after reading history in the last one', () => {
    const box = new Box(3000, 600);
    const pin = new BottomPin();
    pin.open(box);
    box.scrollTop = 0;
    pin.scrolled(box);
    assert.equal(pin.pinned, false);
    pin.open(box);
    assert.equal(distanceFromBottom(box), 0);
  });
});
