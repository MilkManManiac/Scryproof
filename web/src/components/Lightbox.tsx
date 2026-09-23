/*
 * A picture, held up to the light.
 *
 * Click any image in a message and it fills the screen. Scroll to zoom
 * around the pointer, drag to move once zoomed, double-click to fit it
 * again, Escape or a click on the dark around it to put it down. A single
 * click on the picture does nothing: it used to flip between fitted and
 * actual size, and the end of every drag counted as that click, so moving
 * a zoomed picture snapped it back. Copy puts the picture on the clipboard;
 * Save downloads it under its own name.
 *
 * It takes a URL and a name and nothing else, so it works the same for a
 * channel attachment (a URL on our API) and a DM picture (a blob this
 * browser just decrypted). Nothing here fetches from anywhere but that URL.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { fitScale, wheelFactor, zoomAround, type View } from '../lib/zoom';

export interface Picture {
  url: string;
  name: string;
}

/* A one-slot store: the picture being looked at, or nothing. */
let current: Picture | null = null;
const listeners = new Set<() => void>();

export function openPicture(picture: Picture): void {
  current = picture;
  for (const listener of listeners) listener();
}

// For the screenshot script, which has no picture in its seed data to click.
if (import.meta.env.DEV) (window as unknown as { __openPicture: typeof openPicture }).__openPicture = openPicture;

function closePicture(): void {
  current = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Lightbox() {
  const picture = useSyncExternalStore(subscribe, () => current);
  if (!picture) return null;
  return <LightboxView picture={picture} onClose={closePicture} />;
}

type CopyState = 'idle' | 'working' | 'done' | 'failed';

function LightboxView({ picture, onClose }: { picture: Picture; onClose: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [copied, setCopied] = useState<CopyState>('idle');
  const drag = useRef<{ x: number; y: number; moved: boolean; onBackdrop: boolean } | null>(null);

  const box = () => {
    const element = stage.current;
    return element ? { width: element.clientWidth, height: element.clientHeight } : { width: 1, height: 1 };
  };

  const fit = useCallback(() => {
    if (!natural) return;
    setView({ scale: fitScale(natural, box()), x: 0, y: 0 });
  }, [natural]);

  useEffect(fit, [fit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '0') fit();
      if (event.key === '+' || event.key === '=') setView((v) => (v ? zoomAround(v, v.scale * 1.25, { x: 0, y: 0 }) : v));
      if (event.key === '-') setView((v) => (v ? zoomAround(v, v.scale / 1.25, { x: 0, y: 0 }) : v));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
    };
  }, [onClose, fit]);

  // The wheel is taken by the stage, not the page: React's own listener is
  // passive, and a passive listener cannot stop the page behind from scrolling.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const at = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
      setView((v) => (v ? zoomAround(v, v.scale * wheelFactor(event.deltaY), at) : v));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  /** Bigger than fitted: only then is there anything to drag into view. */
  const zoomed = (v: View | null): boolean => Boolean(v && natural && v.scale > fitScale(natural, box()) + 0.001);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      onBackdrop: event.target === event.currentTarget,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    start.x = event.clientX;
    start.y = event.clientY;
    setView((v) => (v && zoomed(v) ? { ...v, x: v.x + dx, y: v.y + dy } : v));
  };
  // Closing is decided here, not in a click handler: the stage captures the
  // pointer, so a drag that began on the picture ends with a click whose
  // target is the stage, and that looked exactly like a click on the dark.
  const onPointerUp = (event: React.PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start || start.moved) return;
    if (start.onBackdrop) {
      onClose();
      return;
    }
    // A finger has no wheel and no keyboard: a tap on the picture zooms in
    // around it, and a tap when zoomed fits it again. A mouse click does
    // nothing, on purpose: it kept firing at the end of a drag.
    if (event.pointerType !== 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const at = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    setView((v) => {
      if (!v || !natural) return v;
      return zoomed(v) ? { ...v, scale: fitScale(natural, box()), x: 0, y: 0 } : zoomAround(v, v.scale * 2.5, at);
    });
  };

  async function copy() {
    setCopied('working');
    try {
      const response = await fetch(picture.url);
      let blob = await response.blob();
      // The clipboard takes PNG and little else, so anything else is redrawn.
      if (blob.type !== 'image/png') blob = await asPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied('done');
      setTimeout(() => setCopied('idle'), 1500);
    } catch {
      setCopied('failed');
      setTimeout(() => setCopied('idle'), 2500);
    }
  }

  const percent = view ? Math.round(view.scale * 100) : null;

  return (
    <div className="lightbox" role="dialog" aria-label={picture.name}>
      <div className="lightbox-bar">
        <span className="lightbox-name" title={picture.name}>
          {picture.name}
        </span>
        <span className="lightbox-size">
          {natural ? `${natural.width}×${natural.height}` : ''}
          {percent !== null ? ` · ${percent}%` : ''}
        </span>
        <span className="lightbox-tools">
          <button type="button" className="button secondary inline" onClick={() => void copy()} disabled={copied === 'working'}>
            {copied === 'done' ? 'Copied' : copied === 'failed' ? 'Could not copy' : 'Copy'}
          </button>
          <a className="button secondary inline" href={picture.url} download={picture.name}>
            Save
          </a>
          <button type="button" className="icon-button lightbox-close" title="Close (Esc)" onClick={onClose}>
            &#10005;
          </button>
        </span>
      </div>
      <div
        className="lightbox-stage"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) fit();
        }}
      >
        <img
          className="lightbox-image"
          src={picture.url}
          alt={picture.name}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            setNatural({ width: image.naturalWidth, height: image.naturalHeight });
          }}
          style={
            view && natural
              ? {
                  width: natural.width,
                  height: natural.height,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                  cursor: zoomed(view) ? 'grab' : 'default',
                }
              : { visibility: 'hidden' }
          }
        />
      </div>
    </div>
  );
}

function asPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      canvas.toBlob((made) => (made ? resolve(made) : reject(new Error('Could not redraw the picture.'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the picture.'));
    };
    image.src = url;
  });
}
