/**
 * In the desktop app the page lives at `app://scryproof`, which is not an
 * address anybody can visit and not where the gateway listens. The app tells
 * the page which server it was built for; in a browser none of this exists and
 * the address bar is the answer.
 */

interface DesktopBridge {
  server: string;
  gateway: string;
  /** The installed shell's own version, from its package.json. Absent in older shells. */
  shell?: string;
  /** Absent in shells built before updates existed. */
  updateState?: () => Promise<number | null>;
  onUpdateReady?: (listener: (version: number) => void) => void;
  applyUpdate?: () => Promise<boolean>;
}

const bridge = (window as { scryproofDesktop?: DesktopBridge }).scryproofDesktop ?? null;

export const isDesktop = bridge !== null;

declare const __BUILD__: { commit: string; at: number };

/** What is on the screen: the client build, and in the app, the shell around it. */
export function buildLabel(): string {
  const at = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(__BUILD__.at),
  );
  const client = `build ${__BUILD__.commit}, ${at}`;
  return bridge ? `${client} · app ${bridge.shell || 'older than this build'}` : client;
}

/** Where a person with a browser would find this server. */
export const publicOrigin = (): string => bridge?.server || window.location.origin;

export function gatewayUrl(path: string): string {
  if (bridge?.gateway) return bridge.gateway;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${path}`;
}

/**
 * Tell `listener` when the app has a newer client fetched, checked and ready.
 * The checking is the main process's job; all the page does is choose the
 * moment, because a reload in the middle of a call hangs up on everyone.
 */
export function onClientUpdate(listener: () => void): void {
  if (!bridge?.updateState || !bridge.onUpdateReady) return;
  bridge.onUpdateReady(() => listener());
  void bridge.updateState().then((version) => {
    if (version !== null) listener();
  });
}

export const applyClientUpdate = (): void => void bridge?.applyUpdate?.();
