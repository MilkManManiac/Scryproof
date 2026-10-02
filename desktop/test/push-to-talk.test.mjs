import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { holdTracker, isAppSwitchChord, keycodeFor } from '../src/push-to-talk-core.js';

const { UiohookKey } = createRequire(import.meta.url)('uiohook-napi');

test('the names the page stores translate to the hook', () => {
  assert.equal(keycodeFor('Backquote', UiohookKey), UiohookKey.Backquote);
  assert.equal(keycodeFor('KeyV', UiohookKey), UiohookKey.V);
  assert.equal(keycodeFor('Digit1', UiohookKey), UiohookKey[1]);
  assert.equal(keycodeFor('ControlLeft', UiohookKey), UiohookKey.Ctrl);
  assert.equal(keycodeFor('ShiftRight', UiohookKey), UiohookKey.ShiftRight);
  assert.equal(keycodeFor('Numpad0', UiohookKey), UiohookKey.Numpad0);
  assert.equal(keycodeFor('F13', UiohookKey), UiohookKey.F13);
  assert.equal(keycodeFor('Space', UiohookKey), UiohookKey.Space);
});

test('a name the hook does not know, or nonsense, is null and never a prototype property', () => {
  assert.equal(keycodeFor('Fn', UiohookKey), null);
  assert.equal(keycodeFor('', UiohookKey), null);
  assert.equal(keycodeFor(42, UiohookKey), null);
  assert.equal(keycodeFor('constructor', UiohookKey), null);
  assert.equal(keycodeFor('__proto__', UiohookKey), null);
});

test('held is reported once per press and once per release, other keys ignored', () => {
  const seen = [];
  const feed = holdTracker(41, (held) => seen.push(held));
  feed({ type: 'keydown', keycode: 30 });
  feed({ type: 'keydown', keycode: 41 });
  feed({ type: 'keydown', keycode: 41 }); // Windows auto-repeat
  feed({ type: 'keydown', keycode: 41 });
  feed({ type: 'keyup', keycode: 30 });
  feed({ type: 'keyup', keycode: 41 });
  feed({ type: 'keyup', keycode: 41 });
  assert.deepEqual(seen, [true, false]);
});

/* ---- leaving the context while the key is held (the lost key-up) ---- */

const K = UiohookKey;
const down = (keycode, flags = {}) => ({ type: 'keydown', keycode, ...flags });
const up = (keycode, flags = {}) => ({ type: 'keyup', keycode, ...flags });

/** A tracker for `key` on `platform`, and the changes it reported. */
function watch(key, platform) {
  const seen = [];
  const feed = holdTracker(key, (held) => seen.push(held), { platform, keys: K });
  return { feed, seen };
}

test('macOS: Cmd-Tab while the key is held releases it, once', () => {
  const { feed, seen } = watch(K.Slash, 'darwin');
  feed(down(K.Slash));
  feed(down(K.Slash)); // auto-repeat
  feed(down(K.Tab, { metaKey: true }));
  assert.deepEqual(seen, [true, false]);
  feed(down(K.Tab, { metaKey: true })); // a second Tab in the switcher: nothing more to say
  assert.deepEqual(seen, [true, false]);
});

test('macOS: Cmd-backtick (next window of the app) releases too', () => {
  const { feed, seen } = watch(K.Slash, 'darwin');
  feed(down(K.Slash));
  feed(down(K.Backquote, { metaKey: true }));
  assert.deepEqual(seen, [true, false]);
});

test('another key pressed while talking does not release: W to walk, Tab alone, Cmd-C', () => {
  for (const platform of ['darwin', 'win32']) {
    const { feed, seen } = watch(K.Slash, platform);
    feed(down(K.Slash));
    feed(down(K.W));
    feed(down(K.W)); // the held key stops repeating once W is down; that is not a release
    feed(up(K.W));
    feed(down(K.Tab)); // no modifier: a tab key, not a switch
    feed(up(K.Tab));
    feed(down(K.C, { metaKey: true }));
    assert.deepEqual(seen, [true], platform);
  }
});

test('a late key-up after a forced release changes nothing; a fresh key-down engages again', () => {
  const { feed, seen } = watch(K.Slash, 'darwin');
  feed(down(K.Slash));
  feed(down(K.Tab, { metaKey: true }));
  feed(up(K.Slash)); // arrives late, if at all
  assert.deepEqual(seen, [true, false]);
  feed(down(K.Slash));
  feed(up(K.Slash));
  assert.deepEqual(seen, [true, false, true, false]);
});

test('screen lock or sleep releases a held key once, and a key not held says nothing', () => {
  const { feed, seen } = watch(K.Slash, 'win32');
  feed.release();
  assert.deepEqual(seen, []);
  feed(down(K.Slash));
  feed.release();
  feed.release();
  assert.deepEqual(seen, [true, false]); // before any key-up: the release came from the lock, not the key
  feed(up(K.Slash));
  assert.deepEqual(seen, [true, false]);
});

test('Windows: Alt-Tab and the Windows key release; Cmd-Tab means nothing there', () => {
  const alt = watch(K.Slash, 'win32');
  alt.feed(down(K.Slash));
  alt.feed(down(K.Tab, { altKey: true }));
  assert.deepEqual(alt.seen, [true, false]);

  const win = watch(K.Slash, 'win32');
  win.feed(down(K.Slash));
  win.feed(down(K.Meta, { metaKey: true }));
  assert.deepEqual(win.seen, [true, false]);

  const mac = watch(K.Slash, 'win32');
  mac.feed(down(K.Slash));
  mac.feed(down(K.Tab, { metaKey: true }));
  assert.deepEqual(mac.seen, [true]);
});

test('a modifier as the push-to-talk key is not released by its own press', () => {
  const win = watch(K.Meta, 'win32');
  win.feed(down(K.Meta, { metaKey: true }));
  win.feed(down(K.Meta, { metaKey: true }));
  assert.deepEqual(win.seen, [true]);
  win.feed(up(K.Meta));
  assert.deepEqual(win.seen, [true, false]);
});

test('the chord keys never engage push-to-talk, even when Tab is the key', () => {
  const { feed, seen } = watch(K.Tab, 'win32');
  feed(down(K.Tab, { altKey: true }));
  assert.deepEqual(seen, []);
  feed(down(K.Tab));
  assert.deepEqual(seen, [true]);
  feed(down(K.Tab, { altKey: true }));
  assert.deepEqual(seen, [true, false]);
});

test('without a platform and key table, no chord is ever detected', () => {
  assert.equal(isAppSwitchChord(down(K.Tab, { metaKey: true }), 'darwin', null, K.Slash), false);
  assert.equal(isAppSwitchChord(down(K.Tab, { metaKey: true }), 'linux', K, K.Slash), false);
  const seen = [];
  const feed = holdTracker(K.Slash, (held) => seen.push(held));
  feed(down(K.Slash));
  feed(down(K.Tab, { metaKey: true }));
  assert.deepEqual(seen, [true]);
});
