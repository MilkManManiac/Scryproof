import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { parseByteRange } from '../lib/byte-range';

describe('parseByteRange', () => {
  it('sends the whole file with no header', () => {
    assert.equal(parseByteRange(undefined, 1000), null);
  });

  it('reads an open range, the one a video asks for to keep playing', () => {
    assert.deepEqual(parseByteRange('bytes=500-', 1000), { start: 500, end: 999 });
  });

  it('reads a closed range and clamps it to the file', () => {
    assert.deepEqual(parseByteRange('bytes=0-1', 1000), { start: 0, end: 1 });
    assert.deepEqual(parseByteRange('bytes=900-5000', 1000), { start: 900, end: 999 });
  });

  it('reads a suffix range', () => {
    assert.deepEqual(parseByteRange('bytes=-100', 1000), { start: 900, end: 999 });
  });

  it('refuses a range past the end', () => {
    assert.equal(parseByteRange('bytes=1000-', 1000), 'unsatisfiable');
  });

  it('sends the whole file for multi-range or junk', () => {
    assert.equal(parseByteRange('bytes=0-1,5-6', 1000), null);
    assert.equal(parseByteRange('items=0-1', 1000), null);
  });
});
