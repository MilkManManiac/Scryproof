/**
 * Keeping a conversation at its newest message.
 *
 * Opening a channel or a DM should show the bottom and stay there while the
 * rows above finish drawing: pictures load after the first scroll (they have
 * no height until they do), voice players and polls fill in, the unread bar
 * appears above the list and takes some of its height. None of those change
 * how many messages there are, and none of them fire a scroll event, so a
 * list that only scrolls down when a message arrives is left partway up.
 * The caller reports every change in size here; this decides whether to
 * follow it.
 *
 * The other half is telling a person scrolling up from a list being pushed.
 * Deciding "pinned" from the distance to the bottom on every scroll event
 * gets that wrong: the event for our own jump to the bottom can arrive after
 * a picture has already grown the list, and by then the distance says the
 * reader is far from the bottom when they never moved. So the pin is let go
 * only when the scroll position goes up, which a list growing underneath
 * never does, and taken back whenever the reader is near the bottom again.
 *
 * Pure apart from writing scrollTop, so it is tested with a plain object.
 */

/** The three numbers of a scrolling element that matter here. */
export interface ScrollBox {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export function distanceFromBottom(box: ScrollBox): number {
  return box.scrollHeight - box.scrollTop - box.clientHeight;
}

export class BottomPin {
  pinned = true;
  /** Where the list was after the last scroll we saw or made, to tell up from down. */
  private lastTop = 0;

  /** How close to the bottom counts as at it. */
  constructor(private readonly near = 80) {}

  /** A conversation was opened: its newest message is where the eye goes. */
  open(box: ScrollBox): void {
    this.pinned = true;
    this.settle(box);
  }

  /** Something changed size or arrived. Follow it down if we are pinned. */
  settle(box: ScrollBox): void {
    if (this.pinned) box.scrollTop = box.scrollHeight;
    // The browser clamps what was asked for, so read back what it gave.
    this.lastTop = box.scrollTop;
  }

  /** Stop following, whatever the scroll position says. A jump window is not the bottom. */
  release(box: ScrollBox): void {
    this.pinned = false;
    this.lastTop = box.scrollTop;
  }

  /** A scroll event. Returns whether the list is pinned afterwards. */
  scrolled(box: ScrollBox, allowed = true): boolean {
    if (!allowed) this.pinned = false;
    else if (distanceFromBottom(box) < this.near) this.pinned = true;
    else if (box.scrollTop < this.lastTop) this.pinned = false;
    this.lastTop = box.scrollTop;
    return this.pinned;
  }
}
