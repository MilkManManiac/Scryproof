/**
 * The initiative tracker's turn and round arithmetic.
 *
 * Pure, like dice.test.ts: the routes only load a row, hand it to these, and
 * store what comes back, so this is where "whose turn is it now" is decided
 * and where it is pinned down.
 *
 *   npm test
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { currentEntry, endedLine, insertByInitiative, nextTurn, removeEntry, reorderEntries } from '@scryproof/shared';
import type { TrackerEntry, TurnState } from '@scryproof/shared';

function entry(id: string, initiative: number): TrackerEntry {
  return { id, name: id, userId: null, initiative, note: '' };
}

/** Aria 18, Bram 12, Cole 7: a fight already sorted. */
function fight(round: number, turn: number): TurnState {
  return { round, turn, entries: [entry('aria', 18), entry('bram', 12), entry('cole', 7)] };
}

const ids = (entries: TrackerEntry[]) => entries.map((item) => item.id);

describe('nextTurn', () => {
  it('moves to the next in the order within a round', () => {
    assert.deepEqual(nextTurn(fight(1, 0)), { round: 1, turn: 1 });
    assert.deepEqual(nextTurn(fight(3, 1)), { round: 3, turn: 2 });
  });

  it('wraps to the top and starts a new round after the last', () => {
    assert.deepEqual(nextTurn(fight(1, 2)), { round: 2, turn: 0 });
    assert.deepEqual(nextTurn(fight(4, 2)), { round: 5, turn: 0 });
  });

  it('does nothing to an empty order', () => {
    assert.deepEqual(nextTurn({ round: 2, turn: 0, entries: [] }), { round: 2, turn: 0 });
  });

  it('with one combatant, every turn is a new round', () => {
    const alone = { round: 1, turn: 0, entries: [entry('solo', 10)] };
    assert.deepEqual(nextTurn(alone), { round: 2, turn: 0 });
  });
});

describe('insertByInitiative', () => {
  it('puts a newcomer in initiative order, highest first', () => {
    const { entries } = insertByInitiative(fight(1, 0), entry('dara', 14));
    assert.deepEqual(ids(entries), ['aria', 'dara', 'bram', 'cole']);
  });

  it('settles a tie by who was in first', () => {
    const { entries } = insertByInitiative(fight(1, 0), entry('dara', 12));
    assert.deepEqual(ids(entries), ['aria', 'bram', 'dara', 'cole']);
  });

  it('keeps the turn at the top while nobody has gone yet', () => {
    const { entries, turn } = insertByInitiative(fight(1, 0), entry('dara', 20));
    assert.equal(entries[turn]?.id, 'dara');
  });

  it('keeps the turn with whoever is acting once the fight is under way', () => {
    // Bram is acting; a newcomer who rolled higher acts from next round.
    const state = fight(2, 1);
    const { entries, turn } = insertByInitiative(state, entry('dara', 20));
    assert.deepEqual(ids(entries), ['dara', 'aria', 'bram', 'cole']);
    assert.equal(entries[turn]?.id, 'bram');
  });

  it('leaves the turn alone for a newcomer lower in the order', () => {
    const { entries, turn } = insertByInitiative(fight(2, 1), entry('dara', 1));
    assert.equal(entries[turn]?.id, 'bram');
  });

  it('the first into an empty order has the turn', () => {
    const { entries, turn } = insertByInitiative({ round: 3, turn: 0, entries: [] }, entry('solo', 5));
    assert.deepEqual(ids(entries), ['solo']);
    assert.equal(turn, 0);
  });
});

describe('removeEntry', () => {
  it('is null for someone not in the order', () => {
    assert.equal(removeEntry(fight(1, 0), 'nobody'), null);
  });

  it('keeps the turn with whoever is acting when someone before them leaves', () => {
    const next = removeEntry(fight(2, 2), 'aria');
    assert.ok(next);
    assert.equal(currentEntry(next)?.id, 'cole');
    assert.equal(next.round, 2);
  });

  it('keeps the turn when someone after them leaves', () => {
    const next = removeEntry(fight(2, 0), 'cole');
    assert.ok(next);
    assert.equal(currentEntry(next)?.id, 'aria');
  });

  it('passes the turn to whoever was next when the one acting leaves', () => {
    const next = removeEntry(fight(2, 1), 'bram');
    assert.ok(next);
    assert.equal(currentEntry(next)?.id, 'cole');
    assert.equal(next.round, 2);
  });

  it('starts the next round when the last in the order leaves on their turn', () => {
    const next = removeEntry(fight(2, 2), 'cole');
    assert.ok(next);
    assert.equal(currentEntry(next)?.id, 'aria');
    assert.equal(next.round, 3);
  });

  it('leaves an empty order at turn 0 in the same round', () => {
    const next = removeEntry({ round: 4, turn: 0, entries: [entry('solo', 5)] }, 'solo');
    assert.deepEqual(next, { round: 4, turn: 0, entries: [] });
  });
});

describe('reorderEntries', () => {
  it('refuses an order that drops, repeats or invents anyone', () => {
    const state = fight(2, 0);
    assert.equal(reorderEntries(state, ['aria', 'bram']), null);
    assert.equal(reorderEntries(state, ['aria', 'aria', 'bram']), null);
    assert.equal(reorderEntries(state, ['aria', 'bram', 'zed']), null);
  });

  it('keeps the turn with whoever is acting, wherever they land', () => {
    const result = reorderEntries(fight(2, 1), ['bram', 'cole', 'aria']);
    assert.ok(result);
    assert.deepEqual(ids(result.entries), ['bram', 'cole', 'aria']);
    assert.equal(result.entries[result.turn]?.id, 'bram');
  });

  it('keeps the turn at the top while nobody has gone yet', () => {
    const result = reorderEntries(fight(1, 0), ['cole', 'aria', 'bram']);
    assert.ok(result);
    assert.equal(result.turn, 0);
    assert.equal(result.entries[0]?.id, 'cole');
  });
});

describe('a whole fight', () => {
  it('counts rounds the way the table does', () => {
    let state: TurnState = { round: 1, turn: 0, entries: [] };
    for (const newcomer of [entry('bram', 12), entry('aria', 18), entry('cole', 7)]) {
      state = { ...state, ...insertByInitiative(state, newcomer) };
    }
    assert.deepEqual(ids(state.entries), ['aria', 'bram', 'cole']);

    const seen: string[] = [];
    for (let step = 0; step < 7; step += 1) {
      seen.push(`${state.round}:${currentEntry(state)?.id}`);
      state = { ...state, ...nextTurn(state) };
    }
    assert.deepEqual(seen, ['1:aria', '1:bram', '1:cole', '2:aria', '2:bram', '2:cole', '3:aria']);
    assert.equal(endedLine(state.round), 'Initiative ended after 3 rounds.');
    assert.equal(endedLine(1), 'Initiative ended after 1 round.');
  });
});
