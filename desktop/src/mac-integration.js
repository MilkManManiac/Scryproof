/**
 * The parts of the Mac build that are decisions rather than Electron calls:
 * which permission panes the page may be sent to, what the page is told about
 * the permissions, the app menu, and whether a start was a login start. Taking
 * Electron's objects as arguments keeps them testable without a Mac.
 *
 * Everything here is reached only on darwin, except `startsHidden`, which also
 * answers the Windows `--hidden` flag exactly as `main.js` always did.
 */

/** The System Settings panes the page may ask to open. Fixed here: the page names one, never a URL. */
export const PERMISSION_PANES = Object.freeze({
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
});

/** Electron's screen status, in the words the page knows. `restricted` (a managed Mac) reads as denied. */
const SCREEN = { granted: 'granted', denied: 'denied', restricted: 'denied', 'not-determined': 'not-determined' };

/**
 * What the page is told about permissions. Looking never prompts. Off the Mac
 * there is nothing to grant: Accessibility counts as there and the screen is
 * "unknown", which the page reads as "do not explain anything".
 */
export function permissionState({ platform, systemPreferences }) {
  if (platform !== 'darwin') return { accessibility: true, screen: 'unknown' };
  let screen;
  try {
    screen = SCREEN[systemPreferences.getMediaAccessStatus('screen')] ?? 'unknown';
  } catch {
    screen = 'unknown';
  }
  return { accessibility: systemPreferences.isTrustedAccessibilityClient(false) === true, screen };
}

/**
 * The page's two permission requests. Only our own page is answered (`ours`);
 * anyone else gets null, and nothing is opened for them.
 */
export function armPermissionIpc(ipcMain, ours, { platform, systemPreferences, shell }) {
  ipcMain.handle('scryproof:perm-state', (event) => (ours(event) ? permissionState({ platform, systemPreferences }) : null));
  ipcMain.handle('scryproof:perm-open', async (event, which) => {
    if (!ours(event) || platform !== 'darwin') return null;
    if (typeof which !== 'string' || !Object.prototype.hasOwnProperty.call(PERMISSION_PANES, which)) return null;
    await shell.openExternal(PERMISSION_PANES[which]);
    return null;
  });
}

/**
 * The standard Mac menu bar: App (about, hide, Quit with Cmd-Q), Edit (so
 * Cmd-C, Cmd-V and undo work in text boxes), View and Window. The View menu is
 * only full screen in an installed copy: reload and developer tools are for a
 * development run, because developer tools are a way to run code in the page,
 * which is where the keys are.
 */
export function appMenuTemplate({ packaged }) {
  return [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: packaged
        ? [{ role: 'togglefullscreen' }]
        : [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ];
}

/**
 * Whether this start should open with no window. Windows passes `--hidden` from
 * its Run entry. macOS cannot pass arguments to a login item (Electron 44 only
 * takes them on Windows); it reports `wasOpenedAtLogin` instead.
 */
export function startsHidden({ platform, argv, loginSettings }) {
  if (argv.includes('--hidden')) return true;
  return platform === 'darwin' && loginSettings?.wasOpenedAtLogin === true;
}
