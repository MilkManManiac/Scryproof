/*
 * Swipe the drawers, the way Discord does on a phone: drag right anywhere to
 * pull the servers and channels in, left for the members, and the other way
 * to put either away. The drawer follows the thumb and settles open or shut
 * by how far it got, or by a quick flick.
 *
 * The drawer is moved by writing its transform directly while the thumb is
 * down, not through React, so it keeps up with the finger. On release the
 * class says where it rests and the stylesheet's transition takes it there.
 */

import { useEffect, useRef } from 'react';

type Side = 'left' | 'right';

/** Where a sideways drag means something else, or nothing should move. */
const NOT_HERE = [
  'input',
  'textarea',
  'pre',
  'input[type="range"]',
  '.voice-range',
  '.reaction-picker',
  '.spawner',
  '.hold-backdrop',
  '.message-actions',
  '.call-strip',
  '.settings-nav',
  '.emoji-tabs',
].join(', ');
/** Anything covering the page: a swipe under it would move a drawer nobody can see. */
const COVERED = '.modal-backdrop, .settings-backdrop, .lightbox, .hold-backdrop, .walkthrough-card';

/** Pixels before a drag picks a direction. */
const DECIDE = 10;
/** Pixels per millisecond that count as a flick. */
const FLICK = 0.5;

export function useDrawerSwipe(
  enabled: boolean,
  open: Side | null,
  setOpen: (side: Side | null) => void,
  hasRight: boolean,
): void {
  const state = useRef({ open, setOpen, hasRight });
  state.current = { open, setOpen, hasRight };

  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let drag: {
      side: Side;
      el: HTMLElement;
      width: number;
      opening: boolean;
      hidden: number;
      lastX: number;
      lastT: number;
      speed: number;
    } | null = null;

    const reset = () => {
      start = null;
      drag = null;
    };

    const onStart = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1) return;
      const target = event.target as Element | null;
      if (!target || target.closest(NOT_HERE) || document.querySelector(COVERED)) return;
      const touch = event.touches[0]!;
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (!drag) {
        if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
        // Mostly up or down is a scroll; let it be one.
        if (Math.abs(dx) < Math.abs(dy) * 1.3) {
          start = null;
          return;
        }
        const { open: now, hasRight } = state.current;
        let side: Side | null = null;
        if (now === 'left' && dx < 0) side = 'left';
        else if (now === 'right' && dx > 0) side = 'right';
        else if (!now && dx > 0) side = 'left';
        else if (!now && dx < 0 && hasRight) side = 'right';
        const el = side ? document.querySelector<HTMLElement>(`.dock.${side}`) : null;
        if (!side || !el) {
          start = null;
          return;
        }
        el.style.transition = 'none';
        drag = {
          side,
          el,
          width: el.getBoundingClientRect().width,
          opening: !now,
          hidden: now ? 0 : el.getBoundingClientRect().width,
          lastX: touch.clientX,
          lastT: event.timeStamp,
          speed: 0,
        };
      }

      // Sideways and committed: the page under the thumb should not scroll.
      if (event.cancelable) event.preventDefault();
      const { side, width, opening } = drag;
      // How much of the drawer is still off the edge: 0 is fully out.
      const pulled = side === 'left' ? dx : -dx;
      const hidden = Math.min(width, Math.max(0, opening ? width - pulled : -pulled));
      drag.el.style.transform = `translateX(${side === 'left' ? -hidden : hidden}px)`;
      const elapsed = event.timeStamp - drag.lastT;
      if (elapsed > 0) drag.speed = (touch.clientX - drag.lastX) / elapsed;
      drag.lastX = touch.clientX;
      drag.lastT = event.timeStamp;
      drag.hidden = hidden;
    };

    const onEnd = () => {
      if (drag) {
        const { el, side, width, hidden, speed } = drag;
        // Toward the open position is right for the left drawer, left for the right one.
        const outward = side === 'left' ? speed : -speed;
        const settleOpen = outward > FLICK ? true : outward < -FLICK ? false : hidden < width / 2;
        el.classList.toggle('open', settleOpen);
        el.style.transition = '';
        el.style.transform = '';
        state.current.setOpen(settleOpen ? side : null);
      }
      reset();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);
}
