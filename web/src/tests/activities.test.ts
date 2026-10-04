import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idleShareHint, readActivityStatus, updateFollowUp } from '../lib/activity-status';
const origin = 'https://activities.scryproof.com';
const frame = {} as Window;
const message = (overrides: Record<string, unknown> = {}) =>
  ({
    origin,
    source: frame,
    data: {
      type: 'scryproof-activity',
      game: 'drain-the-swamp',
      status: 'ready',
    },
    ...overrides,
  }) as unknown as MessageEvent;
test('a different origin or a different frame cannot mark the game ready', () => {
  assert.equal(
    readActivityStatus(
      message({ origin: 'https://attacker.example' }),
      origin,
      frame,
      'drain-the-swamp',
    ),
    null,
  );
  assert.equal(
    readActivityStatus(
      message({ source: {} }),
      origin,
      frame,
      'drain-the-swamp',
    ),
    null,
  );
  assert.equal(
    readActivityStatus(message(), origin, null, 'drain-the-swamp'),
    null,
  );
});
test('only status reports for the active game are accepted, including normal quit', () => {
  for (const status of ['ready', 'error', 'ended']) {
    assert.equal(
      readActivityStatus(
        message({
          data: { type: 'scryproof-activity', game: 'drain-the-swamp', status },
        }),
        origin,
        frame,
        'drain-the-swamp',
      ),
      status,
    );
  }
  for (const data of [
    null,
    {},
    { type: 'scryproof-activity', game: 'other-game', status: 'ready' },
    {
      type: 'scryproof-activity',
      game: 'drain-the-swamp',
      status: 'share-screen',
    },
  ]) {
    assert.equal(
      readActivityStatus(message({ data }), origin, frame, 'drain-the-swamp'),
      null,
    );
  }
});

test('the share hint offers sound only where the shell can share it, and the browser tab elsewhere', () => {
  assert.match(idleShareHint(true, true), /Enable sound only if/);
  assert.match(idleShareHint(false, true), /Choose this Scryproof tab/);
  const silent = idleShareHint(true, false);
  assert.match(silent, /no sound/);
  assert.doesNotMatch(silent, /Enable sound/);
});
test('a downloaded update is installed by running it on Windows and replacing the app on a Mac', () => {
  assert.match(updateFollowUp(false), /run the installer/);
  assert.match(updateFollowUp(true), /replace the old app/);
  assert.doesNotMatch(updateFollowUp(true), /installer/);
});
