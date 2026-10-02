/**
 * The Mac shell update: fetch, check, stage, swap.
 *
 * Same rule as the Windows installer path in `main.js`, harder: nothing that
 * failed a check is ever run or moved into place; it is deleted. What is
 * checked, in order:
 *
 *   1. the manifest (`installer-mac-arm64.json`) is signed by the Mac update
 *      key baked into this app (Trey's, not Wes's; `update-key-mac.pub.pem`),
 *      and is for this arch and a newer version than the one running;
 *   2. the zip is exactly the size and sha256 the manifest was signed with;
 *   3. the extracted bundle passes `codesign --verify --deep --strict`, is
 *      signed by team LRU27MC63Q, by the same team as the running app, and
 *      says it is the version the manifest said.
 *
 * Everything the outside world supplies (the network, the disk, `ditto` and
 * `codesign`, Electron's relaunch) is passed in as `deps`, so the tests drive
 * the whole flow with stand-ins and none of it needs a Mac. What only a Mac
 * can show: that `codesign` and `ditto` answer as parsed here, and that the
 * swap really leaves a signed app that relaunches.
 */

import { basename, dirname, join } from 'node:path';

import {
  asideOwner,
  bundlePathFor,
  isTranslocated,
  MAC_TEAM_ID,
  macRequirement,
  MAX_MAC_ZIP_BYTES,
  parseTeamId,
  planSwap,
  stagedAppName,
  teamAllowed,
  undoSteps,
  versionFromZipName,
} from './shell-update-mac-core.js';

export { bundlePathFor, MAC_TEAM_ID };

/**
 * Carry out `plan` (from `planSwap`). `io` is `{ rm, rename, run }`.
 * If a step fails, the old bundle is put back and the half-brought new one is
 * removed. Returns `{ ok, error?, restored? }`.
 */
export async function executeSwap(plan, io) {
  if (plan.how !== 'swap') return { ok: false, error: 'not a swap' };
  let at = 0;
  try {
    for (; at < plan.steps.length; at += 1) {
      const step = plan.steps[at];
      if (step.op === 'remove') await io.rm(step.path);
      else if (step.op === 'rename') await io.rename(step.from, step.to);
      else if (step.op === 'move') await moveBundle(step.from, step.to, io);
    }
    return { ok: true };
  } catch (error) {
    let restored = true;
    for (const undo of undoSteps(plan, at)) {
      try {
        await io.rename(undo.from, undo.to);
      } catch {
        restored = false;
      }
    }
    await io.rm(plan.incoming).catch(() => {});
    return { ok: false, error: error instanceof Error ? error.message : String(error), restored };
  }
}

/** Rename `from` to `to`; across disks (staging is under Application Support, the app may be elsewhere) copy with `ditto` instead, and never leave `to` half there. */
async function moveBundle(from, to, io) {
  try {
    await io.rename(from, to);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    try {
      await io.rm(to);
      const copied = await io.run('ditto', [from, to]);
      if (copied.code !== 0) throw new Error(`ditto failed (${copied.code})`);
    } catch (copyError) {
      await io.rm(to).catch(() => {});
      throw copyError;
    }
    await io.rm(from).catch(() => {});
  }
}

/**
 * An update that died between its two renames leaves the app at
 * `Scryproof.app.old` and nothing at `Scryproof.app`. If this process was
 * started from there, put it back. Returns the executable to start instead, or
 * null when there is nothing to put back. `io` is `{ exists, rename }`.
 */
export async function restoreAside(execPath, io) {
  const found = asideOwner(execPath);
  if (!found || io.exists(found.owner)) return null;
  try {
    await io.rename(found.aside, found.owner);
  } catch {
    return null;
  }
  return found.owner + execPath.slice(found.aside.length);
}

/**
 * The updater for one running app. `deps`:
 *   enabled        whether this build has a Mac key and may update at all
 *   log(message)   one line to the app's log
 *   arch, version  what is running ('arm64', '0.6.0')
 *   appPath        the running .app (`bundlePathFor(exe)`), or null
 *   dir            the shell-update folder under userData
 *   urls           { manifest, zip, dmg }
 *   fetchText(url) the manifest's text, or null
 *   download(url, path, size)   size-capped download; throws on any trouble
 *   readManifest(raw)           the manifest if the Mac key signed it, else null
 *   isNewer(a, b)
 *   hashFile(path), stat(path)  the file's sha256 and { size }
 *   lstat(path)                 for the staged app: a plain folder, not a link
 *   run(cmd, args)              { code, stdout, stderr }
 *   fs                          { mkdir, rm, readdir, rename, writable(folder) }
 *   onReady(version)            tell the page
 *   openExternal(url)           open the DMG link
 *   relaunchAndQuit(appPath)    app.relaunch() and app.quit()
 */
export function createMacShellUpdater(deps) {
  const { fs, run, log } = deps;
  const staging = join(deps.dir, 'staging');
  let pending = null;
  let checking = false;
  let applying = false;
  let runningTeam;

  /**
   * Everything that touches staging or the bundle runs one at a time: unpacking
   * a newer release, the swap, and the launch tidy. A download is not one of
   * them (it writes only its own part file), so a click on Restart waits for an
   * unpack and its checks, seconds, never for a whole download.
   */
  let chain = Promise.resolve();
  const locked = (work) => {
    const ran = chain.then(work);
    chain = ran.catch(() => {});
    return ran;
  };

  const emptyStaging = () => fs.rm(staging).catch(() => {});
  const zipPathFor = (version) => join(deps.dir, `Scryproof-${version}-mac-${deps.arch}.zip`);

  /** The team the running app is signed by, asked once. Null for an ad-hoc or unsigned build. */
  async function ownTeam() {
    if (runningTeam === undefined) {
      const report = await run('codesign', ['-dv', '--verbose=2', deps.appPath]);
      runningTeam = report.code === 0 ? parseTeamId(`${report.stdout}\n${report.stderr}`) : null;
    }
    return runningTeam;
  }

  function fail(message) {
    log(`shell update refused: ${message}`);
    return false;
  }

  /**
   * Whether the bundle at `appDir` may be run: a real folder (not a link), signed
   * whole and through Apple's chain as Scryproof by our team, by the running
   * app's team, and the version its manifest said.
   */
  async function bundleOk(appDir, version) {
    const info = await deps.lstat(appDir).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return fail('the update is not a plain app folder');
    const strict = await run('codesign', ['--verify', '--deep', '--strict', `-R=${macRequirement()}`, appDir]);
    if (strict.code !== 0) return fail(`codesign refused the update: ${strict.stderr.trim()}`);
    const report = await run('codesign', ['-dv', '--verbose=2', appDir]);
    const team = report.code === 0 ? parseTeamId(`${report.stdout}\n${report.stderr}`) : null;
    if (!teamAllowed(team, await ownTeam())) return fail(`update is signed by team ${team}, this app by ${await ownTeam()}`);
    const plist = await run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(appDir, 'Contents', 'Info.plist')]);
    if (plist.code !== 0 || plist.stdout.trim() !== version) return fail('update says it is another version than its manifest');
    return true;
  }

  /** Whether this app can replace itself where it sits. */
  async function how() {
    const appPath = deps.appPath;
    if (!appPath || isTranslocated(appPath)) return 'download';
    const writable = await fs.writable(dirname(appPath)).catch(() => false);
    return planSwap({ appPath, stagedPath: join(staging, basename(appPath)), writable, translocated: false }).how === 'swap'
      ? 'restart'
      : 'download';
  }

  /** Is the zip at `path` exactly what the manifest was signed for? */
  async function zipOk(path, manifest) {
    try {
      if ((await deps.stat(path)).size !== manifest.size) return false;
      return (await deps.hashFile(path)) === manifest.sha256;
    } catch {
      return false;
    }
  }

  /** Unpack and check `zip`, and make it the waiting update. Runs under the lock. */
  async function stage(manifest, zip) {
    // The app is on its way out, or already replaced: nothing is staged for it.
    if (applying) return false;
    // Always extracted afresh: what is on disk in staging is never trusted from
    // before. A bundle that was waiting goes with it; it is staged again if this fails.
    if (pending?.staged) await fs.rm(zipPathFor(pending.version));
    pending = null;
    try {
      await emptyStaging();
      await fs.mkdir(staging);
      const unzipped = await run('ditto', ['-x', '-k', zip, staging]);
      if (unzipped.code !== 0) return fail(`could not unpack the update (${unzipped.code})`);
      const name = stagedAppName(await fs.readdir(staging));
      if (!name) return fail('the update does not hold exactly one app');
      const appDir = join(staging, name);
      if (!(await bundleOk(appDir, manifest.version))) {
        await fs.rm(zip);
        return false;
      }
      pending = { version: manifest.version, staged: appDir, manifest };
      deps.onReady(manifest.version);
      return true;
    } finally {
      if (!pending) await emptyStaging();
    }
  }

  async function check() {
    if (!deps.enabled || !deps.appPath || checking || applying) return;
    checking = true;
    const part = join(deps.dir, 'mac-update.part');
    try {
      const raw = await deps.fetchText(deps.urls.manifest);
      if (raw === null) return;
      const manifest = deps.readManifest(raw);
      // Forward only, for this arch, and nothing already waiting is fetched twice.
      if (!manifest || manifest.arch !== deps.arch || !deps.isNewer(manifest.version, deps.version)) return;
      if (pending && !deps.isNewer(manifest.version, pending.version)) return;
      if (!Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > MAX_MAC_ZIP_BYTES) return;

      // An app that cannot replace itself is only told a newer one exists; the
      // banner then offers the DMG. Nothing is downloaded that nothing could use.
      if ((await how()) === 'download') {
        pending = { version: manifest.version, staged: null };
        deps.onReady(manifest.version);
        return;
      }

      await fs.mkdir(deps.dir);
      const zip = zipPathFor(manifest.version);
      // Fetched on an earlier run: kept only if it is still exactly what was signed.
      if (!(await zipOk(zip, manifest))) {
        await fs.rm(zip);
        await deps.download(deps.urls.zip, part, manifest.size);
        if (!(await zipOk(part, manifest))) {
          fail('the download is not the file that was signed');
          // Nothing that failed stays in staging; a bundle already waiting is not touched.
          await locked(async () => { if (!pending?.staged) await emptyStaging(); });
          return;
        }
        await fs.rename(part, zip);
      }
      await locked(() => stage(manifest, zip));
    } catch (error) {
      // Offline, or the server is mid-publish: ask again later.
      log(`shell update check stopped: ${error instanceof Error ? error.message : error}`);
      await locked(async () => { if (!pending?.staged) await emptyStaging(); }).catch(() => {});
    } finally {
      await fs.rm(part).catch(() => {});
      checking = false;
    }
  }

  /** "Restart to install". True if the app is on its way out, or the DMG link was opened. */
  function apply() {
    return locked(async () => {
      const waiting = pending;
      if (!waiting) return false;
      if ((await how()) === 'download') {
        deps.openExternal(deps.urls.dmg);
        return true;
      }
      if (!waiting.staged) return false;
      // Checked again from scratch: the bundle sat on disk since it was verified.
      if (!deps.isNewer(waiting.version, deps.version) || !(await bundleOk(waiting.staged, waiting.version))) {
        pending = null;
        await emptyStaging();
        return false;
      }
      const plan = planSwap({ appPath: deps.appPath, stagedPath: waiting.staged, writable: true, translocated: false });
      applying = true;
      const swapped = await executeSwap(plan, { rm: fs.rm, rename: fs.rename, run });
      if (!swapped.ok) {
        applying = false;
        // An app that cannot swap itself (a root-owned leftover, App Management) would otherwise
        // ignore every click on Restart. The DMG is the way out, and the log says why it opened.
        log(`shell update swap failed (${swapped.error}); old app ${swapped.restored ? 'put back' : 'NOT put back'}; opening the DMG link instead`);
        deps.openExternal(deps.urls.dmg);
        return true;
      }
      deps.relaunchAndQuit(deps.appPath);
      return true;
    });
  }

  /**
   * At launch, before the first check: the bundle that was set aside by the last
   * update goes, and so do half downloads, an unpacked bundle nobody has
   * verified in this run, a leftover `.incoming`, and a zip for a version that
   * is not newer than the running one. Does nothing while a check runs or an
   * update waits: it would delete what they are using.
   */
  function tidy() {
    return locked(async () => {
      if (!deps.appPath || checking || pending) return;
      await fs.rm(`${deps.appPath}.old`).catch(() => {});
      await fs.rm(`${deps.appPath}.incoming`).catch(() => {});
      await emptyStaging();
      try {
        for (const name of await fs.readdir(deps.dir)) {
          const version = versionFromZipName(name, deps.arch);
          if (name === 'staging') continue;
          if (!version || !deps.isNewer(version, deps.version)) await fs.rm(join(deps.dir, name)).catch(() => {});
        }
      } catch { /* no folder yet */ }
    });
  }

  /** The late pass: only the set-aside bundle, which the process that handed over may have been holding. Never staging, never a download. */
  async function tidyAside() {
    if (deps.appPath) await fs.rm(`${deps.appPath}.old`).catch(() => {});
  }

  return { check, apply, how, tidy, tidyAside, state: () => pending?.version ?? null };
}
