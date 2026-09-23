import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickerList, shareAnswer, shareStreams, soundOffer, sourceKind } from '../src/share-menu.js';

/** A stand-in for Electron's NativeImage: enough of it for the list. */
const image = (url) => ({ toDataURL: () => url, isEmpty: () => url === '' });

const screen = { id: 'screen:0:0', name: 'Entire screen', thumbnail: image('data:image/png;base64,S'), appIcon: null };
const game = { id: 'window:42:0', name: 'A game', thumbnail: image('data:image/png;base64,G'), appIcon: image('data:image/png;base64,I') };

test('no sound unless the page asked for it, the person turned it on, and it is Windows', () => {
  const asked = { audioRequested: true, platform: 'win32', withSound: true };
  assert.deepEqual(shareStreams(screen, asked), { video: screen, audio: 'loopback' });
  assert.deepEqual(shareStreams(screen, { ...asked, withSound: false }), { video: screen });
  assert.deepEqual(shareStreams(screen, { ...asked, audioRequested: false }), { video: screen });
  assert.deepEqual(shareStreams(screen, { ...asked, platform: 'darwin' }), { video: screen });
});

test('sources are sorted into screens and windows by id, screens first, and nothing else gets in', () => {
  assert.equal(sourceKind('screen:1:0'), 'screen');
  assert.equal(sourceKind('window:7:0'), 'window');
  assert.equal(sourceKind('tab:3'), null);
  assert.equal(sourceKind(undefined), null);

  const list = pickerList([game, { id: 'tab:3', name: 'odd' }, screen]);
  assert.deepEqual(
    list.map((item) => [item.id, item.kind]),
    [
      ['screen:0:0', 'screen'],
      ['window:42:0', 'window'],
    ],
  );
  assert.deepEqual(list[1], { id: 'window:42:0', name: 'A game', kind: 'window', thumbnail: 'data:image/png;base64,G', icon: 'data:image/png;base64,I' });
});

test('a window with no name or no picture still gets a tile', () => {
  const [item] = pickerList([{ id: 'window:1:0', name: '', thumbnail: image(''), appIcon: undefined }]);
  assert.equal(item.name, 'Untitled');
  assert.equal(item.thumbnail, null);
  assert.equal(item.icon, null);
});

test('the sound switch is offered only where sound was asked for and can be sent, showing the saved choice', () => {
  assert.equal(soundOffer({ audioRequested: true, platform: 'win32', withSound: true }), true);
  assert.equal(soundOffer({ audioRequested: true, platform: 'win32', withSound: false }), false);
  assert.equal(soundOffer({ audioRequested: false, platform: 'win32', withSound: true }), null);
  assert.equal(soundOffer({ audioRequested: true, platform: 'linux', withSound: true }), null);
});

test('only an id that was offered is shared; anything else is a cancel', () => {
  const offered = [screen, game];
  const where = { audioRequested: true, platform: 'win32' };
  assert.deepEqual(shareAnswer(offered, { id: 'window:42:0', withSound: false }, where), { streams: { video: game }, remember: false });
  for (const answer of [null, undefined, 'window:42:0', {}, { id: 42 }, { id: 'window:99:0' }, { id: 'screen:0:0 ' }]) {
    assert.equal(shareAnswer(offered, answer, where), null);
  }
  // Offered, but not a screen or a window: still refused.
  assert.equal(shareAnswer([{ id: 'tab:3', name: 'odd' }], { id: 'tab:3' }, where), null);
});

test('the sound choice is taken, and remembered, only where there was one to make', () => {
  const offered = [screen];
  assert.deepEqual(shareAnswer(offered, { id: screen.id, withSound: true }, { audioRequested: true, platform: 'win32' }), {
    streams: { video: screen, audio: 'loopback' },
    remember: true,
  });
  // Not a real true: off.
  assert.deepEqual(shareAnswer(offered, { id: screen.id, withSound: 'yes' }, { audioRequested: true, platform: 'win32' }), {
    streams: { video: screen },
    remember: false,
  });
  // No switch was shown, so nothing is remembered and no sound goes.
  assert.deepEqual(shareAnswer(offered, { id: screen.id, withSound: true }, { audioRequested: false, platform: 'win32' }), {
    streams: { video: screen },
    remember: null,
  });
  assert.deepEqual(shareAnswer(offered, { id: screen.id, withSound: true }, { audioRequested: true, platform: 'darwin' }), {
    streams: { video: screen },
    remember: null,
  });
});
