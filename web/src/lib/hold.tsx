/*
 * Press and hold a message on a phone. A phone has no hover, and hovering is
 * how a mouse finds react, reply, edit, delete and save, so on a phone none
 * of them could be reached at all (the phone tour, 2026-09-26). Holding a
 * message lifts the same buttons into a sheet along the bottom of the screen.
 *
 * One message is held at a time, app-wide: holding another lets the first go.
 */

import { useEffect, useRef, useSyncExternalStore, type ReactNode, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';

import { useBackButton } from './back';

const HOLD_MS = 450;
/** A thumb that moves further than this is scrolling, not holding. */
const SLOP = 10;
/** Where a press is not a hold: the sheet itself, and anything typed into. */
const NOT_HERE = '.message-actions, .hold-backdrop, .reaction-picker, input, textarea';

let held: string | null = null;
const listeners = new Set<() => void>();

function setHeld(next: string | null): void {
  if (held === next) return;
  held = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function releaseHold(): void {
  setHeld(null);
}

export function useHold(id: string, enabled: boolean) {
  const isHeld = useSyncExternalStore(subscribe, () => held === id);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  /** Set once the hold lands, so lifting the thumb does not also click what it was on. */
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);
  // A message that stops being holdable (deleted, opened for editing) lets go.
  useEffect(() => {
    if (!enabled && held === id) setHeld(null);
  }, [enabled, id]);

  if (!enabled) return { held: false, bind: {} };

  const bind = {
    onTouchStart(event: TouchEvent) {
      fired.current = false;
      if (event.touches.length !== 1 || (event.target as Element).closest(NOT_HERE)) return;
      const touch = event.touches[0]!;
      start.current = { x: touch.clientX, y: touch.clientY };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        setHeld(id);
        navigator.vibrate?.(12);
      }, HOLD_MS);
    },
    onTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!start.current || !touch) return;
      if (Math.hypot(touch.clientX - start.current.x, touch.clientY - start.current.y) > SLOP) cancel();
    },
    onTouchEnd(event: TouchEvent) {
      cancel();
      if (fired.current) event.preventDefault();
    },
    onTouchCancel: cancel,
    // Android's own long-press menu (copy, share) would open over the sheet.
    onContextMenu(event: { preventDefault(): void; target: EventTarget }) {
      if ((event.target as Element).closest(NOT_HERE)) return;
      event.preventDefault();
      setHeld(id);
    },
  };
  return { held: isHeld, bind };
}

/**
 * The held message's buttons, along the bottom of the screen over a dimmed
 * page. In a portal, because a theme's frosted panels would otherwise become
 * the box a fixed sheet is placed inside.
 */
export function HoldSheet({ children }: { children: ReactNode }) {
  useBackButton(true, releaseHold);
  return createPortal(
    <>
      <button type="button" className="hold-backdrop" aria-label="Close" onClick={releaseHold} />
      {children}
    </>,
    document.body,
  );
}

/**
 * For the sheet's onClickCapture: any of its own buttons, once pressed, puts
 * it away. React stays, because it opens the emoji picker on top of it.
 */
export function releaseAfterAction(event: { target: EventTarget; currentTarget: EventTarget }): void {
  const button = (event.target as Element).closest('button');
  if (button && button.parentElement === event.currentTarget && button.title !== 'React') releaseHold();
}
