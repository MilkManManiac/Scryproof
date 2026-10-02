import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { armPushToTalk, stopPushToTalk } from '../src/push-to-talk.js';

/** A stand-in for the key hook: an emitter that counts starts and stops. */
function fakeHook() {
  const io = new EventEmitter();
  io.starts = 0;
  io.stops = 0;
  io.start = () => { io.starts += 1; };
  io.stop = () => { io.stops += 1; };
  return { io, keys: { Slash: 53, W: 17, Tab: 15, Backquote: 41, Meta: 3675, MetaRight: 3676 }, started: false };
}

/** An ipcMain that keeps its one handler, and a window that records what it is sent. */
function rig({ platform, trusted, own = true }) {
  const handlers = new Map();
  const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };
  const sent = [];
  const win = { webContents: { send: (channel, held) => sent.push([channel, held]) } };
  const hook = fakeHook();
  const power = new EventEmitter();
  const asked = [];
  let loads = 0;
  const env = {
    platform,
    power,
    loadHook: () => { loads += 1; return hook; },
    accessibility: (prompt) => { asked.push(prompt); return trusted(); },
  };
  armPushToTalk(ipcMain, () => own, () => win, env);
  const watch = (code, event = {}) => handlers.get('scryproof:ptt-watch')(event, code);
  return { watch, sent, hook, power, asked, loads: () => loads, setTrusted: (v) => { trusted = () => v; } };
}
const trustedFn = (v) => () => v;

test('a request from a page that is not ours is refused and asks nothing', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(true), own: false });
  assert.equal(await r.watch('Slash'), false);
  assert.deepEqual(r.asked, []);
  assert.equal(r.loads(), 0);
});

test('macOS without Accessibility: prompts once, then only looks, and never starts the hook', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(false) });
  assert.equal(await r.watch('Slash'), false);
  assert.equal(await r.watch('Slash'), false);
  assert.equal(await r.watch('KeyV'), false);
  assert.deepEqual(r.asked, [true, false, false]);
  assert.equal(r.loads(), 0, 'the hook is not even loaded');
  assert.equal(r.hook.io.starts, 0);
});

test('macOS stopping (null) never asks the OS anything', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(false) });
  assert.equal(await r.watch(null), false);
  assert.deepEqual(r.asked, []);
});

test('macOS once granted: the hook starts, Cmd-Tab and a lock release, a late key-up adds nothing', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(false) });
  assert.equal(await r.watch('Slash'), false);
  r.setTrusted(true);
  assert.equal(await r.watch('Slash'), true);
  assert.equal(r.hook.io.starts, 1);
  assert.equal(r.power.listenerCount('lock-screen'), 1);
  assert.equal(r.power.listenerCount('suspend'), 1);

  r.hook.io.emit('keydown', { keycode: 53 });
  r.hook.io.emit('keydown', { keycode: 15, metaKey: true }); // Cmd-Tab
  r.hook.io.emit('keyup', { keycode: 53 }); // late
  assert.deepEqual(r.sent, [['scryproof:ptt', true], ['scryproof:ptt', false]]);

  r.hook.io.emit('keydown', { keycode: 53 });
  r.power.emit('lock-screen');
  r.power.emit('suspend');
  assert.deepEqual(r.sent.slice(2), [['scryproof:ptt', true], ['scryproof:ptt', false]]);

  // Another key is dropped here and never forwarded.
  r.hook.io.emit('keydown', { keycode: 17 });
  assert.equal(r.sent.length, 4);
});

test('stopping removes the key and power listeners and stops the hook', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(true) });
  assert.equal(await r.watch('Slash'), true);
  assert.equal(await r.watch(null), false);
  assert.equal(r.hook.io.listenerCount('keydown'), 0);
  assert.equal(r.hook.io.listenerCount('keyup'), 0);
  assert.equal(r.power.listenerCount('lock-screen'), 0);
  assert.equal(r.hook.io.stops, 1);
});

test('Windows never consults Accessibility, and Alt-Tab and the Windows key release', async () => {
  const r = rig({ platform: 'win32', trusted: trustedFn(false) });
  assert.equal(await r.watch('Slash'), true);
  assert.deepEqual(r.asked, []);
  r.hook.io.emit('keydown', { keycode: 53 });
  r.hook.io.emit('keydown', { keycode: 15, altKey: true });
  assert.deepEqual(r.sent, [['scryproof:ptt', true], ['scryproof:ptt', false]]);
  r.hook.io.emit('keydown', { keycode: 53 });
  r.hook.io.emit('keydown', { keycode: 3675, metaKey: true });
  assert.deepEqual(r.sent.slice(2), [['scryproof:ptt', true], ['scryproof:ptt', false]]);
  stopPushToTalk();
});

test('watching stopped or re-armed while the key is held tells the page it was released', async () => {
  const r = rig({ platform: 'win32', trusted: trustedFn(true) });
  assert.equal(await r.watch('Slash'), true);
  r.hook.io.emit('keydown', { keycode: 53 });
  assert.deepEqual(r.sent, [['scryproof:ptt', true]]);
  assert.equal(await r.watch('Slash'), true); // re-armed with the key still down
  assert.deepEqual(r.sent, [['scryproof:ptt', true], ['scryproof:ptt', false]]);
  r.hook.io.emit('keydown', { keycode: 53 });
  assert.equal(await r.watch(null), false);
  assert.deepEqual(r.sent.slice(2), [['scryproof:ptt', true], ['scryproof:ptt', false]]);
  // Nothing held: stopping says nothing.
  await r.watch('Slash');
  await r.watch(null);
  assert.equal(r.sent.length, 4);
});

test('macOS: losing the Accessibility grant while a key is held releases it', async () => {
  const r = rig({ platform: 'darwin', trusted: trustedFn(true) });
  assert.equal(await r.watch('Slash'), true);
  r.hook.io.emit('keydown', { keycode: 53 });
  r.setTrusted(false);
  assert.equal(await r.watch('Slash'), false);
  assert.deepEqual(r.sent, [['scryproof:ptt', true], ['scryproof:ptt', false]]);
});
