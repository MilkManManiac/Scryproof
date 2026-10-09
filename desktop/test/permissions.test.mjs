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
    'fullscreen',
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
test('a game frame on the activities origin may go fullscreen, and only that', () => {
  const act = 'https://activities.scryproof.com';
  assert.equal(shellPermission(act + '/hero-line/', 'fullscreen', false, act), true);
  assert.equal(shellPermission(act + '/hero-line/', 'media', false, act), false);
  assert.equal(shellPermission('https://activities.scryproof.com.evil/x/', 'fullscreen', false, act), false);
  assert.equal(shellPermission(act + '/hero-line/', 'fullscreen', false), false);
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
