/**
 * The timeout check.
 *
 * A timeout is not a permission bit, so nothing in the permission algebra
 * catches a mistake here. The rules worth pinning down are the two that a
 * plausible edit gets wrong: an expired timeout must not refuse anything, and
 * a running one must refuse regardless of how much permission the member has.
 * Every route that a timeout takes away calls this one function, so testing
 * the function is testing all of them.
 *
 * Pure: no database, no server.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ALL_PERMISSIONS, Permission } from '@scryproof/shared';

import { assertNotTimedOut, type MemberContext } from '../services/permissions.js';
import { HttpError } from '../lib/http-error.js';

const MINUTE = 60_000;

function context(over: Partial<MemberContext> = {}): MemberContext {
  return {
    userId: 'user-alex',
    serverId: 'server-1',
    isOwner: false,
    roles: [{ id: 'role-everyone', permissions: 0n, position: 0, isEveryone: true }],
    everyoneRoleId: 'role-everyone',
    basePermissions: Permission.SEND_MESSAGES,
    timeoutUntil: null,
    ...over,
  };
}

describe('assertNotTimedOut', () => {
  test('a member with no timeout passes', () => {
    assert.doesNotThrow(() => assertNotTimedOut(context()));
  });

  test('a running timeout is refused with 403 and the time it ends', () => {
    const until = new Date(Date.now() + 5 * MINUTE);

    try {
      assertNotTimedOut(context({ timeoutUntil: until }));
      assert.fail('a running timeout should have been refused');
    } catch (problem) {
      assert.ok(problem instanceof HttpError);
      assert.equal(problem.status, 403);
      assert.equal(problem.code, 'timed_out');
      assert.ok(problem.message.includes(until.toISOString()));
    }
  });

  test('an expired timeout is ignored, because nothing clears the column', () => {
    assert.doesNotThrow(() =>
      assertNotTimedOut(context({ timeoutUntil: new Date(Date.now() - MINUTE) })),
    );
  });

  test('the instant it runs out counts as over', () => {
    assert.doesNotThrow(() => assertNotTimedOut(context({ timeoutUntil: new Date(Date.now()) })));
  });

  /**
   * The point of a separate check: permissions cannot buy a way out of it. A
   * moderator who times themselves out is quiet too, and an owner who does it
   * is quiet until they undo it.
   */
  test('permission does not lift a timeout', () => {
    const until = new Date(Date.now() + MINUTE);

    assert.throws(() =>
      assertNotTimedOut(
        context({ timeoutUntil: until, basePermissions: ALL_PERMISSIONS }),
      ),
    );
    assert.throws(() =>
      assertNotTimedOut(
        context({ timeoutUntil: until, isOwner: true, basePermissions: ALL_PERMISSIONS }),
      ),
    );
  });
});
