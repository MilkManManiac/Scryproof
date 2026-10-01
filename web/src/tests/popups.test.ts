/**
 * What a pop-up says at each step, and the one rule that must not bend: a
 * direct message's words never go to the computer's own notifications.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { popupText, popups } from '../lib/popups';
import type { PopupCard } from '../lib/popups';

const card = (patch: Partial<PopupCard> = {}): PopupCard => ({
  id: 'x',
  moment: 'mention',
  who: 'lamp',
  where: '#general · The Table',
  what: 'are we still on for tonight?',
  open: () => undefined,
  ...patch,
});

describe('popupText', () => {
  test('who says only who', () => {
    assert.deepEqual(popupText(card(), 'who'), { title: 'lamp mentioned you', lines: [] });
  });

  test('who and where adds where', () => {
    assert.deepEqual(popupText(card(), 'where'), { title: 'lamp mentioned you', lines: ['#general · The Table'] });
  });

  test('everything adds the first line', () => {
    assert.deepEqual(popupText(card(), 'what').lines, ['#general · The Table', 'are we still on for tonight?']);
  });

  test("a DM's words show in the app's own card but never in the computer's notification", () => {
    const dm = card({ moment: 'dm', where: null, what: 'secret plans' });
    assert.deepEqual(popupText(dm, 'what').lines, ['secret plans']);
    assert.deepEqual(popupText(dm, 'what', true).lines, []);
    assert.equal(popupText(dm, 'who').title, 'lamp sent you a message');
  });

  test("an encrypted channel's words follow the same rule", () => {
    const sealed = card({ secret: true, what: 'the vault code' });
    assert.deepEqual(popupText(sealed, 'what').lines, ['#general · The Table', 'the vault code']);
    assert.deepEqual(popupText(sealed, 'what', true).lines, ['#general · The Table']);
  });

  test('a group DM names the group', () => {
    const group = card({ moment: 'dm', where: null, what: null, group: 'Friday Night' });
    assert.equal(popupText(group, 'who').title, 'lamp wrote in a group');
    assert.deepEqual(popupText(group, 'where').lines, ['Friday Night']);
  });

  test('voice moments read as sentences', () => {
    assert.equal(popupText(card({ moment: 'live', what: null }), 'who').title, 'lamp went live');
    assert.equal(popupText(card({ moment: 'joined', what: null }), 'who').title, 'lamp joined a voice room');
  });
});

describe('going to look', () => {
  test('takes away every card about that place and leaves the rest', () => {
    popups.show(card({ id: 'a', place: 'maps' }));
    popups.show(card({ id: 'b', place: 'general' }));
    popups.show(card({ id: 'c', place: 'maps' }));
    popups.dismissPlace('maps');
    assert.deepEqual(popups.get().map((entry) => entry.id), ['b']);
    popups.dismissPlace('nowhere');
    assert.deepEqual(popups.get().map((entry) => entry.id), ['b']);
    popups.dismiss('b');
  });
});
