/**
 * Events on the client: the time typed into the form, and keeping the list
 * right as answers and edits arrive.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ScheduledEvent } from '@scryproof/shared';

import { toLocalInput, toUtcIso, upcoming, withAnswer, withEvent } from '../lib/events';
import { eventNoticeFor } from '../lib/notices';

const event = (id: string, startsAt: string, patch: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  id,
  serverId: 'table',
  channelId: null,
  title: `Session ${id}`,
  note: '',
  startsAt,
  createdBy: 'wes',
  createdAt: '2026-09-01T00:00:00.000Z',
  counts: { going: 0, maybe: 0, no: 0 },
  myAnswer: null,
  ...patch,
});

describe('the time in the form', () => {
  test('a wall-clock time round-trips through UTC in this zone', () => {
    const iso = toUtcIso('2026-09-25T19:00');
    assert.ok(iso);
    assert.equal(toLocalInput(iso), '2026-09-25T19:00');
  });

  test('an empty or half-typed field is not a time', () => {
    assert.equal(toUtcIso(''), null);
    assert.equal(toUtcIso('2026-09-25'), null);
  });
});

describe('the list', () => {
  test('only what is still to come, soonest first', () => {
    const now = Date.parse('2026-09-22T12:00:00Z');
    const list = [
      event('b', '2026-09-26T19:00:00.000Z'),
      event('gone', '2026-09-22T11:00:00.000Z'),
      event('a', '2026-09-23T19:00:00.000Z'),
    ];
    assert.deepEqual(
      upcoming(list, now).map((entry) => entry.id),
      ['a', 'b'],
    );
  });

  test('an update keeps the answer this person already gave', () => {
    const list = [event('a', '2026-09-23T19:00:00.000Z', { myAnswer: 'going' })];
    const { myAnswer: _dropped, ...base } = event('a', '2026-09-24T19:00:00.000Z', { title: 'Moved' });
    void _dropped;
    const next = withEvent(list, base);
    assert.equal(next.length, 1);
    assert.equal(next[0]?.title, 'Moved');
    assert.equal(next[0]?.myAnswer, 'going');
  });

  test('a new event is added with no answer', () => {
    const next = withEvent([], event('a', '2026-09-23T19:00:00.000Z'));
    assert.equal(next[0]?.myAnswer, null);
  });

  test("somebody else's answer changes the counts and not mine", () => {
    const list = [event('a', '2026-09-23T19:00:00.000Z', { myAnswer: 'maybe' })];
    const counts = { going: 1, maybe: 1, no: 0 };
    const theirs = withAnswer(list, { eventId: 'a', userId: 'alex', answer: 'going', counts }, 'wes');
    assert.deepEqual(theirs[0]?.counts, counts);
    assert.equal(theirs[0]?.myAnswer, 'maybe');

    const mine = withAnswer(list, { eventId: 'a', userId: 'wes', answer: null, counts }, 'wes');
    assert.equal(mine[0]?.myAnswer, null);
  });
});

describe('the reminder', () => {
  test('is always listed, and pops up only when the window is elsewhere and not muted', () => {
    assert.deepEqual(eventNoticeFor({ windowFocused: true, muted: false }), { list: true, popup: false });
    assert.deepEqual(eventNoticeFor({ windowFocused: false, muted: false }), { list: true, popup: true });
    assert.deepEqual(eventNoticeFor({ windowFocused: false, muted: true }), { list: true, popup: false });
  });
});
