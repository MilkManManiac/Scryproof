/**
 * What goes on the list behind the bell, and what pops up.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type Notice, bySource, noticeFor, previewOf, withNotice } from '../lib/notices';

const base = { authorId: 'alex', selfId: 'wes', addressedToMe: true, watching: false, windowFocused: true };

const notice = (id: string, patch: Partial<Notice> = {}): Notice => ({
  id,
  at: 0,
  kind: 'mention',
  authorId: 'alex',
  authorName: 'Alex',
  serverId: 'table',
  serverName: 'The Table',
  channelId: 'general',
  channelName: 'general',
  dmId: null,
  preview: null,
  read: false,
  ...patch,
});

describe('what counts as a notice', () => {
  test('something addressed to you, elsewhere in a window you are in, is listed without a pop-up', () => {
    assert.deepEqual(noticeFor(base), { list: true, popup: false });
  });

  test('with the window in the background it pops up too', () => {
    assert.deepEqual(noticeFor({ ...base, windowFocused: false }), { list: true, popup: true });
  });

  test('what you watched arrive is not news', () => {
    assert.deepEqual(noticeFor({ ...base, watching: true }), { list: false, popup: false });
  });

  test('your own words, from this device or another, are never news', () => {
    assert.deepEqual(noticeFor({ ...base, authorId: 'wes', windowFocused: false }), { list: false, popup: false });
  });

  test('a message that does not name you is not listed, however far away you are', () => {
    assert.deepEqual(noticeFor({ ...base, addressedToMe: false, windowFocused: false }), { list: false, popup: false });
  });

  test('nothing is listed before it is known who is signed in', () => {
    assert.deepEqual(noticeFor({ ...base, selfId: null }), { list: false, popup: false });
  });
});

describe('the list', () => {
  test('newest first, and the same message never twice', () => {
    let list = withNotice([], notice('1'));
    list = withNotice(list, notice('2'));
    list = withNotice(list, notice('1'));
    assert.deepEqual(list.map((entry) => entry.id), ['2', '1']);
  });

  test('it forgets the oldest rather than growing for ever', () => {
    let list: Notice[] = [];
    for (let index = 0; index < 260; index += 1) list = withNotice(list, notice(String(index)));
    assert.equal(list.length, 200);
    assert.equal(list[0]?.id, '259');
  });

  test('counts say where it all came from, busiest first, DMs as their own place', () => {
    const list = [
      notice('1'),
      notice('2', { read: true }),
      notice('3', { serverId: 'other', serverName: 'Other' }),
      notice('4', { kind: 'dm', serverId: null, serverName: null, channelId: null, channelName: null, dmId: 'dm-1' }),
    ];
    assert.deepEqual(bySource(list), [
      { key: 'table', label: 'The Table', total: 2, unread: 1 },
      { key: 'other', label: 'Other', total: 1, unread: 1 },
      { key: 'dm', label: 'Direct messages', total: 1, unread: 1 },
    ]);
  });

  test('a preview is one line and not the whole essay', () => {
    assert.equal(previewOf('  two\n\nlines  '), 'two lines');
    assert.equal(previewOf(null), null);
    assert.equal(previewOf('   '), null);
    assert.equal(previewOf('x'.repeat(500))?.length, 140);
  });
});
