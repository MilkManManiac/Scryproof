/**
 * In the desktop app the page lives at `app://scryproof`, which is not an
 * address anybody can visit and not where the gateway listens. The app tells
 * the page which server it was built for; in a browser none of this exists and
 * the address bar is the answer.
 */

interface DesktopBridge {
  server: string;
  gateway: string;
}

const bridge = (window as { scryproofDesktop?: DesktopBridge }).scryproofDesktop ?? null;

export const isDesktop = bridge !== null;

/** Where a person with a browser would find this server. */
export const publicOrigin = (): string => bridge?.server || window.location.origin;

export function gatewayUrl(path: string): string {
  if (bridge?.gateway) return bridge.gateway;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}${path}`;
}
