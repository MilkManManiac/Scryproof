import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newerDesktopRelease } from '../lib/desktop-version';

test('desktop updates compare version numbers rather than text or Activities capability', () => {
  assert.equal(newerDesktopRelease('0.5.5', '0.5.4'), true);
  assert.equal(newerDesktopRelease('0.5.6', '0.5.5'), true);
  assert.equal(newerDesktopRelease('0.10.0', '0.9.9'), true);
  assert.equal(newerDesktopRelease('0.5.5', '0.5.5'), false);
  assert.equal(newerDesktopRelease('0.5.5', '0.6.0'), false);
  assert.equal(newerDesktopRelease('1.0.0', '0.99.99'), true);
});

test('unpublished or malformed versions cannot announce an update; legacy shells can', () => {
  for (const value of [null, undefined, '', 5, '0.5.5-beta', '0.5', 'latest', '<script>']) {
    assert.equal(newerDesktopRelease(value, '0.5.4'), false);
  }
  assert.equal(newerDesktopRelease('0.5.5', undefined), true);
  assert.equal(newerDesktopRelease('0.5.5', 'not a version'), false);
});
