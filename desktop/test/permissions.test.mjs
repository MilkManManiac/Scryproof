import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameMicPrompt, permissionDecision, shellPermission } from '../src/permissions-core.js';

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
test('an embedded game may ask for the microphone, only from the activities host, never the camera; the person answers', () => {
  const game = 'https://activities.scryproof.com/pass-along/';
  assert.equal(permissionDecision(game, 'media', false, ['audio']), 'ask');
  assert.equal(permissionDecision(game, 'media', false, 'audio'), 'ask');
  // Not an outright grant: the old yes-or-no says no until the dialog has been answered.
  assert.equal(shellPermission(game, 'media', false, ['audio']), false);
  assert.equal(permissionDecision(game, 'media', false, ['audio', 'video']), 'deny');
  assert.equal(permissionDecision(game, 'media', false, ['video']), 'deny');
  assert.equal(permissionDecision(game, 'media', false, []), 'deny');
  assert.equal(permissionDecision(game, 'media', false), 'deny');
  assert.equal(permissionDecision('https://scryproof.com/', 'media', false, ['audio']), 'deny');
  assert.equal(permissionDecision(game, 'display-capture', false, ['audio']), 'deny');
  assert.equal(permissionDecision('app://scryproof/', 'media', true, ['audio']), 'grant');
  // The question names the host and says it is not a call; Allow is first, so a response of 0 is yes.
  const prompt = frameMicPrompt(game);
  assert.match(prompt.message, /activities\.scryproof\.com/);
  assert.match(prompt.detail, /not encrypted/);
  assert.deepEqual(prompt.buttons, ['Allow', 'Don\'t allow']);
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
