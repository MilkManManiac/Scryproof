/*
 * Where a popover goes, given what opened it.
 *
 * One rule for every card that floats beside something: to the right of the
 * anchor if there is room, otherwise to the left, otherwise wherever it fits.
 * Top-aligned with the anchor, then pushed up if it would run off the bottom.
 * Pure, so the arithmetic is tested without a browser.
 */

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Spot {
  top: number;
  left: number;
}

const MARGIN = 8;

export function placeBeside(anchor: Rect, card: Size, viewport: Size, gap = MARGIN): Spot {
  let left: number;
  if (anchor.right + gap + card.width + MARGIN <= viewport.width) left = anchor.right + gap;
  else if (anchor.left - gap - card.width >= MARGIN) left = anchor.left - gap - card.width;
  else left = Math.max(MARGIN, Math.min(viewport.width - card.width - MARGIN, anchor.left));

  const lowest = Math.max(MARGIN, viewport.height - card.height - MARGIN);
  const top = Math.max(MARGIN, Math.min(lowest, anchor.top));
  return { top, left };
}
