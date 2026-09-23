import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SOUND_LABEL, shareMenuTemplate, shareStreams } from '../src/share-menu.js';

const screen = { id: 'screen:0:0', name: 'Entire screen' };
const game = { id: 'window:42:0', name: 'A game' };

test('no sound unless the page asked for it, the person ticked it, and it is Windows', () => {
  const asked = { audioRequested: true, platform: 'win32', withSound: true };
  assert.deepEqual(shareStreams(screen, asked), { video: screen, audio: 'loopback' });
  assert.deepEqual(shareStreams(screen, { ...asked, withSound: false }), { video: screen });
  assert.deepEqual(shareStreams(screen, { ...asked, audioRequested: false }), { video: screen });
  assert.deepEqual(shareStreams(screen, { ...asked, platform: 'darwin' }), { video: screen });
});

test('the menu lists screens then windows, and the sound box last, showing the saved choice', () => {
  const picked = [];
  const toggled = [];
  const menu = shareMenuTemplate([game, screen], {
    audioRequested: true,
    platform: 'win32',
    withSound: false,
    onPick: (source) => picked.push(source),
    onToggleSound: (on) => toggled.push(on),
  });
  assert.deepEqual(
    menu.map((item) => item.label ?? item.type),
    ['Share a screen', 'Entire screen', 'separator', 'Share a window', 'A game', 'separator', SOUND_LABEL],
  );
  const sound = menu.at(-1);
  assert.equal(sound.type, 'checkbox');
  assert.equal(sound.checked, false);
  sound.click();
  assert.deepEqual(toggled, [true]);
  menu[4].click();
  assert.deepEqual(picked, [game]);
});

test('no sound box where sound cannot be sent or was not asked for', () => {
  const base = { withSound: true, onPick() {}, onToggleSound() {} };
  for (const options of [
    { ...base, audioRequested: false, platform: 'win32' },
    { ...base, audioRequested: true, platform: 'linux' },
  ]) {
    assert.ok(!shareMenuTemplate([screen], options).some((item) => item.type === 'checkbox'));
  }
});

test('a window with no name still gets a label', () => {
  const menu = shareMenuTemplate([{ id: 'window:1:0', name: '' }], {
    audioRequested: false,
    platform: 'win32',
    withSound: false,
    onPick() {},
    onToggleSound() {},
  });
  assert.ok(menu.some((item) => item.label === 'Untitled'));
});
