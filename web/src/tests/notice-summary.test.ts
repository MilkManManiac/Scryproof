/**
 * The bell's summary (2026-10-01): one running row per channel for whatever
 * was said while you were elsewhere, and the sentence and cards built from
 * the list. The friend's question was "where are those sounds coming from";
 * these are the rules that answer it.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type Arrival, type Notice, activityId, digestLine, forYou, namesLine, summarize, withActivity } from '../lib/notices';

const arrival = (messageId: string, patch: Partial<Arrival> = {}): Arrival => ({
  messageId,
  at: Number(messageId.replace(/\D/g, '')) || 0,
  authorId: 'lamp',
  authorName: 'lamp',
  serverId: 'table',
  serverName: 'The Table',
  channelId: 'general',
  channelName: 'general',
  preview: `said ${messageId}`,
  ...patch,
});

const mention = (id: string, patch: Partial<Notice> = {}): Notice => ({
  id,
  at: 5,
  kind: 'mention',
  authorId: 'forg',
  authorName: 'Forg',
  serverId: 'table',
  serverName: 'The Table',
  channelId: 'general',
  channelName: 'general',
  dmId: null,
  preview: 'look at this',
  read: false,
  ...patch,
});

const dm = (id: string, patch: Partial<Notice> = {}): Notice => ({
  ...mention(id),
  kind: 'dm',
  serverId: null,
  serverName: null,
  channelId: null,
  channelName: null,
  dmId: 'dm-lamp',
  authorName: 'lamp',
  preview: null,
  ...patch,
});

describe('a channel running row', () => {
  test('one row however many messages, counting each, newest speaker first, landing on the first', () => {
    let list: Notice[] = [];
    list = withActivity(list, arrival('m1'));
    list = withActivity(list, arrival('m2', { authorId: 'forg', authorName: 'Forg' }));
    list = withActivity(list, arrival('m3'));
    assert.equal(list.length, 1);
    const row = list[0]!;
    assert.equal(row.id, activityId('general'));
    assert.equal(row.count, 3);
    assert.deepEqual(row.authors?.map((who) => who.name), ['lamp', 'Forg']);
    assert.equal(row.messageId, 'm1');
    assert.equal(row.lastId, 'm3');
    assert.equal(row.preview, 'said m3');
  });

  test('a row that was read starts again from the next message', () => {
    let list = withActivity([], arrival('m1'));
    list = list.map((entry) => ({ ...entry, read: true }));
    list = withActivity(list, arrival('m9', { authorId: 'forg', authorName: 'Forg' }));
    assert.equal(list.length, 1);
    assert.equal(list[0]!.count, 1);
    assert.equal(list[0]!.messageId, 'm9');
    assert.equal(list[0]!.read, false);
    assert.deepEqual(list[0]!.authors?.map((who) => who.name), ['Forg']);
  });

  test('the busiest channel moves to the top when something new is said there', () => {
    let list = withActivity([], arrival('m1'));
    list = withActivity(list, arrival('m2', { channelId: 'dice', channelName: 'dice' }));
    list = withActivity(list, arrival('m3'));
    assert.deepEqual(list.map((entry) => entry.channelId), ['general', 'dice']);
  });
});

describe('the bell', () => {
  test('the number on it is only what was for you', () => {
    const list = [...withActivity([], arrival('m1')), mention('x1'), dm('d1')];
    assert.equal(forYou(list), 2);
  });

  test('summarizes by place, with mentions picked out and counted once', () => {
    let list: Notice[] = [];
    list = withActivity(list, arrival('m1'));
    list = withActivity(list, arrival('m2', { authorId: 'forg', authorName: 'Forg' }));
    list = [mention('m2'), ...list];
    list = withActivity(list, arrival('m3', { channelId: 'dice', channelName: 'dice' }));
    // Newest first, as the list keeps them.
    list = [dm('d2', { at: 10 }), dm('d1', { at: 9 }), ...list];

    const summary = summarize(list);
    assert.equal(summary.dms, 2);
    assert.equal(summary.mentions, 1);
    // The mention is one of general's two messages, not a third.
    assert.equal(summary.messages, 3);
    assert.equal(summary.channels, 2);

    const general = summary.places.find((place) => place.key === 'channel-general')!;
    assert.equal(general.count, 2);
    assert.deepEqual(general.names, ['Forg', 'lamp']);
    assert.equal(general.mentions.length, 1);
    assert.equal(general.open.kind, 'activity');
    assert.equal(general.open.messageId, 'm1');

    const conversation = summary.places.find((place) => place.kind === 'dm')!;
    assert.equal(conversation.count, 2);
    // Opens on the first one sent, not the last.
    assert.equal(conversation.open.id, 'd1');

    assert.equal(digestLine(summary), 'Waiting for you: 2 direct messages, 1 mention and 3 messages in 2 channels.');
  });

  test('a mention from before running rows existed still counts as a message', () => {
    const summary = summarize([mention('old')]);
    assert.equal(summary.messages, 1);
    assert.equal(summary.places[0]!.count, 1);
  });

  test('read things are not waiting', () => {
    const list = withActivity([], arrival('m1')).map((entry) => ({ ...entry, read: true }));
    assert.equal(digestLine(summarize(list)), 'Nothing new. You are caught up.');
  });

  test('names read like a sentence', () => {
    assert.equal(namesLine(['lamp']), 'lamp');
    assert.equal(namesLine(['lamp', 'Forg']), 'lamp and Forg');
    assert.equal(namesLine(['lamp', 'Forg', 'Loaf']), 'lamp, Forg and 1 other');
    assert.equal(namesLine(['lamp', 'Forg', 'Loaf', 'Wes']), 'lamp, Forg and 2 others');
  });
});
