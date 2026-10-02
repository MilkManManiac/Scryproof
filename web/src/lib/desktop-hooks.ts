/**
 * The page's view of the desktop shell, as things React can read.
 */

import { useSyncExternalStore } from 'react';

import { downloadStore, permissionStore, shellUpdateStore } from './desktop';

const read = <T>(store: { subscribe: (listener: () => void) => () => void; get: () => T }): T =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

/** What macOS has allowed, or null where that is not asked (a browser, Windows). */
export const usePermissions = () => read(permissionStore);

/** How a waiting shell update installs, or null when there is none. */
export const useShellUpdate = () => read(shellUpdateStore);

/** The desktop app's download link for this computer, or null when there is none to offer. */
export const useDesktopDownload = () => read(downloadStore);
