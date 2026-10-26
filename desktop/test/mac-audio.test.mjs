import assert from 'node:assert/strict';
import { test } from 'node:test';
import { macAudioSupported } from '../src/mac-audio.js';
import { shareAnswer, soundOffer } from '../src/share-menu.js';

test('Mac audio requires Darwin 23.2 or newer and an installed helper', () => {
  for (const version of ['22.6.0', '23.0.0', '23.1.0', '', 'garbage']) assert.equal(macAudioSupported(version, true), false, version);
  for (const version of ['23.2.0', '23.6.0', '24.0.0', '26.1.0']) {
    assert.equal(macAudioSupported(version, true), true, version);
    assert.equal(macAudioSupported(version, false), false, 'missing helper');
  }
});

test('Mac offers opt-in native sound only when available, and never asks Chromium for loopback', () => {
  const window = { id: 'window:42:0', name: 'Music' };
  const screen = { id: 'screen:0:0', name: 'Screen' };
  const where = { audioRequested: true, platform: 'darwin', nativeSound: true };
  assert.equal(soundOffer({ ...where, withSound: false }), false);
  assert.equal(soundOffer({ ...where, withSound: true }), true);
  assert.equal(soundOffer({ ...where, nativeSound: false, withSound: true }), null);
  assert.equal(soundOffer({ ...where, audioRequested: false, withSound: true }), null);
  assert.deepEqual(shareAnswer([window], { id: window.id, appSound: true, withSound: true }, where), {
    streams: { video: window }, remember: true, appWindow: '42',
  });
  assert.deepEqual(shareAnswer([screen], { id: screen.id, appSound: true, withSound: true }, where), {
    streams: { video: screen }, remember: true, appWindow: null,
  });
  assert.equal(shareAnswer([window], { id: window.id, appSound: true, withSound: false }, where).appWindow, null);
});
