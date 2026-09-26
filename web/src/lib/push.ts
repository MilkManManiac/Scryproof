/**
 * Phone notifications, this device's half: turning them on, keeping the
 * server's copy of this device's mutes and sound settings current, clearing the number on the
 * icon when the app is opened, and telling the server whether anybody is
 * looking at this window (so a phone is not woken for a message its person is
 * already reading at their desk).
 *
 * The server's half, and the rule that the ping carries nothing, are in
 * `server/src/services/push.ts`. The service worker (`public/sw.js`) draws
 * the notification when a ping lands.
 *
 * An iPhone only offers this to the app added to the home screen, never to a
 * Safari tab. The desktop app keeps its own pop-ups and does not use it.
 */

import type { Notice } from './notices';
import { api } from './api';
import { isDesktop } from './desktop';
import { isStandalone } from './install';
import { notifyPrefs } from './notify';

export type PushAvailability = 'ready' | 'install-first' | 'unsupported';

const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function pushAvailability(): PushAvailability {
  if (isDesktop || !('serviceWorker' in navigator) || typeof Notification === 'undefined') {
    return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  }
  if (!('PushManager' in window)) return isIos() && !isStandalone() ? 'install-first' : 'unsupported';
  return 'ready';
}

/* ----------------------------- on, off, and mutes ---------------------------- */

let on: boolean | null = null;
const listeners = new Set<() => void>();
const changed = (next: boolean): void => {
  on = next;
  for (const listener of listeners) listener();
};

export const pushState = {
  /** Null until this device has been checked. */
  get: (): boolean | null => on,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Fetched ahead, when the switch is drawn, because Safari only asks the
 * person if the asking happens straight from their tap, with nothing awaited
 * in between.
 */
let prepared: { registration: ServiceWorkerRegistration; key: Uint8Array } | null = null;

export async function preparePush(): Promise<void> {
  if (pushAvailability() !== 'ready') return;
  try {
    const [{ publicKey }, registration] = await Promise.all([api.push.key(), navigator.serviceWorker.ready]);
    if (publicKey) prepared = { registration, key: fromBase64Url(publicKey) };
    const existing = await registration.pushManager.getSubscription();
    changed(Boolean(existing) && Notification.permission === 'granted');
  } catch {
    changed(false);
  }
}

/** True once the server has a key; false means this server has push off. */
export const pushConfigured = (): boolean => prepared !== null;

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, at) => byte === key[at]);
}

/**
 * What this device wants to hear about, from the same settings as its in-app
 * sounds: mentions (and direct messages, which count as one), and every other
 * message unless message sounds are off.
 */
const settings = () => {
  const prefs = notifyPrefs.get();
  return {
    mutedServers: prefs.mutedServers,
    mutedChannels: prefs.mutedChannels,
    mentions: prefs.mention,
    messages: prefs.message !== 'off',
  };
};

/** Call straight from a tap. */
export async function enablePush(): Promise<'on' | 'refused' | 'unavailable' | 'failed'> {
  if (!prepared) return 'unavailable';
  const { registration, key } = prepared;
  // First and synchronous: Safari shows the question only while the tap is
  // still happening. Once allowed, subscribing needs no tap.
  const asked = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
  try {
    if ((await asked) !== 'granted') return 'refused';
    let subscription = await registration.pushManager.getSubscription();
    // Made against another server key (a dev server, a key made again): useless here.
    if (subscription && !sameKey(subscription, key)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key as BufferSource,
    });
    await api.push.subscribe({ endpoint: subscription.endpoint, ...settings() });
    changed(true);
    return 'on';
  } catch {
    changed(false);
    return Notification.permission === 'denied' ? 'refused' : 'failed';
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await prepared?.registration.pushManager.getSubscription().catch(() => null);
  if (subscription) {
    await api.push.unsubscribe(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe().catch(() => false);
  }
  changed(false);
}

/**
 * After signing in, and whenever settings change: the server's copy follows this
 * device. Signing in again makes a new session, and a subscription is only
 * honoured while the session that made it lives, so it is handed over.
 */
let syncTimer: number | null = null;
export function startPushSync(): () => void {
  const sync = async () => {
    if (pushAvailability() !== 'ready') return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription || Notification.permission !== 'granted') return;
    await api.push.subscribe({ endpoint: subscription.endpoint, ...settings() }).catch(() => {});
  };
  void sync();
  const stop = notifyPrefs.subscribe(() => {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void sync(), 1000);
  });
  return () => {
    stop();
    if (syncTimer !== null) window.clearTimeout(syncTimer);
  };
}

/* ------------------------- opened: the number goes ------------------------- */

/**
 * Opening the app is reading what woke it. The number on the icon goes, and
 * so do the notifications still sitting on the lock screen.
 */
export function clearWhenOpened(): () => void {
  const clear = () => {
    if (document.visibilityState !== 'visible') return;
    void api.push.seen().catch(() => {});
    void (navigator as { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => {});
    void navigator.serviceWorker
      ?.getRegistration()
      .then((registration) => registration?.getNotifications())
      .then((shown) => shown?.forEach((notification) => notification.close()))
      .catch(() => {});
  };
  clear();
  document.addEventListener('visibilitychange', clear);
  return () => document.removeEventListener('visibilitychange', clear);
}

/* ------------------------------ someone is here ----------------------------- */

/** A computer left on with the window up is not somebody reading it. */
const IDLE_MS = 3 * 60 * 1000;

/**
 * Whether a person is looking at this window. On a phone, on screen and in
 * front is enough: a phone nobody is touching locks itself. On a computer it
 * also needs a key or the mouse in the last few minutes.
 */
export function watchAttention(report: (active: boolean) => void): () => void {
  const pointer = window.matchMedia('(hover: hover)').matches;
  let lastInput = Date.now();
  let last: boolean | null = null;

  const check = () => {
    const active =
      document.visibilityState === 'visible' && document.hasFocus() && (!pointer || Date.now() - lastInput < IDLE_MS);
    if (active === last) return;
    last = active;
    report(active);
  };
  const touched = () => {
    lastInput = Date.now();
    if (!last) check();
  };

  const inputs = ['pointerdown', 'keydown', 'wheel', 'mousemove', 'touchstart'] as const;
  for (const name of inputs) window.addEventListener(name, touched, { passive: true });
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('blur', check);
  const timer = window.setInterval(check, 30_000);
  check();

  return () => {
    for (const name of inputs) window.removeEventListener(name, touched);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    window.removeEventListener('blur', check);
    window.clearInterval(timer);
  };
}

/* ------------------------ tapped: go to the message ------------------------ */

/**
 * What a tapped notification points at. The service worker sends it to an open
 * window, or opens one with it in the address; either way it waits here until
 * the app has loaded enough to go there.
 */
export type PushTarget = Pick<Notice, 'id' | 'serverId' | 'channelId' | 'dmId'> & {
  /** "message" is a channel message that did not mention anyone in particular. */
  kind: Notice['kind'] | 'message';
};

let waiting: PushTarget | null = readFromAddress();
const targetListeners = new Set<() => void>();

function readFromAddress(): PushTarget | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('open');
    if (!raw) return null;
    url.searchParams.delete('open');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    return JSON.parse(raw) as PushTarget;
  } catch {
    return null;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: string; target?: PushTarget } | null;
    if (data?.type !== 'scryproof-open' || !data.target) return;
    waiting = data.target;
    for (const listener of targetListeners) listener();
  });
}

export const pushTargets = {
  take(): PushTarget | null {
    const target = waiting;
    waiting = null;
    return target;
  },
  subscribe(listener: () => void): () => void {
    targetListeners.add(listener);
    return () => targetListeners.delete(listener);
  },
};
