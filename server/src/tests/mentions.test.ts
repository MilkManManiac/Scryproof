/**
 * Who a message pings. The body says who the sender wanted; these rules are
 * what stops that being the same thing as who they get.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { mentionToken, parseMentions, roleMentionToken } from '@scryproof/shared';

import { withoutBlockers } from '../services/blocks';
import { pingableRoleIds, resolveMentions } from '../services/mentions';
import { groupReactions, isValidEmoji } from '../services/reactions';

const WES = '018f0000-0000-7000-8000-000000000001';
const ALEX = '018f0000-0000-7000-8000-000000000002';
const MARA = '018f0000-0000-7000-8000-000000000003';
const STRANGER = '018f0000-0000-7000-8000-0000000000ff';

const memberIds = new Set([WES, ALEX, MARA]);
const MODS = '018f0000-0000-7000-8000-0000000000a1';
const LOCKED = '018f0000-0000-7000-8000-0000000000a2';
const EVERYONE_ROLE = '018f0000-0000-7000-8000-0000000000a3';
const OTHER_SERVER_ROLE = '018f0000-0000-7000-8000-0000000000a4';
const serverRoles = [
  { id: MODS, mentionable: true, isEveryone: false },
  { id: LOCKED, mentionable: false, isEveryone: false },
  // Marked mentionable on purpose: it still must not be a role anyone can ping.
  { id: EVERYONE_ROLE, mentionable: true, isEveryone: true },
];
const base = { senderId: WES, memberIds, canMentionEveryone: false, serverRoles: [], replyAuthorId: null };

describe('role mentions', () => {
  const roleBase = { ...base, serverRoles };

  it('a mentionable role is pinged by anyone', () => {
    const result = resolveMentions({ ...roleBase, content: `hey ${roleMentionToken(MODS)}` });
    assert.deepEqual(result.roleIds, [MODS]);
  });

  it('a role that is not mentionable is plain text unless the sender may mention everyone', () => {
    const body = `${roleMentionToken(LOCKED)} meeting`;
    assert.deepEqual(resolveMentions({ ...roleBase, content: body }).roleIds, []);
    assert.deepEqual(resolveMentions({ ...roleBase, content: body, canMentionEveryone: true }).roleIds, [LOCKED]);
  });

  it('a refused role does not stop the rest of the message pinging', () => {
    const result = resolveMentions({
      ...roleBase,
      content: `${roleMentionToken(LOCKED)} ${mentionToken(ALEX)} ${roleMentionToken(MODS)}`,
    });
    assert.deepEqual(result, { userIds: [ALEX], roleIds: [MODS], everyone: false });
  });

  it('the @everyone role is never pingable as a role, permission or not', () => {
    const result = resolveMentions({
      ...roleBase,
      content: roleMentionToken(EVERYONE_ROLE),
      canMentionEveryone: true,
    });
    assert.deepEqual(result.roleIds, []);
  });

  it('a role from another server, or one that does not exist, is ignored', () => {
    const result = resolveMentions({
      ...roleBase,
      content: roleMentionToken(OTHER_SERVER_ROLE),
      canMentionEveryone: true,
    });
    assert.deepEqual(result.roleIds, []);
  });

  it('counts a role once however many times it is named, in any letter case', () => {
    const result = resolveMentions({
      ...roleBase,
      content: `${roleMentionToken(MODS)} <@&${MODS.toUpperCase()}>`,
    });
    assert.deepEqual(result.roleIds, [MODS]);
  });

  it('a role token is not read as a person, and a person token is not read as a role', () => {
    assert.deepEqual(parseMentions(roleMentionToken(MODS)), { userIds: [], roleIds: [MODS], everyone: false });
    assert.deepEqual(parseMentions(mentionToken(ALEX)), { userIds: [ALEX], roleIds: [], everyone: false });
  });

  it('pingableRoleIds: mentionable ones, or all but @everyone with the permission', () => {
    assert.deepEqual([...pingableRoleIds(serverRoles, false)], [MODS]);
    assert.deepEqual([...pingableRoleIds(serverRoles, true)].sort(), [MODS, LOCKED].sort());
  });
});

describe('resolveMentions', () => {
  it('pings a member who is named', () => {
    const result = resolveMentions({ ...base, content: `hey ${mentionToken(ALEX)} look` });
    assert.deepEqual(result, { userIds: [ALEX], roleIds: [], everyone: false });
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
    assert.deepEqual(result, { userIds: [ALEX], roleIds: [], everyone: false });
  });
});

/**
 * The rule `pingTargets` and `bumpMentions` both go through. Blocking is
 * subtraction at the last moment: the mention is resolved and stored as it
 * always was, and the person who blocked the author simply is not reached.
 */
describe('who a blocked author reaches', () => {
  it('drops whoever has blocked the sender and keeps everyone else', () => {
    assert.deepEqual(withoutBlockers([ALEX, MARA], new Set([MARA])), [ALEX]);
  });

  it('changes nothing when nobody has blocked them', () => {
    assert.deepEqual(withoutBlockers([ALEX, MARA], new Set()), [ALEX, MARA]);
  });

  it('an @everyone from a blocked author reaches everyone but the blocker', () => {
    assert.deepEqual(withoutBlockers([...memberIds], new Set([ALEX])), [WES, MARA]);
  });

  it('blocking is one way: the set is who blocked the sender, not who they blocked', () => {
    // WES has blocked ALEX. Nobody has blocked WES, so a message from WES
    // still pings ALEX: what WES chose was what WES sees.
    assert.deepEqual(withoutBlockers([ALEX], new Set()), [ALEX]);
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
