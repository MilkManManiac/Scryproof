import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CRASH_WINDOW_MS, crashGuard } from '../src/crash-core.js';

const clock = () => {
  const c = { t: 1_000_000 };
  c.now = () => c.t;
  return c;
};

test('the first crash reloads', () => {
  assert.equal(crashGuard(clock().now)(), 'reload');
});
test('a second crash within a minute quits', () => {
  const c = clock();
  const crashed = crashGuard(c.now);
  crashed();
  c.t += CRASH_WINDOW_MS - 1;
  assert.equal(crashed(), 'quit');
});
test('a crash a minute or more after the last one reloads again', () => {
  const c = clock();
  const crashed = crashGuard(c.now);
  crashed();
  c.t += CRASH_WINDOW_MS;
  assert.equal(crashed(), 'reload');
  c.t += 5 * CRASH_WINDOW_MS;
  assert.equal(crashed(), 'reload');
  c.t += 1000;
  assert.equal(crashed(), 'quit');
});
