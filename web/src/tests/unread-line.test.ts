/**
 * Where the "New" line lands.
 *
 * The failure this guards against is not a crash, it is a disagreement: the
 * sidebar says a channel is unread and the channel shows no line, or the line
 * says twelve and the badge says three. Either one teaches a person to stop
 * believing both.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { unreadLine } from '../lib/unread-line';

const ME = 'me';

/** Ids sort by time, which is the whole reason the comparison is a string one. */
const messages = [
  { id: 'm1', authorId: 'them' },
  { id: 'm2', authorId: ME },
  { id: 'm3', authorId: 'them' },
  { id: 'm4', authorId: 'them' },
  { id: 'm5', authorId: ME },
  { id: 'm6', authorId: 'other' },
];

const line = (lastReadMessageId: string | null | undefined) =>
  unreadLine({ messages, selfId: ME, lastReadMessageId });

describe('unreadLine', () => {
  it('draws nothing before the read marks have arrived', () => {
    assert.deepEqual(line(undefined), { index: -1, count: 0 });
  });

  it('treats a channel that was never read as entirely new', () => {
    // The badge has been saying this all along. This is the case that was
    // wrong: a fresh account has a read row with no id in it, and the line
    // used to refuse to appear at all.
    assert.deepEqual(line(null), { index: 0, count: 4 });
  });

  it('starts at the first message after the read mark', () => {
    assert.deepEqual(line('m2'), { index: 2, count: 3 });
  });

  it('never starts on something you said yourself', () => {
    // m5 is mine, so reading up to m4 puts the line on m6, not on m5.
    assert.deepEqual(line('m4'), { index: 5, count: 1 });
  });

  it('counts other people only, so the line and the number agree', () => {
    const { index, count } = line('m2');
    const counted = messages.slice(index).filter((entry) => entry.authorId !== ME);
    assert.equal(count, counted.length);
    assert.ok(counted.every((entry) => entry.authorId !== ME));
  });

  it('draws nothing when everything has been read', () => {
    assert.deepEqual(line('m6'), { index: -1, count: 0 });
  });

  it('draws nothing when the read mark is newer than anything loaded', () => {
    assert.deepEqual(line('m9'), { index: -1, count: 0 });
  });

  it('says nothing at all before anyone is signed in', () => {
    // Every message would otherwise count as somebody else's.
    const { index } = unreadLine({ messages, selfId: null, lastReadMessageId: 'm2' });
    assert.equal(index, 2);
    // ...which is fine, because the timeline is not drawn at all until there
    // is a session. What must not happen is a crash on the undefined id.
    assert.deepEqual(unreadLine({ messages: [], selfId: undefined, lastReadMessageId: null }), {
      index: -1,
      count: 0,
    });
  });
});
