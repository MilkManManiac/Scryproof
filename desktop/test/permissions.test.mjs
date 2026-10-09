import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shellPermission } from '../src/permissions-core.js';

test('the trusted app can still request call devices', () => {
  for (const permission of ['media', 'display-capture', 'notifications'])
    assert.equal(shellPermission('app://scryproof/', permission), true);
});
test('an embedded game cannot inherit its parent device permissions', () => {
  for (const permission of [
    'media',
    'display-capture',
    'notifications',
    'clipboard-sanitized-write',
  ]) {
    assert.equal(
      shellPermission(
        'https://activities.scryproof.com/drain-the-swamp/',
        permission,
        false,
      ),
      false,
    );
    assert.equal(shellPermission('app://scryproof/', permission, false), false);
  }
});
test('an embedded game may fill the screen, and only from the activities host', () => {
  assert.equal(shellPermission('https://activities.scryproof.com/hero-line/', 'fullscreen', false), true);
  assert.equal(shellPermission('https://activities.scryproof.com.evil/hero-line/', 'fullscreen', false), false);
  assert.equal(shellPermission('https://scryproof.com/', 'fullscreen', false), false);
  assert.equal(shellPermission('app://scryproof/', 'fullscreen', false), false);
  assert.equal(shellPermission('null', 'fullscreen', false), false);
});
test('an embedded game may use the microphone, only from the activities host, never the camera', () => {
  const game = 'https://activities.scryproof.com/pass-along/';
  assert.equal(shellPermission(game, 'media', false, ['audio']), true);
  assert.equal(shellPermission(game, 'media', false, 'audio'), true);
  assert.equal(shellPermission(game, 'media', false, ['audio', 'video']), false);
  assert.equal(shellPermission(game, 'media', false, ['video']), false);
  assert.equal(shellPermission(game, 'media', false, []), false);
  assert.equal(shellPermission(game, 'media', false), false);
  assert.equal(shellPermission('https://scryproof.com/', 'media', false, ['audio']), false);
  assert.equal(shellPermission(game, 'display-capture', false, ['audio']), false);
});
test('lookalikes, opaque origins and unknown permissions are refused', () => {
  for (const url of [
    'app://scryproof.evil/',
    'https://scryproof.com',
    'app://user@scryproof/',
    'null',
    'data:text/html,test',
  ])
    assert.equal(shellPermission(url, 'media'), false);
  assert.equal(shellPermission('app://scryproof/', 'geolocation'), false);
});
