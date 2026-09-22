/*
 * Putting Scryproof on the home screen.
 *
 * A browser that can install the site as an app says so with one event,
 * once, early, before anything is drawn. It is caught here and kept, so
 * that the menu can offer "Install on this device" whenever the person
 * looks, and the prompt appears only when they ask for it. Nothing here
 * nags: no bar, no toast, no asking twice.
 *
 * Inside the desktop app, or once installed, there is nothing to offer.
 */

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  offer = event as InstallPrompt;
  notify();
});
window.addEventListener('appinstalled', () => {
  offer = null;
  notify();
});

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

export const canInstall = (): boolean => offer !== null && !isStandalone();

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Show the browser's own install dialog. Resolves once the person has answered it. */
export async function install(): Promise<void> {
  const current = offer;
  if (!current) return;
  await current.prompt();
  const { outcome } = await current.userChoice;
  if (outcome === 'accepted') {
    offer = null;
    notify();
  }
}

/** The worker that makes the site installable. Registered after load, so it never slows the first paint. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A browser that refuses is a browser that will not install the app either. Nothing lost.
    });
  });
}
