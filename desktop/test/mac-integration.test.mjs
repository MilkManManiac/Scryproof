import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appMenuTemplate, armPermissionIpc, PERMISSION_PANES, permissionState, startsHidden } from '../src/mac-integration.js';

const prefs = ({ trusted = false, screen = 'denied' } = {}) => ({
  asked: [],
  isTrustedAccessibilityClient(prompt) { this.asked.push(prompt); return trusted; },
  getMediaAccessStatus: (kind) => (kind === 'screen' ? screen : 'granted'),
});

/** The handlers armPermissionIpc registered, and what openExternal was given. */
function rig({ platform = 'darwin', systemPreferences = prefs() } = {}) {
  const handlers = new Map();
  const opened = [];
  const ours = (event) => event.ours === true;
  armPermissionIpc({ handle: (name, fn) => handlers.set(name, fn) }, ours, {
    platform,
    systemPreferences,
    shell: { openExternal: async (url) => opened.push(url) },
  });
  return { call: (name, event, ...args) => handlers.get(name)(event, ...args), opened, systemPreferences };
}

test('permissions are looked at without prompting, and mapped to the page\'s words', () => {
  const p = prefs({ trusted: true, screen: 'not-determined' });
  assert.deepEqual(permissionState({ platform: 'darwin', systemPreferences: p }), { accessibility: true, screen: 'not-determined' });
  assert.deepEqual(p.asked, [false]);
  assert.deepEqual(permissionState({ platform: 'darwin', systemPreferences: prefs({ screen: 'restricted' }) }), { accessibility: false, screen: 'denied' });
  assert.deepEqual(permissionState({ platform: 'darwin', systemPreferences: prefs({ screen: 'granted' }) }), { accessibility: false, screen: 'granted' });
  assert.equal(permissionState({ platform: 'darwin', systemPreferences: prefs({ screen: 'something new' }) }).screen, 'unknown');
});

test('off the Mac there is nothing to grant', () => {
  const p = prefs();
  assert.deepEqual(permissionState({ platform: 'win32', systemPreferences: p }), { accessibility: true, screen: 'unknown' });
  assert.deepEqual(p.asked, []);
});

test('our own page gets the state; a foreign page gets null and nothing is asked', async () => {
  const r = rig();
  assert.deepEqual(await r.call('scryproof:perm-state', { ours: true }), { accessibility: false, screen: 'denied' });
  assert.equal(await r.call('scryproof:perm-state', { ours: false }), null);
  assert.deepEqual(r.systemPreferences.asked, [false], 'only the one from our page');
});

test('opening a pane: our page, a known pane, the Mac only', async () => {
  const r = rig();
  await r.call('scryproof:perm-open', { ours: true }, 'accessibility');
  await r.call('scryproof:perm-open', { ours: true }, 'screen');
  assert.deepEqual(r.opened, [PERMISSION_PANES.accessibility, PERMISSION_PANES.screen]);
  assert.match(PERMISSION_PANES.accessibility, /Privacy_Accessibility$/);
  assert.match(PERMISSION_PANES.screen, /Privacy_ScreenCapture$/);
});

test('a foreign page, an unknown pane, a URL in place of a pane, or a non-Mac opens nothing', async () => {
  const r = rig();
  assert.equal(await r.call('scryproof:perm-open', { ours: false }, 'accessibility'), null);
  assert.equal(await r.call('scryproof:perm-open', { ours: true }, 'microphone'), null);
  assert.equal(await r.call('scryproof:perm-open', { ours: true }, 'https://evil.example/'), null);
  assert.equal(await r.call('scryproof:perm-open', { ours: true }, '__proto__'), null);
  assert.equal(await r.call('scryproof:perm-open', { ours: true }, 'constructor'), null);
  assert.equal(await r.call('scryproof:perm-open', { ours: true }, { toString: () => 'screen' }), null);
  const win = rig({ platform: 'win32' });
  assert.equal(await win.call('scryproof:perm-open', { ours: true }, 'screen'), null);
  assert.deepEqual(win.opened, []);
  assert.deepEqual(r.opened, []);
});

test('the Mac menu has App, Edit, View and Window; Quit and the edit commands come from roles', () => {
  const installed = appMenuTemplate({ packaged: true });
  assert.deepEqual(installed.map((m) => m.role ?? m.label), ['appMenu', 'editMenu', 'View', 'windowMenu']);
  const view = installed[2].submenu.map((m) => m.role);
  assert.deepEqual(view, ['togglefullscreen'], 'no developer tools in an installed copy');
  const dev = appMenuTemplate({ packaged: false })[2].submenu.map((m) => m.role);
  assert.ok(dev.includes('toggleDevTools'));
});

test('a login start is hidden on the Mac by the OS flag and anywhere by --hidden', () => {
  assert.equal(startsHidden({ platform: 'darwin', argv: ['/x'], loginSettings: { wasOpenedAtLogin: true } }), true);
  assert.equal(startsHidden({ platform: 'darwin', argv: ['/x'], loginSettings: { wasOpenedAtLogin: false } }), false);
  assert.equal(startsHidden({ platform: 'win32', argv: ['/x', '--hidden'], loginSettings: null }), true);
  assert.equal(startsHidden({ platform: 'win32', argv: ['/x'], loginSettings: { wasOpenedAtLogin: true } }), false, 'Windows never reads the Mac flag');
});
