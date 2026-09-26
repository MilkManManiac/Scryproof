/*
 * The phone's back button (Android's, and the back swipe) closes whatever is
 * open on top instead of leaving the app.
 *
 * While anything is open there is one extra step in the browser history, ours.
 * Back takes that step: the top layer closes, and if more are still open the
 * step is put back for the next press. When the last layer is closed some
 * other way (the X, the backdrop), the step is taken back out, and the pop
 * that causes is ignored.
 *
 * One step for all of them, not one each, because steps are taken back out
 * asynchronously: with one per layer, a dialog opening as the drawer closed
 * (or React's development double-mount) queued several backs that overshot
 * and closed the dialog too.
 *
 * Phone-sized windows only; on a computer the browser's back button keeps
 * meaning the browser's back.
 */

import { useEffect, useRef } from 'react';

import { LAYER_OPENED, emit } from './signals';
import { usePhone } from './usePhone';

interface Layer {
  close: () => void;
}

/** Open layers, oldest first. Back closes the last. */
const stack: Layer[] = [];
/** Marks our step, so a pop can tell whether it landed back on it. */
const KEY = 'scryproofLayer';
/** Our step is the current history entry. */
let stepped = false;
/** Pops still to come from backs we asked for ourselves. */
let ignoring = 0;
let listening = false;

function step(): void {
  history.pushState({ ...(history.state ?? {}), [KEY]: true }, '');
  stepped = true;
}

function onPop(event: PopStateEvent): void {
  if (ignoring > 0) {
    ignoring -= 1;
    // Something opened while that back was on its way.
    if (stack.length > 0) {
      if (event.state?.[KEY]) stepped = true;
      else step();
    }
    return;
  }
  stepped = false;
  stack.pop()?.close();
  if (stack.length > 0) step();
}

export function useBackButton(active: boolean, close: () => void): void {
  const latest = useRef(close);
  latest.current = close;

  useEffect(() => {
    if (!active) return;
    if (!listening) {
      window.addEventListener('popstate', onPop);
      listening = true;
    }
    const layer: Layer = { close: () => latest.current() };
    stack.push(layer);
    if (!stepped) step();
    return () => {
      const at = stack.indexOf(layer);
      // Off the stack already: back closed it and took the step itself.
      if (at === -1) return;
      stack.splice(at, 1);
      if (stack.length === 0 && stepped) {
        stepped = false;
        ignoring += 1;
        history.back();
      }
    };
  }, [active]);
}

/**
 * For a dialog or a full-screen page: back closes it on a phone, and opening
 * it puts the drawer away, since a drawer left open behind a dialog is what
 * the person sees again when the dialog closes (the phone tour, 2026-09-26).
 */
export function useLayer(close: () => void): void {
  const phone = usePhone();
  useBackButton(phone, close);
  useEffect(() => emit(LAYER_OPENED), []);
}
