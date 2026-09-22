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

const SITE_CHECK_MS = 10 * 60_000;

/** The script this page was loaded with. A new build has a new name. */
function loadedScript(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return script ? new URL(script.src, window.location.href).pathname : null;
}

/**
 * In a browser there is nothing to fetch or check: the site is simply the
 * newest files each time it is loaded. But a tab left open all day keeps
 * running the morning's build, so every ten minutes the page asks for the
 * front page again and looks at which script it names. Different name, newer
 * site, same bar as the desktop app. The reload is the person's click.
 */
function watchSite(listener: () => void): void {
  const mine = loadedScript();
  if (!mine) return;
  const look = async () => {
    try {
      const html = await (await fetch('/', { cache: 'no-store', credentials: 'omit' })).text();
      const named = html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1];
      if (named && new URL(named, window.location.href).pathname !== mine) {
        clearInterval(timer);
        listener();
      }
    } catch {
      // Offline, or the server is down. Ask again later.
    }
  };
  const timer = setInterval(() => void look(), SITE_CHECK_MS);
}

/**
 * Tell `listener` when there is a newer client to switch to. In the app the
 * main process fetches and checks it; all the page does is choose the moment,
 * because a reload in the middle of a call hangs up on everyone. In a browser
 * the site itself is watched (above).
 */
export function onClientUpdate(listener: () => void): void {
  if (!bridge) return watchSite(listener);
  if (!bridge.updateState || !bridge.onUpdateReady) return;
  bridge.onUpdateReady(() => listener());
  void bridge.updateState().then((version) => {
    if (version !== null) listener();
  });
}

export const applyClientUpdate = (): void => {
  if (bridge) void bridge.applyUpdate?.();
  else window.location.reload();
};
