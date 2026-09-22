/*
 * A picture, held up to the light.
 *
 * Click any image in a message and it fills the screen. Scroll to zoom
 * around the pointer, drag to move, click the picture to flip between
 * fitted and actual size, Escape or the backdrop to put it down. Copy puts
 * the picture on the clipboard; Save downloads it under its own name.
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
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

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

  /** Fitted and actual size, back and forth, around the click. */
  const toggle = (event: React.MouseEvent) => {
    if (!natural || !view) return;
    const fitted = fitScale(natural, box());
    const rect = stage.current!.getBoundingClientRect();
    const at = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    if (Math.abs(view.scale - fitted) < 0.001 && fitted < 1) setView(zoomAround(view, 1, at));
    else setView({ scale: fitted, x: 0, y: 0 });
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
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
    setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    // A tap on the picture flips its size; a tap on the backdrop is the
    // click handler's, and closes.
    if (start && !start.moved && (event.target as HTMLElement).tagName === 'IMG') toggle(event);
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
        onClick={(event) => {
          // The backdrop puts the picture down; the picture itself does not.
          if (event.target === event.currentTarget) onClose();
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
                  cursor: view.scale > fitScale(natural, box()) + 0.001 ? 'grab' : 'zoom-in',
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
