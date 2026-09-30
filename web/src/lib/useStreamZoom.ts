/*
 * Looking closer at the big picture in a call: someone's screen with small
 * text on it, mostly (Wes, 2026-09-29: "give the option to zoom in on the
 * stream"). The wheel zooms around the pointer, a drag moves the picture once
 * it is zoomed, two fingers pinch, a double-click goes in and comes back out.
 *
 * Nothing here touches the stream. The <video> is only drawn bigger, so every
 * viewer zooms on their own and the sharer never knows.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { MAX_SCALE, clampOffset, contained, wheelFactor, zoomAround, type Size, type View } from './zoom';

const WHOLE: View = { scale: 1, x: 0, y: 0 };
/** One press of + or −, and how far a double-click goes in. */
export const ZOOM_STEP = 1.5;
const DOUBLE_CLICK_SCALE = 2.5;

export interface StreamZoom {
  /** Put on the element the picture is framed in. */
  frameRef: (node: HTMLElement | null) => void;
  /** Where the picture is, already kept inside the frame. */
  view: View;
  zoomed: boolean;
  dragging: boolean;
  /** Zoom by a factor around the middle of the frame: the + and − buttons. */
  zoomBy: (factor: number) => void;
  reset: () => void;
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void;
  };
}

/**
 * `picture` is the stream's own size in pixels, when known; `resetKey`
 * changes when a different stream is made big, which starts it back at whole.
 */
export function useStreamZoom(picture: Size | null, resetKey: string | undefined): StreamZoom {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [raw, setRaw] = useState<View>(WHOLE);
  const [dragging, setDragging] = useState(false);
  /** The fingers, or the mouse, that are down on the picture, and where each last was. */
  const down = useRef(new Map<number, { x: number; y: number }>());

  // Read inside the setters, so a wheel listener added once still clamps to today's sizes.
  const shownRef = useRef<Size>(box);
  const boxRef = useRef<Size>(box);
  const shown = picture ? contained(picture, box) : box;
  shownRef.current = shown;
  boxRef.current = box;

  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox((was) => (was.width === width && was.height === height ? was : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  useEffect(() => {
    setRaw(WHOLE);
    down.current.clear();
    setDragging(false);
  }, [resetKey]);

  const settle = useCallback((next: View): View => clampOffset(next, shownRef.current, boxRef.current), []);

  /** `at` is a point on screen; without one, the middle of the frame. */
  const zoomTo = useCallback(
    (scaleOf: (view: View) => number, at?: { x: number; y: number }) => {
      const rect = node?.getBoundingClientRect();
      const from = rect && at ? { x: at.x - rect.left - rect.width / 2, y: at.y - rect.top - rect.height / 2 } : { x: 0, y: 0 };
      setRaw((view) => {
        // Never smaller than the whole picture: zooming out past it only shows black.
        const scale = Math.min(MAX_SCALE, Math.max(1, scaleOf(view)));
        return scale === 1 ? WHOLE : settle(zoomAround(view, scale, from));
      });
    },
    [node, settle],
  );

  // The wheel is listened to by hand: React's listener is passive and cannot
  // stop the page under the stage from scrolling instead.
  useEffect(() => {
    if (!node) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo((view) => view.scale * wheelFactor(event.deltaY), { x: event.clientX, y: event.clientY });
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [node, zoomTo]);

  const view = settle(raw);
  const zoomed = view.scale > 1.001;

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A button in the frame is a button, not the start of a drag.
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    down.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (zoomed || down.current.size > 1) setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const before = down.current.get(event.pointerId);
    if (!before) return;
    const now = { x: event.clientX, y: event.clientY };
    if (down.current.size === 1) {
      const [dx, dy] = [now.x - before.x, now.y - before.y];
      setRaw((v) => (v.scale > 1 ? settle({ ...v, x: v.x + dx, y: v.y + dy }) : v));
    } else if (down.current.size === 2) {
      const other = [...down.current].find(([id]) => id !== event.pointerId)![1];
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(now.x - other.x, now.y - other.y);
      if (was > 0 && is > 0) zoomTo((v) => (v.scale * is) / was, { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 });
    }
    down.current.set(event.pointerId, now);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    down.current.delete(event.pointerId);
    if (down.current.size === 0) setDragging(false);
  };
  const onDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    if (zoomed) setRaw(WHOLE);
    else zoomTo(() => DOUBLE_CLICK_SCALE, { x: event.clientX, y: event.clientY });
  };

  return {
    frameRef: setNode,
    view,
    zoomed,
    dragging,
    zoomBy: (factor) => zoomTo((v) => v.scale * factor),
    reset: () => setRaw(WHOLE),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick },
  };
}
