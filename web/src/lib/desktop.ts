/**
 * In the desktop app the page lives at `app://scryproof`, which is not an
 * address anybody can visit and not where the gateway listens. The app tells
 * the page which server it was built for; in a browser none of this exists and
 * the address bar is the answer.
 */

import { newerDesktopRelease } from './desktop-version';

interface DesktopBridge {
  server: string;
  gateway: string;
  /** The installed shell's own version, from its package.json. Absent in older shells. */
  shell?: string;
  /** The shell permits isolated Activities frames. Older shells do not. */
  activities?: boolean;
  /** Absent in shells built before updates existed. */
  updateState?: () => Promise<number | null>;
  onUpdateReady?: (listener: (version: number) => void) => void;
  applyUpdate?: () => Promise<boolean>;
  /** Absent in shells built before the app could update itself (0.4.0 and older). */
  shellUpdateState?: () => Promise<string | null>;
  onShellUpdateReady?: (listener: (version: string) => void) => void;
  applyShellUpdate?: () => Promise<boolean>;
  /** Absent in shells built before global push-to-talk. */
  watchPushKey?: (code: string | null) => Promise<boolean>;
  onPushHold?: (listener: (held: boolean) => void) => () => void;
  /** Absent in shells built before the interface scale. */
  setZoom?: (factor: number) => void;
  /** Absent in shells built before the in-app share picker (0.5.1 and older), which show a menu of their own. */
  onShareRequest?: (open: (request: ShareRequest) => void, close: () => void) => () => void;
  answerShare?: (answer: { id: string; withSound: boolean } | null) => Promise<boolean>;
  refreshShare?: () => Promise<ShareSource[] | null>;
  /** Absent in shells built before the Mac app (0.5.x). */
  platform?: 'darwin' | 'win32' | 'linux';
  permissionState?: () => Promise<PermissionState>;
  openPermissionSettings?: (which: 'accessibility' | 'screen') => Promise<void>;
  /** 'download' when the app cannot replace itself (its folder is not writable): the shell opens the download link instead. */
  shellUpdateHow?: () => Promise<'restart' | 'download'>;
}

/** What macOS has let the app do. The page only explains; the shell asks. */
export interface PermissionState {
  /** Needed to hear the push-to-talk key while another app is in front. */
  accessibility: boolean;
  /** Needed to share a screen or window. */
  screen: 'granted' | 'denied' | 'not-determined' | 'unknown';
}

/** One screen or window the desktop app can share, as its shell describes it. */
export interface ShareSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** A small picture of it, as a data URL; null for a minimised window. */
  thumbnail: string | null;
  /** The window's app icon, as a data URL, where there is one. */
  icon: string | null;
}

/** What the shell asks the page to choose from when it wants to share. */
export interface ShareRequest {
  sources: ShareSource[];
  /** Where the switch starts, or null when sound cannot go with this share. */
  sound: boolean | null;
  soundLabel: string;
}

const bridge = typeof window === 'undefined' ? null : (window as { scryproofDesktop?: DesktopBridge }).scryproofDesktop ?? null;

export const isDesktop = bridge !== null;
export const canEmbedActivities = !bridge || bridge.activities === true;
export const canInstallShellUpdate = typeof bridge?.applyShellUpdate === 'function';

/** The app on a Mac. False in a browser, and in a shell too old to say. */
export const onMacApp = bridge?.platform === 'darwin';

/**
 * Whether this page is on a Mac, from the platform string a browser reports.
 * An iPad asking for the desktop site says "MacIntel" too, but has a touch
 * screen and no Mac app to download.
 */
export function isMacPlatform(
  platform: string = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '',
  touchPoints: number = navigator.maxTouchPoints ?? 0,
): boolean {
  return /^mac/i.test(platform) && touchPoints < 2;
}

export interface DesktopDownload {
  href: string;
  /** What to call it. The Mac build is Apple silicon only, and Safari says MacIntel on both kinds of Mac. */
  system: 'Mac (Apple silicon)' | 'Windows';
}

/**
 * Where the desktop app for this computer is downloaded, and what to call it.
 * The Mac gets the disk image; everyone else keeps the Windows installer.
 */
export function desktopDownload(mac: boolean = onMacApp || isMacPlatform()): DesktopDownload {
  return mac
    ? { href: `${publicOrigin()}/download/Scryproof.dmg`, system: 'Mac (Apple silicon)' }
    : { href: `${publicOrigin()}/download/Scryproof-Setup.exe`, system: 'Windows' };
}

/** Zoom the whole window, where the app can. False in a browser or an older shell. */
export const canZoom = typeof bridge?.setZoom === 'function';
export const setZoom = (factor: number): void => bridge?.setZoom?.(factor);

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

/**
 * Ask the shell to hear one key system-wide, so push-to-talk keeps working
 * with a game in front. Resolves to a function that stops it, or null when
 * this is a browser or an older shell, in which case the window's own key
 * events are all there is.
 */
export async function holdPushKey(code: string, onHold: (held: boolean) => void): Promise<(() => void) | null> {
  if (!bridge?.watchPushKey || !bridge.onPushHold) return null;
  const unlisten = bridge.onPushHold(onHold);
  const watched = await bridge.watchPushKey(code).catch(() => false);
  if (!watched) {
    unlisten();
    return null;
  }
  return () => {
    unlisten();
    void bridge.watchPushKey?.(null);
  };
}

/**
 * Tell `listener` when a newer installer for the app itself has been fetched
 * and checked by the shell. Never in a browser or an older shell.
 */
export function onShellUpdate(listener: () => void): void {
  if (!bridge?.shellUpdateState || !bridge.onShellUpdateReady) return;
  bridge.onShellUpdateReady(() => listener());
  void bridge.shellUpdateState().then((version) => {
    if (version !== null) listener();
  });
}

/**
 * How a waiting installer gets installed. 'restart' is the usual way: the app
 * closes, swaps itself and opens again. 'download' is a Mac app that cannot
 * replace itself (it was dragged somewhere it may not write): the shell then
 * opens the download link. A shell that does not say always meant 'restart'.
 */
export async function shellUpdateHow(): Promise<'restart' | 'download'> {
  try {
    return (await bridge?.shellUpdateHow?.()) === 'download' ? 'download' : 'restart';
  } catch {
    return 'restart';
  }
}

/**
 * Manual fallback only for shells without automatic installer support. The
 * manifest it reads is the Windows installer's; the Mac app updates from its
 * own Mac manifest and never offers (or compares against) that installer.
 */
export function onDesktopRelease(listener: (version: string) => void): () => void {
  if (!bridge || onMacApp || canInstallShellUpdate) return () => {};
  let active = true;
  let checking = false;
  const controller = new AbortController();
  const check = async () => {
    if (!active || checking) return;
    checking = true;
    try {
      // /api/ is forwarded by older shells too; a direct cross-origin fetch is not.
      const response = await fetch('/api/desktop/installer', {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) return;
      const manifest = await response.json();
      if (active && newerDesktopRelease(manifest?.version, bridge.shell)) listener(manifest.version);
    } catch {
      // Offline, unpublished, or a partial publish: keep the app usable and retry.
    } finally {
      checking = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), 60_000);
  return () => {
    active = false;
    controller.abort();
    clearInterval(timer);
  };
}

/** Close the app and run the waiting installer, which opens it again. */
export const applyShellUpdate = (): void => {
  void bridge?.applyShellUpdate?.();
};

export const applyClientUpdate = (): void => {
  if (bridge) void bridge.applyUpdate?.();
  else window.location.reload();
};

/**
 * The desktop app's screen-share picker, which the page draws. `open` is
 * called when the shell wants a screen or window chosen, `close` when it has
 * answered for the page. Returns the way to stop, or null in a browser (whose
 * own picker is used) or an older shell (whose menu is).
 */
export function onShareRequest(open: (request: ShareRequest) => void, close: () => void): (() => void) | null {
  if (!bridge?.onShareRequest || !bridge.answerShare) return null;
  return bridge.onShareRequest(open, close);
}

/** The choice: a source id and whether to send sound, or null to cancel. */
export const answerShare = (answer: { id: string; withSound: boolean } | null): void => {
  void bridge?.answerShare?.(answer).catch(() => false);
};

/** Fresh pictures for the open picker, or null once the shell has closed it. */
export const refreshShare = async (): Promise<ShareSource[] | null> => {
  try {
    return (await bridge?.refreshShare?.()) ?? null;
  } catch {
    return null;
  }
};

/** Whether the Mac has said no to hearing keys while another app is in front. */
export const accessibilityMissing = (state: PermissionState | null): boolean => state !== null && !state.accessibility;

/** Whether the Mac has not yet let the app record the screen. 'unknown' is not a no. */
export const screenRecordingMissing = (state: PermissionState | null): boolean =>
  state !== null && (state.screen === 'denied' || state.screen === 'not-determined');

/**
 * What macOS has allowed, once, or null when this is not the Mac app (a
 * browser, Windows, or a shell that predates the question). Never throws.
 */
export async function permissionState(): Promise<PermissionState | null> {
  if (!onMacApp || !bridge?.permissionState) return null;
  try {
    const state = await bridge.permissionState();
    return {
      accessibility: state?.accessibility === true,
      screen: state?.screen === 'granted' || state?.screen === 'denied' || state?.screen === 'not-determined' ? state.screen : 'unknown',
    };
  } catch {
    return null;
  }
}

/**
 * Tell `listener` what macOS has allowed now, and again each time the window
 * is back in front: the way to grant these is a trip to System Settings, and
 * the explanation should clear by itself when the person returns. Returns the
 * way to stop. Silent in a browser, on Windows and in an older shell.
 */
export function watchPermissions(listener: (state: PermissionState) => void): () => void {
  if (!onMacApp || !bridge?.permissionState) return () => {};
  let live = true;
  const look = () => {
    void permissionState().then((state) => {
      if (live && state) listener(state);
    });
  };
  look();
  window.addEventListener('focus', look);
  return () => {
    live = false;
    window.removeEventListener('focus', look);
  };
}

/** Open the macOS settings pane where the person turns the permission on. */
export const openPermissionSettings = (which: 'accessibility' | 'screen'): void => {
  void Promise.resolve(bridge?.openPermissionSettings?.(which)).catch(() => undefined);
};

/**
 * Whether the Mac disk image is on the server yet. The Mac app is published
 * after the page that links to it can be, and a link to a missing file is
 * worse than none.
 */
export async function dmgPublished(fetcher: typeof fetch = (...args) => fetch(...args)): Promise<boolean> {
  try {
    const answer = await fetcher(desktopDownload(true).href, { method: 'HEAD', cache: 'no-store' });
    return answer.status === 200;
  } catch {
    return false;
  }
}

/**
 * A value the page reads as it changes, for `useSyncExternalStore`. `start`
 * runs while somebody is looking and returns the way to stop; it reports each
 * new value through `set`, and the same value again is not a change.
 */
function liveValue<T>(initial: T, start: (set: (next: T) => void) => () => void) {
  let value = initial;
  let stop: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: T) => {
    if (JSON.stringify(next) === JSON.stringify(value)) return;
    value = next;
    listeners.forEach((listener) => listener());
  };
  return {
    get: (): T => value,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      stop ??= start(set);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = null;
        }
      };
    },
  };
}

/**
 * The download link to show, or null while the Mac disk image is not known to
 * be there. Only a Mac browser asks: the Mac app is already installed and has
 * no use for the link (and its page is on another origin than the server, so
 * the question would be refused anyway).
 */
export function downloadLink(mac: boolean, fetcher?: typeof fetch, inApp: boolean = isDesktop) {
  let asked = false;
  return liveValue<DesktopDownload | null>(mac ? null : desktopDownload(false), (set) => {
    // One question for the life of the page, however often the link is shown.
    if (mac && !inApp && !asked) {
      asked = true;
      void dmgPublished(fetcher).then((there) => there && set(desktopDownload(true)));
    }
    return () => {};
  });
}

// Importing the bridge must not read a browser location or platform. React
// reads/subscribes later, when the page is present; keep one stable store.
let downloads: ReturnType<typeof downloadLink> | null = null;
const downloadsForPage = () => downloads ??= downloadLink(onMacApp || isMacPlatform());
export const downloadStore = {
  get: (): DesktopDownload | null => downloadsForPage().get(),
  subscribe: (listener: () => void): (() => void) => downloadsForPage().subscribe(listener),
};

/** What macOS has allowed, kept up to date while something shows it. */
export const permissionStore = liveValue<PermissionState | null>(null, (set) => watchPermissions(set));

/**
 * Call `listener` each time Accessibility goes from refused to granted. The
 * shell does not start the key hook without the grant, so push-to-talk asked
 * before it was given has to ask again once the person comes back from System
 * Settings. Only a seen refusal counts: a grant that was there from the start
 * is not news. Silent in a browser, on Windows and in an older shell.
 */
export function onAccessibilityGranted(listener: () => void): () => void {
  let refused = false;
  const look = () => {
    const state = permissionStore.get();
    if (!state) return;
    if (!state.accessibility) refused = true;
    else if (refused) {
      refused = false;
      listener();
    }
  };
  // The store only tells of changes; somebody else may already have it
  // showing a refusal, so read where it stands now as well.
  const stop = permissionStore.subscribe(look);
  look();
  return stop;
}

/** How the waiting installer gets installed, once the shell has one ready; null before. */
let shellListening = false;
export const shellUpdateStore = liveValue<'restart' | 'download' | null>(null, (set) => {
  // The shell's listener cannot be taken off again, so it is added once.
  if (!shellListening) {
    shellListening = true;
    onShellUpdate(() => void shellUpdateHow().then(set));
  }
  return () => {};
});
