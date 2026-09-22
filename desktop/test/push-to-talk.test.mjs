import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { holdTracker, keycodeFor } from '../src/push-to-talk-core.js';

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
