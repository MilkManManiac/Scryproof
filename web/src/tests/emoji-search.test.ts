/**
 * The picker's search box.
 *
 * Wes: "pregnant man emoji isn't in" -- it was, `SHORTCODES` just had no
 * screen for it. The rule under test is that typing finds a name regardless
 * of whether it is spelled with an underscore or a space, and that a name
 * starting with what was typed beats one that merely contains it.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { emojiSearchScore, searchShortcodes } from '../lib/emoji';

describe('emojiSearchScore', () => {
  it('treats underscores and spaces alike', () => {
    assert.equal(emojiSearchScore('pregnant_man', 'pregnant man'), 0);
    assert.equal(emojiSearchScore('pregnant_man', 'pregnant_man'), 0);
    assert.equal(emojiSearchScore('pregnant man', 'pregnant_man'), 0);
  });

  it('scores a prefix match ahead of a mid-name match', () => {
    assert.equal(emojiSearchScore('smile', 'smi'), 0);
    assert.equal(emojiSearchScore('grin', 'in'), 1);
  });

  it('refuses a name that does not contain the query', () => {
    assert.equal(emojiSearchScore('smile', 'zzz'), null);
  });

  it('refuses an empty query', () => {
    assert.equal(emojiSearchScore('smile', ''), null);
    assert.equal(emojiSearchScore('smile', '   '), null);
  });

  it('is case-insensitive', () => {
    assert.equal(emojiSearchScore('Fire', 'FIRE'), 0);
  });
});

describe('searchShortcodes', () => {
  it('finds the pregnant man emoji by a typed space', () => {
    const hits = searchShortcodes('pregnant man');
    assert.ok(hits.some((hit) => hit.name === 'pregnant_man' && hit.emoji === '🫃'));
  });

  it('puts a name that starts with the text before one that only contains it', () => {
    const hits = searchShortcodes('fire').map((hit) => hit.name);
    assert.equal(hits[0], 'fire');
  });

  it('is empty for an empty query', () => {
    assert.equal(searchShortcodes('').length, 0);
  });

  it('caps the result at the given limit', () => {
    // "a" is in most names; the cap should still hold.
    assert.equal(searchShortcodes('a', 5).length, 5);
  });

  it('finds nothing for a query no name contains', () => {
    assert.equal(searchShortcodes('xyzzyplugh').length, 0);
  });
});
