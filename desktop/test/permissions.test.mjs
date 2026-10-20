import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameMic, gameMicConsent, shellPermission } from '../src/permissions-core.js';

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
test('an embedded game asking for the microphone is a question for the person, only from the activities host, never the camera', () => {
  const game = 'https://activities.scryproof.com/pass-along/';
  // Never granted silently.
  assert.equal(shellPermission(game, 'media', false, ['audio']), false);
  assert.equal(gameMic(game, 'media', false, ['audio']), true);
  assert.equal(gameMic(game, 'media', false, 'audio'), true);
  assert.equal(gameMic(game, 'media', false, ['audio', 'video']), false);
  assert.equal(gameMic(game, 'media', false, ['video']), false);
  assert.equal(gameMic(game, 'media', false, []), false);
  assert.equal(gameMic(game, 'media', false), false);
  assert.equal(gameMic('https://scryproof.com/', 'media', false, ['audio']), false);
  assert.equal(gameMic('https://activities.scryproof.com.evil/', 'media', false, ['audio']), false);
  assert.equal(gameMic(game, 'display-capture', false, ['audio']), false);
  // The app page's own microphone is not a game's, and is unchanged.
  assert.equal(gameMic('app://scryproof/', 'media', true, ['audio']), false);
  assert.equal(shellPermission('app://scryproof/', 'media'), true);
});
test('the game microphone is asked once per run, and the answer holds either way', async () => {
  for (const said of [true, false]) {
    let asked = 0;
    const consent = gameMicConsent(async () => { asked += 1; return said; });
    assert.equal(consent.answer(), null);
    assert.equal(await consent(), said);
    assert.equal(await consent(), said);
    assert.equal(consent.answer(), said);
    assert.equal(asked, 1);
  }
});
test('requests that arrive while the question is up share one question', async () => {
  let asked = 0;
  let reply;
  const consent = gameMicConsent(() => { asked += 1; return new Promise((resolve) => { reply = resolve; }); });
  const both = Promise.all([consent(), consent()]);
  await new Promise((resolve) => setImmediate(resolve));
  reply(true);
  assert.deepEqual(await both, [true, true]);
  assert.equal(asked, 1);
});
test('a question that fails, or answers anything but yes, is a no', async () => {
  assert.equal(await gameMicConsent(() => { throw new Error('no window'); })(), false);
  assert.equal(await gameMicConsent(async () => 'yes')(), false);
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
