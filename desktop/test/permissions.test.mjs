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
