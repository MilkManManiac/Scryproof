import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { markerForKey, wrapSelection } from '../lib/markup';

describe('wrapSelection', () => {
  it('wraps what is selected and keeps it selected', () => {
    const next = wrapSelection({ value: 'say it loud', start: 4, end: 6 }, '**');
    assert.deepEqual(next, { value: 'say **it** loud', start: 6, end: 8 });
  });

  it('drops a pair with the caret between when nothing is selected', () => {
    const next = wrapSelection({ value: 'say ', start: 4, end: 4 }, '*');
    assert.deepEqual(next, { value: 'say **', start: 5, end: 5 });
  });

  it('takes the mark off again when the selection already has it', () => {
    assert.deepEqual(wrapSelection({ value: 'say **it** loud', start: 4, end: 10 }, '**'), {
      value: 'say it loud',
      start: 4,
      end: 6,
    });
    assert.deepEqual(wrapSelection({ value: 'say **it** loud', start: 6, end: 8 }, '**'), {
      value: 'say it loud',
      start: 4,
      end: 6,
    });
  });

  it('marks stack: bold inside strike', () => {
    const next = wrapSelection({ value: '~~gone~~', start: 2, end: 6 }, '**');
    assert.equal(next.value, '~~**gone**~~');
  });
});

describe('markerForKey', () => {
  const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key: k,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it('knows the four keys', () => {
    assert.equal(markerForKey(key('b')), '**');
    assert.equal(markerForKey(key('i')), '*');
    assert.equal(markerForKey(key('X', { shiftKey: true })), '~~');
    assert.equal(markerForKey(key('e')), '`');
  });

  it('ignores the same letters without the modifier, or with Alt', () => {
    assert.equal(markerForKey(key('b', { ctrlKey: false })), null);
    assert.equal(markerForKey(key('b', { altKey: true })), null);
    assert.equal(markerForKey(key('x')), null);
  });
});
