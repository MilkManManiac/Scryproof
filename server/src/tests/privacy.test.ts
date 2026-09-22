/**
 * The private-channel switch, as overwrite arithmetic.
 *
 * The rule under test: only the View channel bit moves. Anything else an
 * overwrite says about a role or a person is kept through both directions of
 * the switch, and the switch reads back as exactly what it wrote.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Permission } from '@scryproof/shared';

import { planPrivacy, readPrivacy } from '../services/privacy.js';
import type { OverwriteLike } from '../services/privacy.js';

const EVERYONE = 'role-everyone';
const VIEW = Permission.VIEW_CHANNEL;
const SEND = Permission.SEND_MESSAGES;

const row = (targetType: string, targetId: string, allow = 0n, deny = 0n): OverwriteLike => ({ targetType, targetId, allow, deny });

/** Apply a plan to a list, the way the database would. */
function after(existing: OverwriteLike[], plan: ReturnType<typeof planPrivacy>): OverwriteLike[] {
  const key = (r: { targetType: string; targetId: string }) => `${r.targetType}:${r.targetId}`;
  const gone = new Set(plan.remove.map(key));
  const changed = new Map(plan.upsert.map((r) => [key(r), r]));
  const kept = existing.filter((r) => !gone.has(key(r))).map((r) => changed.get(key(r)) ?? r);
  const added = plan.upsert.filter((r) => !existing.some((e) => key(e) === key(r)));
  return [...kept, ...added];
}

describe('the private switch', () => {
  test('a public channel with no overwrites reads as public', () => {
    assert.deepEqual(readPrivacy([], EVERYONE), { private: false, roleIds: [], memberIds: [] });
  });

  test('turning it on denies @everyone and lets the chosen in, and reads back the same', () => {
    const wanted = { private: true, roleIds: ['role-mods'], memberIds: ['user-alex'] };
    const rows = after([], planPrivacy([], EVERYONE, wanted));
    assert.deepEqual(readPrivacy(rows, EVERYONE), wanted);
    assert.equal(rows.find((r) => r.targetId === EVERYONE)?.deny, VIEW);
  });

  test('turning it off removes what it wrote, leaving nothing behind', () => {
    const on = after([], planPrivacy([], EVERYONE, { private: true, roleIds: ['role-mods'], memberIds: [] }));
    const off = after(on, planPrivacy(on, EVERYONE, { private: false, roleIds: [], memberIds: [] }));
    assert.deepEqual(off, []);
  });

  test('other bits on the same overwrites are not touched either way', () => {
    const existing = [row('role', EVERYONE, 0n, SEND), row('role', 'role-mods', SEND, 0n)];
    const on = after(existing, planPrivacy(existing, EVERYONE, { private: true, roleIds: ['role-mods'], memberIds: [] }));
    assert.equal(on.find((r) => r.targetId === EVERYONE)?.deny, SEND | VIEW);
    assert.equal(on.find((r) => r.targetId === 'role-mods')?.allow, SEND | VIEW);
    const off = after(on, planPrivacy(on, EVERYONE, { private: false, roleIds: [], memberIds: [] }));
    assert.deepEqual(off, existing);
  });

  test('changing the list takes View away from those dropped and gives it to those added', () => {
    const on = after([], planPrivacy([], EVERYONE, { private: true, roleIds: ['role-a'], memberIds: [] }));
    const changed = after(on, planPrivacy(on, EVERYONE, { private: true, roleIds: ['role-b'], memberIds: ['user-x'] }));
    assert.deepEqual(readPrivacy(changed, EVERYONE), { private: true, roleIds: ['role-b'], memberIds: ['user-x'] });
    assert.ok(!changed.some((r) => r.targetId === 'role-a'));
  });

  test('a role that was denied View by hand is un-denied when let in', () => {
    const existing = [row('role', 'role-a', 0n, VIEW)];
    const on = after(existing, planPrivacy(existing, EVERYONE, { private: true, roleIds: ['role-a'], memberIds: [] }));
    const a = on.find((r) => r.targetId === 'role-a');
    assert.equal(a?.allow, VIEW);
    assert.equal(a?.deny, 0n);
  });

  test('@everyone in the let-in list is ignored rather than allowed', () => {
    const on = after([], planPrivacy([], EVERYONE, { private: true, roleIds: [EVERYONE], memberIds: [] }));
    assert.deepEqual(readPrivacy(on, EVERYONE), { private: true, roleIds: [], memberIds: [] });
  });

  test('asking for what is already there plans nothing', () => {
    const wanted = { private: true, roleIds: ['role-a'], memberIds: [] };
    const on = after([], planPrivacy([], EVERYONE, wanted));
    assert.deepEqual(planPrivacy(on, EVERYONE, wanted), { upsert: [], remove: [] });
  });
});
