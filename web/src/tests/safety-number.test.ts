import assert from 'node:assert/strict';
import { test } from 'node:test';

import { safetyNumber } from '../lib/safety-number';

const A = '00112233445566778899aabbccddeeff';
const B = '00112233445566778899aabbccddeefe';

test('a safety number is twenty digits in four groups, and the same every time', async () => {
  const first = await safetyNumber('alice', A);
  assert.match(first, /^\d{5} \d{5} \d{5} \d{5}$/);
  assert.equal(await safetyNumber('alice', A), first);
});

test('a different key or a different person gives a different number', async () => {
  const base = await safetyNumber('alice', A);
  assert.notEqual(await safetyNumber('alice', B), base);
  assert.notEqual(await safetyNumber('bob', A), base);
});
