/**
 * The changelog's shape, and when the dot shows.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { CHANGELOG, LATEST_RELEASE } from '../changelog';
import { unreadSince } from '../lib/whats-new';

describe('the changelog', () => {
  it('is newest first with unique ids and real dates', () => {
    const ids = CHANGELOG.map((release) => release.id);
    assert.equal(new Set(ids).size, ids.length);
    for (let index = 1; index < CHANGELOG.length; index += 1) {
      assert.ok(CHANGELOG[index - 1]!.date >= CHANGELOG[index]!.date, `${ids[index]} is out of order`);
    }
    for (const release of CHANGELOG) {
      assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(release.id.startsWith(release.date), `${release.id} should start with its date`);
      assert.ok(release.notes.length > 0, `${release.id} says nothing`);
    }
    assert.equal(LATEST_RELEASE, CHANGELOG[0]);
  });
});

describe('the dot', () => {
  it('shows only for something newer than what was last read', () => {
    assert.equal(unreadSince(null, 'b'), false, 'a first visit is not news');
    assert.equal(unreadSince('b', 'b'), false);
    assert.equal(unreadSince('a', 'b'), true);
  });
});
