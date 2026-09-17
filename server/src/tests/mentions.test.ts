/**
 * Who a message pings. The body says who the sender wanted; these rules are
 * what stops that being the same thing as who they get.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mentionToken } from '@gooffline/shared';

import { resolveMentions } from '../services/mentions';
import { groupReactions, isValidEmoji } from '../services/reactions';

const WES = '018f0000-0000-7000-8000-000000000001';
const ALEX = '018f0000-0000-7000-8000-000000000002';
const MARA = '018f0000-0000-7000-8000-000000000003';
const STRANGER = '018f0000-0000-7000-8000-0000000000ff';

const memberIds = new Set([WES, ALEX, MARA]);
const base = { senderId: WES, memberIds, canMentionEveryone: false, replyAuthorId: null };

describe('resolveMentions', () => {
  it('pings a member who is named', () => {
    const result = resolveMentions({ ...base, content: `hey ${mentionToken(ALEX)} look` });
    assert.deepEqual(result, { userIds: [ALEX], everyone: false });
  });

  it('ignores an id that is not a member of this server', () => {
    const result = resolveMentions({ ...base, content: `${mentionToken(STRANGER)} ${mentionToken(ALEX)}` });
    assert.deepEqual(result.userIds, [ALEX]);
  });

  it('never pings the sender, even if they name themselves', () => {
    const result = resolveMentions({ ...base, content: `${mentionToken(WES)} note to self` });
    assert.deepEqual(result.userIds, []);
  });

  it('counts someone once however many times they are named', () => {
    const result = resolveMentions({ ...base, content: `${mentionToken(ALEX)} ${mentionToken(ALEX)}` });
    assert.deepEqual(result.userIds, [ALEX]);
  });

  it('treats an upper-case id as the same person', () => {
    const result = resolveMentions({ ...base, content: `<@${ALEX.toUpperCase()}>` });
    assert.deepEqual(result.userIds, [ALEX]);
  });

  it('@everyone is a permission, not a word anyone can type', () => {
    assert.equal(resolveMentions({ ...base, content: 'listen up @everyone' }).everyone, false);
    assert.equal(
      resolveMentions({ ...base, content: 'listen up @everyone', canMentionEveryone: true }).everyone,
      true,
    );
  });

  it('does not find @everyone inside another word', () => {
    const result = resolveMentions({ ...base, content: 'mail me at wes@everyone.example', canMentionEveryone: true });
    assert.equal(result.everyone, false);
  });

  it('a reply pings the author of the message it answers', () => {
    const result = resolveMentions({ ...base, content: 'agreed', replyAuthorId: MARA });
    assert.deepEqual(result.userIds, [MARA]);
  });

  it('replying to yourself pings nobody', () => {
    const result = resolveMentions({ ...base, content: 'and another thing', replyAuthorId: WES });
    assert.deepEqual(result.userIds, []);
  });

  it('replying to someone who has left the server pings nobody', () => {
    const result = resolveMentions({ ...base, content: 'late reply', replyAuthorId: STRANGER });
    assert.deepEqual(result.userIds, []);
  });

  it('a message with no body can still ping through its reply', () => {
    const result = resolveMentions({ ...base, content: null, replyAuthorId: ALEX });
    assert.deepEqual(result, { userIds: [ALEX], everyone: false });
  });
});

describe('reaction shape', () => {
  it('refuses empty, overlong, and anything with whitespace in it', () => {
    assert.equal(isValidEmoji(''), false);
    assert.equal(isValidEmoji('a b'), false);
    assert.equal(isValidEmoji('x'.repeat(33)), false);
    assert.equal(isValidEmoji('\u{1F44D}'), true);
    assert.equal(isValidEmoji('\u{1F468}‍\u{1F469}‍\u{1F467}'), true);
  });

  it('groups by emoji, in order of first reaction, people in the order they reacted', () => {
    const grouped = groupReactions([
      { emoji: 'b', userId: ALEX },
      { emoji: 'a', userId: WES },
      { emoji: 'b', userId: MARA },
    ]);
    assert.deepEqual(grouped, [
      { emoji: 'b', userIds: [ALEX, MARA] },
      { emoji: 'a', userIds: [WES] },
    ]);
  });
});
