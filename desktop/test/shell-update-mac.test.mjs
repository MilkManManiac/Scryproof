import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  bundlePathFor,
  asideOwner,
  isTranslocated,
  MAC_TEAM_ID,
  macRequirement,
  parseTeamId,
  planSwap,
  stagedAppName,
  teamAllowed,
  undoSteps,
  versionFromZipName,
} from '../src/shell-update-mac-core.js';
import { createMacShellUpdater, executeSwap, restoreAside } from '../src/shell-update-mac.js';

/* ------------------------------ the pure parts ------------------------------ */

test('the app bundle is found from the executable, and only if there is one', () => {
  assert.equal(bundlePathFor('/Applications/Scryproof.app/Contents/MacOS/Scryproof'), '/Applications/Scryproof.app');
  assert.equal(bundlePathFor('/Users/a b/Apps/Scryproof.app/Contents/MacOS/Scryproof'), '/Users/a b/Apps/Scryproof.app');
  assert.equal(bundlePathFor('/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), '/repo/node_modules/electron/dist/Electron.app');
  assert.equal(bundlePathFor('/usr/bin/node'), null);
  assert.equal(bundlePathFor(undefined), null);
});

test('translocated paths are recognised', () => {
  assert.equal(isTranslocated('/private/var/folders/xy/T/AppTranslocation/ABC-123/d/Scryproof.app'), true);
  assert.equal(isTranslocated('/Applications/Scryproof.app'), false);
});

test('a Team ID is read from a codesign report, and an ad-hoc build has none', () => {
  const signed = 'Executable=/x\nIdentifier=com.scryproof.desktop\nTeamIdentifier=LRU27MC63Q\nSealed Resources version=2\n';
  assert.equal(parseTeamId(signed), 'LRU27MC63Q');
  assert.equal(parseTeamId('Signature=adhoc\nTeamIdentifier=not set\n'), null);
  assert.equal(parseTeamId('Identifier=x\nXTeamIdentifier=LRU27MC63Q'), null);
  assert.equal(parseTeamId(undefined), null);
});

test('a staged bundle runs only if it is our team and the running app\'s team', () => {
  assert.equal(teamAllowed(MAC_TEAM_ID, MAC_TEAM_ID), true);
  assert.equal(teamAllowed('ABCDE12345', 'ABCDE12345'), false, 'a matching team that is not ours');
  assert.equal(teamAllowed(MAC_TEAM_ID, 'ABCDE12345'), false);
  assert.equal(teamAllowed(MAC_TEAM_ID, null), false);
  assert.equal(teamAllowed(null, null), false);
});

test('the swap planner returns the exact steps, or the DMG outcome', () => {
  const base = { appPath: '/Applications/Scryproof.app', stagedPath: '/u/shell-update/staging/Scryproof.app' };
  assert.deepEqual(planSwap({ ...base, writable: true, translocated: false }), {
    how: 'swap',
    aside: '/Applications/Scryproof.app.old',
    incoming: '/Applications/Scryproof.app.incoming',
    appPath: '/Applications/Scryproof.app',
    steps: [
      { op: 'remove', path: '/Applications/Scryproof.app.old' },
      { op: 'remove', path: '/Applications/Scryproof.app.incoming' },
      { op: 'move', from: '/u/shell-update/staging/Scryproof.app', to: '/Applications/Scryproof.app.incoming' },
      { op: 'rename', from: '/Applications/Scryproof.app', to: '/Applications/Scryproof.app.old' },
      { op: 'rename', from: '/Applications/Scryproof.app.incoming', to: '/Applications/Scryproof.app' },
    ],
  });
  assert.deepEqual(planSwap({ ...base, writable: false, translocated: false }), { how: 'download' });
  assert.deepEqual(planSwap({ ...base, writable: true, translocated: true }), { how: 'download' });
  assert.deepEqual(planSwap({ appPath: null, stagedPath: base.stagedPath, writable: true, translocated: false }), { how: 'download' });
});

test('the only moment with no app at its path is between the last two renames', () => {
  const plan = planSwap({ appPath: '/A/S.app', stagedPath: '/st/S.app', writable: true, translocated: false });
  // Whatever can be slow (a copy across disks) comes before the app is set aside.
  assert.equal(plan.steps.findIndex((s) => s.op === 'move') < plan.steps.findIndex((s) => s.op === 'rename'), true);
  assert.deepEqual(plan.steps.slice(-2).map((s) => s.op), ['rename', 'rename']);
});

test('undo puts the old bundle back only between setting it aside and the new one arriving', () => {
  const plan = planSwap({ appPath: '/A/S.app', stagedPath: '/st/S.app', writable: true, translocated: false });
  for (const failedAt of [0, 1, 2, 3]) assert.deepEqual(undoSteps(plan, failedAt), [], `step ${failedAt}`);
  assert.deepEqual(undoSteps(plan, 4), [{ op: 'rename', from: '/A/S.app.old', to: '/A/S.app' }]);
});

test('the signature requirement is pinned to Apple\'s chain, our team and our bundle id', () => {
  const req = macRequirement();
  assert.match(req, /^anchor apple generic and /);
  assert.ok(req.includes('certificate leaf[subject.OU] = "LRU27MC63Q"'));
  assert.ok(req.includes('identifier "com.scryproof.desktop"'));
});

test('a process started from the set-aside bundle is recognised', () => {
  assert.deepEqual(asideOwner('/Applications/Scryproof.app.old/Contents/MacOS/Scryproof'), { owner: '/Applications/Scryproof.app', aside: '/Applications/Scryproof.app.old' });
  assert.equal(asideOwner('/Applications/Scryproof.app/Contents/MacOS/Scryproof'), null);
  assert.equal(asideOwner(undefined), null);
});

test('an update that died between its renames is put back when the app is started from the set-aside copy', async () => {
  const renames = [];
  const io = (exists) => ({ exists: () => exists, rename: async (from, to) => renames.push([from, to]) });
  const exec = '/Applications/Scryproof.app.old/Contents/MacOS/Scryproof';
  assert.equal(await restoreAside(exec, io(false)), '/Applications/Scryproof.app/Contents/MacOS/Scryproof');
  assert.deepEqual(renames, [['/Applications/Scryproof.app.old', '/Applications/Scryproof.app']]);
  assert.equal(await restoreAside(exec, io(true)), null, 'an app is already there: leave both alone');
  assert.equal(await restoreAside('/Applications/Scryproof.app/Contents/MacOS/Scryproof', io(false)), null);
  const broken = { exists: () => false, rename: async () => { throw new Error('EPERM'); } };
  assert.equal(await restoreAside(exec, broken), null);
  assert.equal(renames.length, 1);
});

test('zip names and staged app names', () => {
  assert.equal(versionFromZipName('Scryproof-0.6.1-mac-arm64.zip'), '0.6.1');
  assert.equal(versionFromZipName('Scryproof-0.6.1-mac-x64.zip'), null);
  assert.equal(versionFromZipName('Scryproof-Setup-0.6.1.exe'), null);
  assert.equal(stagedAppName(['Scryproof.app', '__MACOSX']), 'Scryproof.app');
  assert.equal(stagedAppName(['A.app', 'B.app']), null);
  assert.equal(stagedAppName([]), null);
});

/* --------------------------- a world to run it in --------------------------- */

const sha = (text) => createHash('sha256').update(text).digest('hex');
const APP = '/Applications/Scryproof.app';
const DIR = '/u/shell-update';
const STAGING = `${DIR}/staging`;
const ZIP_BYTES = 'the signed zip';
const ZIP = `${DIR}/Scryproof-0.6.1-mac-arm64.zip`;

/** An in-memory disk, `ditto`, `codesign`, `plutil`, network and Electron, with a knob for each thing that can go wrong. */
function world(over = {}) {
  const w = {
    files: new Map([[APP, 'dir'], [`${APP}/Contents`, 'dir']]),
    log: [],
    ready: [],
    opened: [],
    relaunched: [],
    fetched: [],
    commands: [],
    writable: true,
    manifest: { version: '0.6.1', arch: 'arm64', sha256: sha(ZIP_BYTES), size: ZIP_BYTES.length, signature: 'x' },
    served: ZIP_BYTES,
    verifyOk: true,
    stagedTeam: MAC_TEAM_ID,
    runningTeam: MAC_TEAM_ID,
    stagedVersion: '0.6.1',
    failRename: null,
    gate: null,
    downloadGate: null,
    symlinks: new Set(),
    enabled: true,
    appPath: APP,
    ...over,
  };
  const under = (path) => [...w.files.keys()].filter((key) => key === path || key.startsWith(`${path}/`));
  w.fs = {
    mkdir: async (path) => { w.files.set(path, 'dir'); },
    rm: async (path) => { for (const key of under(path)) w.files.delete(key); },
    readdir: async (path) => {
      const kids = new Set();
      for (const key of w.files.keys()) if (key.startsWith(`${path}/`)) kids.add(key.slice(path.length + 1).split('/')[0]);
      return [...kids];
    },
    rename: async (from, to) => {
      if (w.failRename?.(from, to)) throw Object.assign(new Error(`rename ${from} failed`), { code: w.failRename(from, to) });
      const keys = under(from);
      if (keys.length === 0) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      for (const key of keys) {
        w.files.set(to + key.slice(from.length), w.files.get(key));
        w.files.delete(key);
      }
    },
    writable: async () => w.writable,
  };
  w.run = async (cmd, args) => {
    w.commands.push([cmd, ...args]);
    if (cmd === 'ditto' && args[0] === '-x') {
      w.files.set(`${args[3]}/Scryproof.app`, 'dir');
      w.files.set(`${args[3]}/Scryproof.app/Contents`, 'dir');
      // A half-unpacked bundle is what is on disk until the gate opens.
      if (w.gate) await w.gate;
      w.files.set(`${args[3]}/Scryproof.app/Contents/Info.plist`, 'whole');
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'ditto') {
      for (const key of under(args[0])) w.files.set(args[1] + key.slice(args[0].length), w.files.get(key));
      return { code: 0, stdout: '', stderr: '' };
    }
    if (cmd === 'codesign' && args[0] === '--verify') return { code: w.verifyOk ? 0 : 1, stdout: '', stderr: w.verifyOk ? '' : 'a sealed resource is missing' };
    if (cmd === 'codesign' && args[0] === '-dv') {
      const team = args[2] === APP ? w.runningTeam : w.stagedTeam;
      return { code: 0, stdout: '', stderr: `Identifier=com.scryproof.desktop\nTeamIdentifier=${team ?? 'not set'}\n` };
    }
    if (cmd === 'plutil') return { code: 0, stdout: `${w.stagedVersion}\n`, stderr: '' };
    return { code: 127, stdout: '', stderr: 'unknown' };
  };
  const updater = createMacShellUpdater({
    enabled: w.enabled,
    log: (line) => w.log.push(line),
    arch: 'arm64',
    version: '0.6.0',
    appPath: w.appPath,
    dir: DIR,
    urls: { manifest: 'https://s/download/installer-mac-arm64.json', zip: 'https://s/download/Scryproof-mac-arm64.zip', dmg: 'https://s/download/Scryproof.dmg' },
    fetchText: async (url) => { w.fetched.push(url); return JSON.stringify(w.manifest); },
    download: async (url, path, size) => {
      w.fetched.push(url);
      if (w.served.length > size) throw new Error('bigger than it was signed at');
      w.files.set(path, w.served);
      if (w.downloadGate) await w.downloadGate;
    },
    // The signature is the Mac manifest reader's business (installer.test.mjs); here a manifest is a signed one if it has a signature.
    readManifest: (raw) => { const m = JSON.parse(raw); return m.signature ? m : null; },
    isNewer: (a, b) => {
      const [x, y] = [a, b].map((v) => v.split('.').map(Number));
      for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
      return false;
    },
    hashFile: async (path) => sha(w.files.get(path)),
    lstat: async (path) => {
      if (!w.files.has(path)) throw new Error('ENOENT');
      return { isSymbolicLink: () => w.symlinks.has(path), isDirectory: () => w.files.get(path) === 'dir' };
    },
    stat: async (path) => {
      if (!w.files.has(path)) throw new Error('ENOENT');
      return { size: w.files.get(path).length };
    },
    run: (...args) => w.run(...args),
    fs: w.fs,
    onReady: (version) => w.ready.push(version),
    openExternal: (url) => w.opened.push(url),
    relaunchAndQuit: (path) => w.relaunched.push(path),
  });
  return { w, updater };
}

const junk = (w) => { w.files.set(STAGING, 'dir'); w.files.set(`${STAGING}/stale.app`, 'dir'); };
const has = (w, path) => w.files.has(path);

/* ------------------------------ the whole flow ------------------------------ */

test('a newer signed zip is fetched, checked and staged, and the page is told once', async () => {
  const { w, updater } = world();
  await updater.check();
  assert.deepEqual(w.ready, ['0.6.1']);
  assert.equal(updater.state(), '0.6.1');
  assert.equal(has(w, `${STAGING}/Scryproof.app`), true);
  assert.equal(has(w, ZIP), true, 'the zip stays as a cache for the next launch');
  assert.deepEqual(w.commands.map((c) => c[0]), ['ditto', 'codesign', 'codesign', 'codesign', 'plutil']);
  assert.deepEqual(w.commands[0], ['ditto', '-x', '-k', ZIP, STAGING]);
  assert.deepEqual(w.commands[1], ['codesign', '--verify', '--deep', '--strict', `-R=${macRequirement()}`, `${STAGING}/Scryproof.app`]);
  await updater.check();
  assert.deepEqual(w.ready, ['0.6.1'], 'nothing newer than the one waiting: no second download or announcement');
  assert.equal(w.fetched.filter((u) => u.endsWith('.zip')).length, 1);
});

test('Restart to install sets the old bundle aside, moves the new one in, and relaunches', async () => {
  const { w, updater } = world();
  w.files.set(`${APP}/Contents/old.txt`, 'old');
  await updater.check();
  assert.equal(await updater.how(), 'restart');
  assert.equal(await updater.apply(), true);
  assert.equal(has(w, `${APP}.old/Contents/old.txt`), true, 'the running bundle is beside itself, not deleted');
  assert.equal(has(w, `${APP}/Contents`), true);
  assert.equal(has(w, `${APP}/Contents/old.txt`), false, 'what is at the app path is the new bundle');
  assert.equal(has(w, `${STAGING}/Scryproof.app`), false);
  assert.deepEqual(w.relaunched, [APP]);
  assert.deepEqual(w.opened, []);
});

test('apply checks the bundle again, and a bundle that no longer passes is deleted, not moved', async () => {
  const { w, updater } = world();
  await updater.check();
  w.verifyOk = false; // someone edited it while it sat in staging
  assert.equal(await updater.apply(), false);
  assert.equal(has(w, `${APP}.old`), false);
  assert.equal(has(w, `${STAGING}/Scryproof.app`), false);
  assert.deepEqual(w.relaunched, []);
  assert.equal(updater.state(), null);
});

test('a swap that fails before the app is set aside leaves it alone and opens the DMG instead', async () => {
  const { w, updater } = world();
  w.files.set(`${APP}/Contents/old.txt`, 'old');
  await updater.check();
  w.failRename = (from) => (from.startsWith(STAGING) ? 'EACCES' : null);
  assert.equal(await updater.apply(), true);
  assert.equal(has(w, `${APP}/Contents/old.txt`), true);
  assert.equal(has(w, `${APP}.old`), false);
  assert.equal(has(w, `${APP}.incoming`), false);
  assert.deepEqual(w.relaunched, []);
  assert.deepEqual(w.opened, ['https://s/download/Scryproof.dmg']);
  assert.match(w.log.join('\n'), /opening the DMG link instead/);
});

test('a failure of the last rename puts the old bundle back, clears the incoming one and opens the DMG', async () => {
  const { w, updater } = world();
  w.files.set(`${APP}/Contents/old.txt`, 'old');
  await updater.check();
  w.failRename = (from, to) => (to === APP && from === `${APP}.incoming` ? 'EACCES' : null);
  assert.equal(await updater.apply(), true);
  assert.equal(has(w, `${APP}/Contents/old.txt`), true, 'the old app is back where it was');
  assert.equal(has(w, `${APP}.old`), false);
  assert.equal(has(w, `${APP}.incoming`), false);
  assert.deepEqual(w.relaunched, []);
  assert.deepEqual(w.opened, ['https://s/download/Scryproof.dmg']);
  assert.match(w.log.join('\n'), /put back/);
});

test('a refused rename of the running app (App Management, root-owned) opens the DMG rather than ignoring every click', async () => {
  const { w, updater } = world();
  await updater.check();
  w.failRename = (from) => (from === APP ? 'EPERM' : null);
  assert.equal(await updater.apply(), true);
  assert.deepEqual(w.opened, ['https://s/download/Scryproof.dmg']);
  assert.deepEqual(w.relaunched, []);
  assert.equal(has(w, `${APP}/Contents`), true);
});

test('a move across disks copies beside the app first, so the swap itself is two renames', async () => {
  const { w, updater } = world();
  await updater.check();
  w.failRename = (from) => (from.startsWith(STAGING) ? 'EXDEV' : null);
  assert.equal(await updater.apply(), true);
  const copy = w.commands.findIndex((c) => c[0] === 'ditto' && c[2] === `${APP}.incoming`);
  assert.notEqual(copy, -1);
  assert.equal(has(w, `${APP}.incoming`), false);
  assert.equal(has(w, `${APP}/Contents/Info.plist`), true);
  assert.equal(has(w, `${APP}.old/Contents`), true);
  assert.deepEqual(w.relaunched, [APP]);
});

test('executeSwap says why it failed and whether the old app was put back', async () => {
  const plan = planSwap({ appPath: '/A/S.app', stagedPath: '/st/S.app', writable: true, translocated: false });
  const calls = [];
  const io = {
    rm: async (p) => calls.push(['rm', p]),
    rename: async (from, to) => {
      calls.push(['rename', from, to]);
      if (from === '/A/S.app.incoming') throw new Error('disk full');
    },
    run: async () => ({ code: 0, stdout: '', stderr: '' }),
  };
  assert.deepEqual(await executeSwap(plan, io), { ok: false, error: 'disk full', restored: true });
  assert.deepEqual(calls.slice(-2), [['rename', '/A/S.app.old', '/A/S.app'], ['rm', '/A/S.app.incoming']]);
  assert.deepEqual(await executeSwap({ how: 'download' }, io), { ok: false, error: 'not a swap' });
});

/* ------------------------- what is refused, and what it leaves ------------------------- */

test('a wrong-arch manifest does nothing', async () => {
  const { w, updater } = world();
  w.manifest.arch = 'x64';
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.deepEqual(w.fetched.filter((u) => u.endsWith('.zip')), []);
});

test('a manifest that is not newer does nothing, and neither does an unsigned one', async () => {
  for (const change of [{ version: '0.6.0' }, { version: '0.5.9' }, { signature: '' }]) {
    const { w, updater } = world();
    Object.assign(w.manifest, change);
    await updater.check();
    assert.deepEqual(w.ready, [], JSON.stringify(change));
    assert.deepEqual(w.fetched.filter((u) => u.endsWith('.zip')), [], JSON.stringify(change));
  }
});

test('without the Mac key (updates not enabled) nothing is even asked of the server', async () => {
  const { w, updater } = world({ enabled: false });
  await updater.check();
  assert.deepEqual(w.fetched, []);
  assert.equal(updater.state(), null);
  assert.deepEqual(w.ready, []);
});

test('a zip bigger than it was signed at is refused and staging is emptied', async () => {
  const { w, updater } = world();
  junk(w);
  w.served = `${ZIP_BYTES} and more`;
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false, 'staging is gone');
  assert.equal(has(w, `${DIR}/mac-update.part`), false);
  assert.equal(has(w, ZIP), false);
});

test('a zip of the right size and the wrong hash is refused and staging is emptied', async () => {
  const { w, updater } = world();
  junk(w);
  w.served = 'the SIGNED zip'; // same length as ZIP_BYTES
  assert.equal(w.served.length, ZIP_BYTES.length);
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, ZIP), false);
  assert.equal(has(w, `${DIR}/mac-update.part`), false);
  assert.equal(w.commands.length, 0, 'nothing was even unpacked');
});

test('a zip that is smaller than signed is refused', async () => {
  const { w, updater } = world();
  w.served = 'short';
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, ZIP), false);
});

test('a bundle that fails codesign is deleted with its zip and never offered', async () => {
  const { w, updater } = world();
  w.verifyOk = false;
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, ZIP), false);
  assert.equal(updater.state(), null);
  assert.match(w.log.join('\n'), /codesign refused/);
});

test('a bundle signed by another team, even a valid one, is deleted', async () => {
  const { w, updater } = world({ stagedTeam: 'ABCDE12345' });
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, ZIP), false);
});

test('a running app that is not signed by our team updates nothing (an ad-hoc build)', async () => {
  const { w, updater } = world({ runningTeam: null });
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
});

test('a bundle that says it is another version than its manifest is deleted', async () => {
  const { w, updater } = world({ stagedVersion: '0.6.0' });
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
});

test('a zip with two apps in it is refused', async () => {
  const { w, updater } = world();
  const run = w.run;
  w.run = async (cmd, args) => {
    const out = await run(cmd, args);
    if (cmd === 'ditto' && args[0] === '-x') w.files.set(`${STAGING}/Other.app`, 'dir');
    return out;
  };
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
});

test('a bundle already waiting survives a later check that finds nothing new', async () => {
  const { w, updater } = world();
  await updater.check();
  await updater.check();
  assert.equal(has(w, `${STAGING}/Scryproof.app`), true);
  assert.equal(updater.state(), '0.6.1');
});

/* --------------------------- when it cannot replace itself --------------------------- */

test('where the folder is not writable the page is told, nothing is downloaded, and Restart opens the DMG', async () => {
  const { w, updater } = world({ writable: false });
  await updater.check();
  assert.deepEqual(w.ready, ['0.6.1']);
  assert.deepEqual(w.fetched.filter((u) => u.endsWith('.zip')), []);
  assert.equal(await updater.how(), 'download');
  assert.equal(await updater.apply(), true);
  assert.deepEqual(w.opened, ['https://s/download/Scryproof.dmg']);
  assert.deepEqual(w.relaunched, []);
  assert.equal(has(w, `${APP}.old`), false);
});

test('a translocated app is told to download the DMG too', async () => {
  const { w, updater } = world({ appPath: '/private/var/folders/xy/T/AppTranslocation/ABC/d/Scryproof.app' });
  await updater.check();
  assert.deepEqual(w.ready, ['0.6.1']);
  assert.deepEqual(w.fetched.filter((u) => u.endsWith('.zip')), []);
  assert.equal(await updater.how(), 'download');
  assert.equal(await updater.apply(), true);
  assert.deepEqual(w.opened, ['https://s/download/Scryproof.dmg']);
  assert.deepEqual(w.relaunched, []);
});

/* ----------------------------------- launch tidy ----------------------------------- */

test('at launch the set-aside bundle, staging, half downloads and stale zips go; a newer zip stays', async () => {
  const { w, updater } = world();
  w.files.set(`${APP}.old`, 'dir');
  w.files.set(`${APP}.old/Contents`, 'dir');
  junk(w);
  w.files.set(`${DIR}/mac-update.part`, 'half');
  w.files.set(`${DIR}/Scryproof-0.6.0-mac-arm64.zip`, 'the one that is running');
  w.files.set(`${DIR}/Scryproof-0.6.1-mac-arm64.zip`, 'newer');
  w.files.set(`${DIR}/Scryproof-Setup-0.5.5.exe`, 'a Windows leftover');
  await updater.tidy();
  assert.equal(has(w, `${APP}.old`), false);
  assert.equal(has(w, `${APP}.old/Contents`), false);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, `${DIR}/mac-update.part`), false);
  assert.equal(has(w, `${DIR}/Scryproof-0.6.0-mac-arm64.zip`), false);
  assert.equal(has(w, `${DIR}/Scryproof-Setup-0.5.5.exe`), false);
  assert.equal(has(w, `${DIR}/Scryproof-0.6.1-mac-arm64.zip`), true);
  assert.equal(has(w, APP), true, 'the running app is not touched');
});

test('a cached zip from an earlier run is reused when it still matches, and re-checked after unpacking', async () => {
  const { w, updater } = world();
  w.files.set(ZIP, ZIP_BYTES);
  await updater.check();
  assert.deepEqual(w.fetched.filter((u) => u.endsWith('.zip')), [], 'no download');
  assert.deepEqual(w.ready, ['0.6.1']);
  assert.equal(w.commands[0][0], 'ditto');
});

/* ---------------- the review's races: tidy, and check against apply ---------------- */

const ticks = async (n = 20) => { for (let i = 0; i < n; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

test('the late tidy pass removes only the set-aside bundle: a staged update still applies', async () => {
  const { w, updater } = world();
  w.files.set(`${APP}.old`, 'dir');
  await updater.check();
  await updater.tidyAside();
  assert.equal(has(w, `${APP}.old`), false);
  assert.equal(has(w, `${STAGING}/Scryproof.app`), true, 'staging is not touched');
  assert.equal(await updater.apply(), true);
  assert.deepEqual(w.relaunched, [APP]);
});

test('the launch tidy does nothing while a download is being written or an update waits', async () => {
  const { w, updater } = world();
  let open;
  w.downloadGate = new Promise((resolve) => { open = resolve; });
  const checking = updater.check();
  await ticks();
  assert.equal(has(w, `${DIR}/mac-update.part`), true, 'precondition: the download is under way');
  await updater.tidy();
  assert.equal(has(w, `${DIR}/mac-update.part`), true, 'tidy left the half download alone');
  open();
  await checking;
  assert.deepEqual(w.ready, ['0.6.1']);
  await updater.tidy();
  assert.equal(has(w, `${STAGING}/Scryproof.app`), true, 'and left the staged update alone');
});

test('a check unpacking a newer release while Restart is clicked: the swap waits and moves a whole bundle', async () => {
  const { w, updater } = world();
  await updater.check();
  assert.deepEqual(w.ready, ['0.6.1']);
  w.served = 'the second zip';
  Object.assign(w.manifest, { version: '0.6.2', sha256: sha(w.served), size: w.served.length });
  w.stagedVersion = '0.6.2';
  let open;
  w.gate = new Promise((resolve) => { open = resolve; });
  const checking = updater.check();
  await ticks();
  assert.equal(w.commands.filter((c) => c[0] === 'ditto').length, 2, 'precondition: the second unpack has started');
  assert.equal(has(w, `${STAGING}/Scryproof.app/Contents/Info.plist`), false, 'precondition: half unpacked');
  const applying = updater.apply();
  await ticks();
  assert.deepEqual(w.relaunched, [], 'nothing is swapped while the unpack is half done');
  open();
  await checking;
  assert.equal(await applying, true);
  assert.equal(has(w, `${APP}/Contents/Info.plist`), true, 'the bundle at the app path is the whole one');
  assert.deepEqual(w.ready, ['0.6.1', '0.6.2']);
  assert.deepEqual(w.relaunched, [APP]);
});

test('once the swap has begun, a later check stages nothing and downloads nothing', async () => {
  const { w, updater } = world();
  await updater.check();
  await updater.apply();
  const before = w.fetched.length;
  await updater.check();
  assert.equal(w.fetched.length, before);
});

test('a staged entry that is a link, not a real folder, is refused', async () => {
  const { w, updater } = world();
  w.symlinks.add(`${STAGING}/Scryproof.app`);
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, ZIP), false);
  assert.match(w.log.join('\n'), /plain app folder/);
});

test('a bundle that fails the pinned requirement is refused even if codesign otherwise verifies it', async () => {
  const { w, updater } = world();
  const run = w.run;
  w.run = async (cmd, args) => (args.some((a) => String(a).startsWith('-R=')) ? { code: 3, stdout: '', stderr: 'does not satisfy its designated requirement' } : run(cmd, args));
  await updater.check();
  assert.deepEqual(w.ready, []);
  assert.equal(has(w, STAGING), false);
  assert.equal(has(w, ZIP), false);
});
