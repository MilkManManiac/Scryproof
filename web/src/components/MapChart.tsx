/**
 * A map to look around: the outlines Travhole draws, with zoom, pan and pins
 * laid over it. Moved out of Travhole so Whereabouts can use it too, where a
 * click on it is a guess (`onPick`).
 *
 * Map units are degrees: x is longitude, y is minus latitude.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Pin {
  code: string;
  name: string;
  x: number;
  y: number;
  /** A class for this pin as well as `tv-pin`, to colour it. */
  kind?: string;
}

/** How far in: 1 is the day's frame. Out is for seeing what lies around it. */
const CLOSEST = 16;
const FURTHEST = 0.4;
const STEP = 1.6;

/**
 * The map, and looking around it (Wes, 2026-09-29: "you should be able to
 * zoom in"). Buttons, the wheel, two fingers, and a drag to move. Zooming
 * keeps whatever is under the pointer where it is.
 */
export function Chart({
  frame,
  pins,
  children,
  label = 'Map of the route so far',
  fitLabel = 'Back to the whole route',
  onPick,
}: {
  frame: Frame;
  pins: Pin[];
  children: ReactNode;
  label?: string;
  fitLabel?: string;
  /** A click on the map that was not the end of a drag, in map units: x is longitude, y is minus latitude. */
  onPick?: (at: { x: number; y: number }) => void;
}) {
  const middle = { k: 1, cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2 };
  const [view, setView] = useState(middle);
  const svg = useRef<SVGSVGElement>(null);
  /** The fingers, or the mouse, that are down on the map, and where each last was. */
  const down = useRef(new globalThis.Map<number, { x: number; y: number }>());
  /** Where the press that may become a pick began, and whether it has since moved too far to be one. */
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  /** Keeps what is shown inside the frame when in, and the frame in the middle when out. */
  const kept = (k: number, cx: number, cy: number) => {
    if (k <= 1) return { k, cx: middle.cx, cy: middle.cy };
    const [halfW, halfH] = [frame.width / k / 2, frame.height / k / 2];
    return {
      k,
      cx: Math.min(frame.x + frame.width - halfW, Math.max(frame.x + halfW, cx)),
      cy: Math.min(frame.y + frame.height - halfH, Math.max(frame.y + halfH, cy)),
    };
  };

  /** `at` is a place on screen; without one it is the middle of the map. */
  const zoom = (by: number, at?: { x: number; y: number }) =>
    setView((before) => {
      const k = Math.min(CLOSEST, Math.max(FURTHEST, before.k * by));
      const rect = svg.current?.getBoundingClientRect();
      if (!at || !rect || rect.width === 0) return kept(k, before.cx, before.cy);
      const [fx, fy] = [(at.x - rect.left) / rect.width - 0.5, (at.y - rect.top) / rect.height - 0.5];
      const [px, py] = [before.cx + (fx * frame.width) / before.k, before.cy + (fy * frame.height) / before.k];
      return kept(k, px - (fx * frame.width) / k, py - (fy * frame.height) / k);
    });

  const slide = (dx: number, dy: number) =>
    setView((before) => {
      const rect = svg.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return before;
      return kept(before.k, before.cx - ((dx / rect.width) * frame.width) / before.k, before.cy - ((dy / rect.height) * frame.height) / before.k);
    });

  // The wheel is listened to by hand: the listener React adds cannot stop the card scrolling under it.
  useEffect(() => {
    const element = svg.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.25 : 0.8, { x: event.clientX, y: event.clientY });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (event: React.PointerEvent<SVGSVGElement>) => {
    down.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press.current = down.current.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : null;
  };
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const before = down.current.get(event.pointerId);
    if (!before) return;
    const now = { x: event.clientX, y: event.clientY };
    // A few pixels of wobble is still a click; more is a drag, and a drag picks nothing.
    if (press.current && Math.hypot(now.x - press.current.x, now.y - press.current.y) > 6) press.current.moved = true;
    if (down.current.size === 1) {
      slide(now.x - before.x, now.y - before.y);
    } else if (down.current.size === 2) {
      const other = [...down.current].find(([id]) => id !== event.pointerId)![1];
      const [was, is] = [Math.hypot(before.x - other.x, before.y - other.y), Math.hypot(now.x - other.x, now.y - other.y)];
      if (was > 0 && is > 0) zoom(is / was, { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 });
    }
    down.current.set(event.pointerId, now);
  };
  const onUp = (event: React.PointerEvent<SVGSVGElement>) => {
    down.current.delete(event.pointerId);
    const was = press.current;
    press.current = null;
    if (!onPick || !was || was.moved || event.type !== 'pointerup') return;
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const [width, height] = [frame.width / view.k, frame.height / view.k];
    onPick({
      x: view.cx - width / 2 + ((event.clientX - rect.left) / rect.width) * width,
      y: view.cy - height / 2 + ((event.clientY - rect.top) / rect.height) * height,
    });
  };

  const [width, height] = [frame.width / view.k, frame.height / view.k];

  return (
    <div className={`tv-map${view.k > 1 ? ' in' : ''}${onPick ? ' picking' : ''}`}>
      <svg
        ref={svg}
        viewBox={`${view.cx - width / 2} ${view.cy - height / 2} ${width} ${height}`}
        role="img"
        aria-label={label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(event) => zoom(STEP, { x: event.clientX, y: event.clientY })}
      >
        {children}
      </svg>
      {/* Laid over the map, not drawn in it, so a pin stays one size at any zoom. */}
      <div className="tv-pins" aria-hidden="true">
        {pins.map((pin) => (
          <div
            key={pin.code}
            className={`tv-pin${pin.kind ? ` ${pin.kind}` : ''}`}
            style={{
              left: `${((pin.x - (view.cx - width / 2)) / width) * 100}%`,
              top: `${((pin.y - (view.cy - height / 2)) / height) * 100}%`,
            }}
          >
            {pin.name ? <span className="tv-pin-name">{pin.name}</span> : null}
            <span className="tv-pin-head" />
          </div>
        ))}
      </div>
      <div className="tv-zoom">
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={view.k >= CLOSEST} onClick={() => zoom(STEP)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={view.k <= FURTHEST} onClick={() => zoom(1 / STEP)}>
          &minus;
        </button>
        {view.k !== 1 ? (
          <button type="button" className="fit" aria-label={fitLabel} title={fitLabel} onClick={() => setView(middle)}>
            Fit
          </button>
        ) : null}
      </div>
    </div>
  );
}

