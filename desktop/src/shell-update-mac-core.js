/**
 * The decisions in a Mac shell update that need no Electron and no disk, so
 * `node --test` can run them: where the running app's bundle is, whether it can
 * replace itself, what to rename to what, and what a `codesign` report says.
 * `shell-update-mac.js` does the fetching and the file work around these.
 *
 * The Mac app is replaced the way Sparkle replaces one: the running bundle is
 * renamed aside (a running .app can be renamed; its files stay open), the new
 * bundle is moved into its place, and the app relaunches. If the move fails the
 * old bundle is put back. Next launch deletes the one set aside.
 */

/** The Apple team that signs Scryproof. A staged bundle from any other team is deleted, never run. */
export const MAC_TEAM_ID = 'LRU27MC63Q';

/** The zip is about 100 to 300 MB. Anything far past that is not our zip. */
export const MAX_MAC_ZIP_BYTES = 800 * 1024 * 1024;

/** The `.app` folder an executable sits in (`/Applications/Scryproof.app/Contents/MacOS/Scryproof`), or null if it is not in one. */
export function bundlePathFor(execPath) {
  if (typeof execPath !== 'string') return null;
  const match = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath);
  return match ? match[1] : null;
}

/**
 * Whether the app is running from a place macOS made up for it (Gatekeeper
 * "App Translocation", which is what a quarantined app opened straight from a
 * DMG or the Downloads folder gets). Its real folder is out of reach there, so
 * it cannot replace itself.
 */
export const isTranslocated = (appPath) => typeof appPath === 'string' && appPath.includes('/AppTranslocation/');

/** The team in `codesign -dv` output (`TeamIdentifier=LRU27MC63Q`), or null (`not set` is how an ad-hoc build reports). */
export function parseTeamId(report) {
  const match = /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(typeof report === 'string' ? report : '');
  return match ? match[1] : null;
}

/** A staged bundle may be run only if it is Scryproof's team and the running app's team. */
export const teamAllowed = (staged, running) => staged !== null && staged === MAC_TEAM_ID && staged === running;

/**
 * What to do with a staged bundle, as the exact steps. `how: 'download'` means
 * the app cannot replace itself (translocated, or its folder is not writable,
 * as when it runs from the DMG): the page offers the DMG instead. Otherwise
 * `steps` run in order and nothing in them touches a path outside `appPath`'s
 * folder except the staged bundle that is moved out of staging.
 */
export function planSwap({ appPath, stagedPath, writable, translocated }) {
  if (!appPath || !stagedPath) return { how: 'download' };
  if (translocated || !writable) return { how: 'download' };
  const aside = `${appPath}.old`;
  return {
    how: 'swap',
    aside,
    steps: [
      { op: 'remove', path: aside },
      { op: 'rename', from: appPath, to: aside },
      { op: 'move', from: stagedPath, to: appPath },
    ],
    appPath,
  };
}

/**
 * What puts things back when step number `failedAt` (0-based) of `plan` failed.
 * Only once the running bundle has been set aside and the new one is not yet in
 * place is there anything to undo: the old bundle goes back where it was.
 */
export function undoSteps(plan, failedAt) {
  const asideAt = plan.steps.findIndex((step) => step.op === 'rename');
  const moveAt = plan.steps.findIndex((step) => step.op === 'move');
  if (failedAt > asideAt && failedAt <= moveAt) return [{ op: 'rename', from: plan.aside, to: plan.appPath }];
  return [];
}

/** The version a zip in the shell-update folder is for, from its name, or null. */
export function versionFromZipName(name, arch = 'arm64') {
  const match = new RegExp(`^Scryproof-(\\d{1,9}\\.\\d{1,9}\\.\\d{1,9})-mac-${arch}\\.zip$`).exec(name);
  return match ? match[1] : null;
}

/** The staged app's name among what `ditto` extracted: exactly one `.app`, or null. */
export function stagedAppName(entries) {
  const apps = entries.filter((name) => name.endsWith('.app'));
  return apps.length === 1 ? apps[0] : null;
}
