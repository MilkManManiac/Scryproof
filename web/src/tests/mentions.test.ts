/**
 * Mentions between what is typed and what is stored, for roles: which ones
 * turn into a token, and what a token reads as when the role is gone.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { Member, Role } from '@scryproof/shared';

import { DELETED_ROLE, fromDraft, pingableRoles, pingsHeldRole, toDraft, toPlainLine } from '../lib/mentions';

const MODS = '018f0000-0000-7000-8000-0000000000a1';
const LOCKED = '018f0000-0000-7000-8000-0000000000a2';
const EVERYONE = '018f0000-0000-7000-8000-0000000000a3';

const role = (id: string, name: string, extra: Partial<Role> = {}): Role => ({
  id,
  serverId: 's',
  name,
  color: '#3366ff',
  position: 1,
  permissions: '0',
  hoist: false,
  mentionable: false,
  isEveryone: false,
  ...extra,
});

const roles = [
  role(MODS, 'Table Mods', { mentionable: true }),
  role(LOCKED, 'Officers'),
  role(EVERYONE, 'everyone', { isEveryone: true, mentionable: true }),
];

const alex = {
  userId: '018f0000-0000-7000-8000-000000000002',
  serverId: 's',
  nickname: null,
  roleIds: [],
  joinedAt: '',
  timeoutUntil: null,
  user: { id: '018f0000-0000-7000-8000-000000000002', username: 'alex', displayName: 'Alex' },
} as unknown as Member;

describe('which roles are offered', () => {
  it('only mentionable ones, without the permission', () => {
    assert.deepEqual(pingableRoles(roles, false).map((entry) => entry.id), [MODS]);
  });

  it('every role but @everyone, with the permission', () => {
    assert.deepEqual(pingableRoles(roles, true).map((entry) => entry.id), [MODS, LOCKED]);
  });
});

describe('typed role to token and back', () => {
  it('turns @Role Name into a token, longest name first', () => {
    const longer = [...roles, role('018f0000-0000-7000-8000-0000000000b1', 'Table', { mentionable: true })];
    const text = fromDraft('hey @Table Mods and @Table', [alex], pingableRoles(longer, false));
    assert.equal(text, `hey <@&${MODS}> and <@&018f0000-0000-7000-8000-0000000000b1>`);
  });

  it('leaves a role the sender may not ping as plain text', () => {
    assert.equal(fromDraft('@Officers now', [alex], pingableRoles(roles, false)), '@Officers now');
  });

  it('a person wins over a role with the same name', () => {
    const same = [role('018f0000-0000-7000-8000-0000000000b2', 'Alex', { mentionable: true })];
    assert.equal(fromDraft('@Alex', [alex], same), `<@${alex.userId}>`);
  });

  it('edits back to @Role Name, and a deleted role reads as @deleted-role, never an id', () => {
    assert.equal(toDraft(`<@&${MODS}> go`, [alex], roles), '@Table Mods go');
    const gone = toDraft(`<@&${MODS}> go`, [alex], []);
    assert.equal(gone, `${DELETED_ROLE} go`);
    assert.ok(!gone.includes(MODS));
    assert.equal(toPlainLine(`<@&${MODS}> go`, [alex], []), `${DELETED_ROLE} go`);
  });
});

describe('a message that pinged a role you hold', () => {
  it('is told by the ids the server recorded', () => {
    assert.equal(pingsHeldRole([MODS], [MODS, LOCKED]), true);
    assert.equal(pingsHeldRole([MODS], [LOCKED]), false);
    assert.equal(pingsHeldRole(undefined, [MODS]), false);
    assert.equal(pingsHeldRole([], [MODS]), false);
  });
});
