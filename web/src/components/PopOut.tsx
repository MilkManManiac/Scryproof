/*
 * Streams in windows of their own, to put on another screen. Wes, 2026-10-12:
 * "Make it so streams can be popped out, so i can watch on separate screens."
 *
 * The window is opened and drawn from this page (a portal into it), so it is
 * part of the same call: no second sign-in, no second connection, the sound
 * stays in this page's mix. It lives above the voice view, so switching to a
 * text channel keeps it open. It closes when the stream stops playing here,
 * when the call ends, or when this page goes away. Double-click: full screen.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { canPopOut } from '../lib/desktop';
import type { VoiceVideo } from '../lib/voice-session';
import { useStore } from '../state/store';
import { useVoice } from '../state/useVoice';

interface Popped {
  key: string;
  win: Window;
}

let popped: Popped[] = [];
const listeners = new Set<() => void>();
const set = (next: Popped[]): void => {
  popped = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const keyOf = (video: VoiceVideo): string => `${video.userId}:${video.source}`;

export { canPopOut };

/** Open this stream in its own window, or bring its window forward if it has one. */
export function popOut(video: VoiceVideo, title: string): void {
  const key = keyOf(video);
  const open = popped.find((entry) => entry.key === key && !entry.win.closed);
  if (open) return open.win.focus();
  // The name is what the desktop app lets open (desktop/src/main.js, streamWindow).
  const win = window.open('', `scryproof-stream-${video.userId}-${video.source}`, 'popup,width=1280,height=720');
  if (!win) return;
  win.document.title = title;
  const { body } = win.document;
  body.style.margin = '0';
  body.style.background = '#000';
  body.style.overflow = 'hidden';
  const entry = { key, win };
  win.addEventListener('pagehide', () => set(popped.filter((other) => other !== entry)));
  set([...popped.filter((other) => other.key !== key), entry]);
}

const closeAll = (): void => {
  for (const entry of popped) entry.win.close();
};

/** Draws every popped-out stream into its window. Mounted once, beside the shell. */
export function PopOuts() {
  const list = useSyncExternalStore(subscribe, () => popped);
  const voice = useVoice();
  const playing = (key: string): VoiceVideo | undefined =>
    voice.videos.find((video) => keyOf(video) === key && video.state === 'playing');

  useEffect(() => {
    for (const entry of list) if (!playing(entry.key)) entry.win.close();
  });
  useEffect(() => {
    window.addEventListener('pagehide', closeAll);
    return () => {
      window.removeEventListener('pagehide', closeAll);
      closeAll();
    };
  }, []);

  return (
    <>
      {list.map((entry) => {
        const video = playing(entry.key);
        return video ? createPortal(<PoppedVideo key={video.sid} video={video} />, entry.win.document.body) : null;
      })}
    </>
  );
}

function PoppedVideo({ video }: { video: VoiceVideo }) {
  const { voice: session } = useStore();
  const element = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = element.current;
    if (!el) return undefined;
    const undo = session.popOutVideo(video.userId, video.source, el);
    const doc = el.ownerDocument;
    const toggle = (): void =>
      void (doc.fullscreenElement ? doc.exitFullscreen() : doc.documentElement.requestFullscreen()).catch(() => undefined);
    el.addEventListener('dblclick', toggle);
    return () => {
      el.removeEventListener('dblclick', toggle);
      undo();
    };
  }, [session, video.userId, video.source, video.sid]);

  return (
    <video
      ref={element}
      autoPlay
      playsInline
      muted
      title="Double-click for full screen"
      style={{ display: 'block', width: '100vw', height: '100vh', objectFit: 'contain', background: '#000' }}
    />
  );
}
