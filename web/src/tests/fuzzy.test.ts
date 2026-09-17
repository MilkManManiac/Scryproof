/**
 * How the quick switcher decides what you meant.
 *
 * The rule being defended is that the obvious answer comes first. Anyone using
 * this types three letters and hits Enter without reading, so a list that is
 * merely correct and not ordered is a list that sends people to the wrong
 * channel.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { fuzzyScore } from '../lib/fuzzy';

/** The names in order, best first, the way the switcher sorts them. */
function rank(names: string[], query: string): string[] {
  return names
    .map((name) => ({ name, score: fuzzyScore(name, query) }))
    .filter((entry): entry is { name: string; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

describe('fuzzyScore', () => {
  it('matches letters in order rather than a substring', () => {
    assert.notEqual(fuzzyScore('session-planning', 'spl'), null);
    assert.notEqual(fuzzyScore('session-planning', 'plan'), null);
  });

  it('refuses letters that are not all there', () => {
    assert.equal(fuzzyScore('maps', 'mapz'), null);
    assert.equal(fuzzyScore('maps', 'sam'), null); // Right letters, wrong order.
  });

  it('takes everything when nothing is typed', () => {
    assert.equal(fuzzyScore('anything', ''), 0);
  });

  it('puts a letter that starts a word ahead of one buried mid-word', () => {
    // Both hold s then p. Only one has the p starting a word.
    assert.deepEqual(rank(['suspend', 'session-planning'], 'sp'), ['session-planning', 'suspend']);
  });

  it('prefers the shorter of two names with the same letters', () => {
    assert.deepEqual(rank(['maps', 'map-requests'], 'map'), ['maps', 'map-requests']);
  });

  it('finds the channel by its second word', () => {
    assert.deepEqual(rank(['general', 'session-planning', 'maps'], 'plan'), ['session-planning']);
  });
});
