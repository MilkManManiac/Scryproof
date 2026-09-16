/**
 * The permission algebra.
 *
 * Every rule in this file is one a person could hold in their head while
 * reading `shared/src/permissions.ts` and get wrong. That is the point: these
 * are not coverage, they are the cases where a plausible-looking edit silently
 * grants somebody access.
 *
 * Pure functions only. No database, no server, no network — it runs in a
 * fraction of a second, which is what makes it something you actually run
 * before committing. The end-to-end wiring is `src/scripts/smoke.ts`, which
 * needs a live server; this needs nothing.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  ALL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  Permission,
  PERMISSION_NAMES,
  applyChannelOverwrites,
  canActOn,
  computeBasePermissions,
  computeChannelPermissions,
  decodeMask,
  encodeMask,
  fromNames,
  has,
  hasAny,
  highestRolePosition,
  normalizeChannelPermissions,
  toNames,
  type OverwriteLike,
  type RoleLike,
} from '@gooffline/shared';

// --------------------------------------------------------------- fixtures

const EVERYONE_ID = 'role-everyone';
const MOD_ID = 'role-mod';
const GUEST_ID = 'role-guest';
const USER_ID = 'user-alex';

function role(over: Partial<RoleLike> & Pick<RoleLike, 'id'>): RoleLike {
  return { permissions: 0n, position: 0, isEveryone: false, ...over };
}

const everyone = (permissions: bigint) =>
  role({ id: EVERYONE_ID, permissions, position: 0, isEveryone: true });

function overwrite(
  targetId: string,
  allow: bigint,
  deny: bigint,
  targetType: OverwriteLike['targetType'] = 'role',
): OverwriteLike {
  return { targetType, targetId, allow, deny };
}

// ------------------------------------------------------------- the basics

describe('the permission set itself', () => {
  test('every named bit is inside ALL_PERMISSIONS', () => {
    for (const name of PERMISSION_NAMES) {
      assert.equal(
        (ALL_PERMISSIONS & Permission[name]) === Permission[name],
        true,
        `${name} is not in ALL_PERMISSIONS`,
      );
    }
  });

  test('no two permissions share a bit', () => {
    const seen = new Set<string>();
    for (const name of PERMISSION_NAMES) {
      const bit = Permission[name].toString();
      assert.equal(seen.has(bit), false, `${name} collides with another permission`);
      seen.add(bit);
    }
  });

  /**
   * The ceiling is real and load-bearing: a route that accepts a mask from the
   * client must not be able to store a bit nobody can revoke through the UI,
   * because the settings screen only renders defined bits.
   */
  test('bits above the highest defined permission are outside the ceiling', () => {
    assert.equal(ALL_PERMISSIONS & (1n << 26n), 0n);
    assert.equal(ALL_PERMISSIONS & (1n << 40n), 0n);
  });

  test('the generous default for @everyone grants nothing administrative', () => {
    const administrative =
      Permission.ADMINISTRATOR |
      Permission.MANAGE_ROLES |
      Permission.MANAGE_CHANNELS |
      Permission.MANAGE_SERVER |
      Permission.MANAGE_MESSAGES |
      Permission.VIEW_AUDIT_LOG |
      Permission.KICK_MEMBERS |
      Permission.BAN_MEMBERS |
      Permission.MENTION_EVERYONE |
      Permission.MANAGE_NICKNAMES;

    assert.equal(DEFAULT_EVERYONE_PERMISSIONS & administrative, 0n);
  });

  test('names round-trip through masks', () => {
    const mask = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.BAN_MEMBERS;
    assert.deepEqual(toNames(mask).sort(), ['BAN_MEMBERS', 'SEND_MESSAGES', 'VIEW_CHANNEL']);
    assert.equal(fromNames(toNames(mask)), mask);
  });
});

describe('has and hasAny', () => {
  test('has requires every requested bit, not any of them', () => {
    const mask = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES;
    assert.equal(has(mask, Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES), true);
    assert.equal(has(mask, Permission.VIEW_CHANNEL | Permission.BAN_MEMBERS), false);
    assert.equal(hasAny(mask, Permission.VIEW_CHANNEL | Permission.BAN_MEMBERS), true);
  });

  test('administrator satisfies anything', () => {
    assert.equal(has(Permission.ADMINISTRATOR, Permission.BAN_MEMBERS), true);
    assert.equal(hasAny(Permission.ADMINISTRATOR, Permission.MANAGE_SERVER), true);
  });

  test('an empty request is trivially satisfied', () => {
    assert.equal(has(0n, 0n), true);
  });
});

describe('masks on the wire', () => {
  test('a large mask survives the round trip as a decimal string', () => {
    const encoded = encodeMask(ALL_PERMISSIONS);
    assert.equal(typeof encoded, 'string');
    assert.equal(decodeMask(encoded), ALL_PERMISSIONS);
  });

  /**
   * Garbage decodes to "no permissions", never to a throw. A 500 on a
   * malformed mask is a denial-of-service lever; granting on garbage would be
   * far worse.
   */
  test('absent or malformed masks decode to zero, not to a throw', () => {
    assert.equal(decodeMask(null), 0n);
    assert.equal(decodeMask(undefined), 0n);
    assert.equal(decodeMask(''), 0n);
    assert.equal(decodeMask('not a number'), 0n);
    assert.equal(decodeMask('12.5'), 0n);
  });
});

// -------------------------------------------------------- base permissions

describe('server-wide permissions', () => {
  test('roles union together', () => {
    const base = computeBasePermissions({
      isOwner: false,
      roles: [
        everyone(Permission.VIEW_CHANNEL),
        role({ id: MOD_ID, permissions: Permission.KICK_MEMBERS, position: 2 }),
      ],
    });
    assert.equal(base, Permission.VIEW_CHANNEL | Permission.KICK_MEMBERS);
  });

  test('the owner gets everything without holding a single role', () => {
    assert.equal(computeBasePermissions({ isOwner: true, roles: [] }), ALL_PERMISSIONS);
  });

  test('administrator on any held role resolves to everything', () => {
    const base = computeBasePermissions({
      isOwner: false,
      roles: [everyone(0n), role({ id: MOD_ID, permissions: Permission.ADMINISTRATOR })],
    });
    assert.equal(base, ALL_PERMISSIONS);
  });

  test('no roles means no permissions', () => {
    assert.equal(computeBasePermissions({ isOwner: false, roles: [] }), 0n);
  });
});

// ------------------------------------------------------ channel overwrites

describe('channel overwrites', () => {
  const base = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES;

  function apply(overwrites: OverwriteLike[], memberRoleIds: string[] = [MOD_ID]): bigint {
    return applyChannelOverwrites({
      basePermissions: base,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds,
      userId: USER_ID,
      overwrites,
    });
  }

  test('no overwrites changes nothing', () => {
    assert.equal(apply([]), base);
  });

  test('an @everyone deny removes the bit', () => {
    assert.equal(
      apply([overwrite(EVERYONE_ID, 0n, Permission.SEND_MESSAGES)]),
      Permission.VIEW_CHANNEL,
    );
  });

  /**
   * The single most important ordering rule. A channel denies @everyone, and a
   * role the member holds allows it back. If the levels were applied in the
   * other order the role allow would be wiped and every private channel built
   * this way would be empty.
   */
  test('a role allow rescues a bit the @everyone level denied', () => {
    const result = apply([
      overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL),
      overwrite(MOD_ID, Permission.VIEW_CHANNEL, 0n),
    ]);
    assert.equal(has(result, Permission.VIEW_CHANNEL), true);
  });

  test('a member allow rescues a bit a role level denied', () => {
    const result = apply([
      overwrite(MOD_ID, 0n, Permission.SEND_MESSAGES),
      overwrite(USER_ID, Permission.SEND_MESSAGES, 0n, 'member'),
    ]);
    assert.equal(has(result, Permission.SEND_MESSAGES), true);
  });

  test('a member deny beats a role allow, because it is more specific', () => {
    const result = apply([
      overwrite(MOD_ID, Permission.SEND_MESSAGES, 0n),
      overwrite(USER_ID, 0n, Permission.SEND_MESSAGES, 'member'),
    ]);
    assert.equal(has(result, Permission.SEND_MESSAGES), false);
  });

  /**
   * Within the role level everything merges before it is applied, so no
   * accident of iteration order decides the outcome. Allow wins a tie there,
   * which is deliberate: holding an extra role should never take away what the
   * same level granted.
   */
  test('within the role level an allow beats a deny regardless of order', () => {
    const forwards = apply(
      [
        overwrite(MOD_ID, Permission.SEND_MESSAGES, 0n),
        overwrite(GUEST_ID, 0n, Permission.SEND_MESSAGES),
      ],
      [MOD_ID, GUEST_ID],
    );
    const backwards = apply(
      [
        overwrite(GUEST_ID, 0n, Permission.SEND_MESSAGES),
        overwrite(MOD_ID, Permission.SEND_MESSAGES, 0n),
      ],
      [MOD_ID, GUEST_ID],
    );
    assert.equal(has(forwards, Permission.SEND_MESSAGES), true);
    assert.equal(forwards, backwards);
  });

  test('an overwrite for a role the member does not hold is ignored', () => {
    const result = apply([overwrite(GUEST_ID, 0n, Permission.SEND_MESSAGES)], [MOD_ID]);
    assert.equal(has(result, Permission.SEND_MESSAGES), true);
  });

  test('an overwrite for a different member is ignored', () => {
    const result = apply([overwrite('user-someone-else', 0n, Permission.SEND_MESSAGES, 'member')]);
    assert.equal(has(result, Permission.SEND_MESSAGES), true);
  });

  /**
   * A channel allow is a grant, not a filter: it can hand out a bit the
   * server-wide roles never gave. That is what makes "moderator of this one
   * channel" expressible. Asserted explicitly so a future tightening cannot
   * remove it quietly.
   */
  test('a channel allow can grant a bit the server-wide roles never gave', () => {
    const result = apply([overwrite(MOD_ID, Permission.MANAGE_MESSAGES, 0n)]);
    assert.equal(has(result, Permission.MANAGE_MESSAGES), true);
  });

  /**
   * A single overwrite is supposed to have disjoint allow and deny masks —
   * `POST /api/channels/:id/permissions` rejects an overlap with
   * `conflicting_overwrite`, and the tri-state UI cannot express one. But that
   * invariant is enforced a layer away from the algebra that relies on it, so
   * the behaviour is pinned here too: within a level, deny is applied first
   * and allow second, which means an overlapping bit ends up allowed.
   *
   * Found by sabotage. Swapping those two lines used to change nothing that
   * any test could see.
   */
  test('if one overwrite both allows and denies a bit, allow wins', () => {
    const result = apply([
      overwrite(EVERYONE_ID, Permission.SEND_MESSAGES, Permission.SEND_MESSAGES),
    ]);
    assert.equal(has(result, Permission.SEND_MESSAGES), true);
  });

  test('the same overlap resolves the same way at the role and member levels', () => {
    const atRole = apply([overwrite(MOD_ID, Permission.MANAGE_MESSAGES, Permission.MANAGE_MESSAGES)]);
    const atMember = apply([
      overwrite(USER_ID, Permission.MANAGE_MESSAGES, Permission.MANAGE_MESSAGES, 'member'),
    ]);
    assert.equal(has(atRole, Permission.MANAGE_MESSAGES), true);
    assert.equal(has(atMember, Permission.MANAGE_MESSAGES), true);
  });

  test('administrator ignores overwrites entirely', () => {
    const result = applyChannelOverwrites({
      basePermissions: ALL_PERMISSIONS,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds: [MOD_ID],
      userId: USER_ID,
      overwrites: [overwrite(EVERYONE_ID, 0n, ALL_PERMISSIONS)],
    });
    assert.equal(result, ALL_PERMISSIONS);
  });
});

// ----------------------------------------------------- the category layer

describe('category overwrites', () => {
  const base = Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES;

  function apply(
    categoryOverwrites: OverwriteLike[],
    overwrites: OverwriteLike[] = [],
    memberRoleIds: string[] = [MOD_ID],
  ): bigint {
    return applyChannelOverwrites({
      basePermissions: base,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds,
      userId: USER_ID,
      overwrites,
      categoryOverwrites,
    });
  }

  test('a channel with no category behaves exactly as before', () => {
    assert.equal(apply([]), base);
    assert.equal(
      applyChannelOverwrites({
        basePermissions: base,
        everyoneRoleId: EVERYONE_ID,
        memberRoleIds: [MOD_ID],
        userId: USER_ID,
        overwrites: [],
      }),
      base,
    );
  });

  /**
   * The whole reason this layer exists. Locking the category locks every
   * channel inside it, with no per-channel work and nothing to keep in sync.
   */
  test('a category deny reaches a channel that has no overwrites of its own', () => {
    const result = apply([overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL)]);
    assert.equal(has(result, Permission.VIEW_CHANNEL), false);
  });

  test('a category allow reaches a channel that has no overwrites of its own', () => {
    const result = apply([overwrite(MOD_ID, Permission.MANAGE_MESSAGES, 0n)]);
    assert.equal(has(result, Permission.MANAGE_MESSAGES), true);
  });

  /**
   * The category sets the default; the channel gets the final word. Without
   * this, one public channel inside a private category would be inexpressible.
   */
  test('a channel allow overrides a category deny', () => {
    const result = apply(
      [overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL)],
      [overwrite(EVERYONE_ID, Permission.VIEW_CHANNEL, 0n)],
    );
    assert.equal(has(result, Permission.VIEW_CHANNEL), true);
  });

  test('a channel deny overrides a category allow', () => {
    const result = apply(
      [overwrite(MOD_ID, Permission.MANAGE_MESSAGES, 0n)],
      [overwrite(MOD_ID, 0n, Permission.MANAGE_MESSAGES)],
    );
    assert.equal(has(result, Permission.MANAGE_MESSAGES), false);
  });

  /**
   * The levels are ordered by specificity, not by target. A category rule
   * aimed at one member still loses to a channel rule aimed at @everyone,
   * because the channel is nearer to the thing being protected.
   */
  test('the whole channel level runs after the whole category level', () => {
    const result = apply(
      [overwrite(USER_ID, Permission.MANAGE_MESSAGES, 0n, 'member')],
      [overwrite(EVERYONE_ID, 0n, Permission.MANAGE_MESSAGES)],
    );
    assert.equal(has(result, Permission.MANAGE_MESSAGES), false);
  });

  test('within the category level the same specificity order applies', () => {
    const result = apply([
      overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL),
      overwrite(MOD_ID, Permission.VIEW_CHANNEL, 0n),
    ]);
    assert.equal(has(result, Permission.VIEW_CHANNEL), true);
  });

  test('a category overwrite for a role the member does not hold is ignored', () => {
    const result = apply([overwrite(GUEST_ID, 0n, Permission.SEND_MESSAGES)], [], [MOD_ID]);
    assert.equal(has(result, Permission.SEND_MESSAGES), true);
  });

  test('administrator ignores the category layer too', () => {
    const result = applyChannelOverwrites({
      basePermissions: ALL_PERMISSIONS,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds: [MOD_ID],
      userId: USER_ID,
      overwrites: [],
      categoryOverwrites: [overwrite(EVERYONE_ID, 0n, ALL_PERMISSIONS)],
    });
    assert.equal(result, ALL_PERMISSIONS);
  });

  test('a category that hides a channel still collapses the voice bits', () => {
    const effective = applyChannelOverwrites({
      basePermissions: Permission.VIEW_CHANNEL | Permission.CONNECT | Permission.SPEAK,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds: [],
      userId: USER_ID,
      overwrites: [],
      categoryOverwrites: [overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL)],
    });
    assert.equal(normalizeChannelPermissions(effective), 0n);
  });

  test('the owner short-circuits past the category as well', () => {
    const result = computeChannelPermissions({
      isOwner: true,
      userId: USER_ID,
      roles: [everyone(0n)],
      everyoneRoleId: EVERYONE_ID,
      overwrites: [],
      categoryOverwrites: [overwrite(EVERYONE_ID, 0n, ALL_PERMISSIONS)],
    });
    assert.equal(result, ALL_PERMISSIONS);
  });
});

// --------------------------------------------------- the VIEW_CHANNEL rule

describe('losing sight of a channel', () => {
  test('no VIEW_CHANNEL collapses every other bit to nothing', () => {
    const noisy =
      Permission.SEND_MESSAGES | Permission.CONNECT | Permission.SPEAK | Permission.MANAGE_MESSAGES;
    assert.equal(normalizeChannelPermissions(noisy), 0n);
  });

  test('VIEW_CHANNEL present leaves the mask alone', () => {
    const mask = Permission.VIEW_CHANNEL | Permission.CONNECT;
    assert.equal(normalizeChannelPermissions(mask), mask);
  });

  test('administrator sees everything even with VIEW_CHANNEL denied', () => {
    assert.equal(
      normalizeChannelPermissions(ALL_PERMISSIONS & ~Permission.VIEW_CHANNEL),
      ALL_PERMISSIONS,
    );
  });

  /**
   * The reason this rule exists. Without the collapse, a member denied view on
   * a voice channel would still carry CONNECT into it and could be minted a
   * token for a room they cannot see.
   */
  test('a member denied view keeps no voice permissions', () => {
    const effective = applyChannelOverwrites({
      basePermissions: Permission.VIEW_CHANNEL | Permission.CONNECT | Permission.SPEAK,
      everyoneRoleId: EVERYONE_ID,
      memberRoleIds: [],
      userId: USER_ID,
      overwrites: [overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL)],
    });
    assert.equal(normalizeChannelPermissions(effective), 0n);
    assert.equal(has(normalizeChannelPermissions(effective), Permission.CONNECT), false);
  });
});

describe('the whole computation end to end', () => {
  test('the owner short-circuits past every overwrite', () => {
    const result = computeChannelPermissions({
      isOwner: true,
      userId: USER_ID,
      roles: [everyone(0n)],
      everyoneRoleId: EVERYONE_ID,
      overwrites: [overwrite(EVERYONE_ID, 0n, ALL_PERMISSIONS)],
    });
    assert.equal(result, ALL_PERMISSIONS);
  });

  /**
   * If @everyone leaked into the merged role level it would be applied twice,
   * and its deny would then survive a role-level allow.
   */
  test('@everyone is not treated as one of the member role overwrites', () => {
    const result = computeChannelPermissions({
      isOwner: false,
      userId: USER_ID,
      roles: [everyone(Permission.VIEW_CHANNEL), role({ id: MOD_ID, position: 1 })],
      everyoneRoleId: EVERYONE_ID,
      overwrites: [
        overwrite(EVERYONE_ID, 0n, Permission.VIEW_CHANNEL),
        overwrite(MOD_ID, Permission.VIEW_CHANNEL, 0n),
      ],
    });
    assert.equal(has(result, Permission.VIEW_CHANNEL), true);
  });
});

// --------------------------------------------------------------- hierarchy

describe('the role hierarchy', () => {
  const owner = { isOwner: true, roles: [everyone(0n)] };
  const admin = {
    isOwner: false,
    // Deliberately in the middle: above the low mod, below the high one. An
    // administrator pinned at the bottom would pass this test for the wrong
    // reason.
    roles: [everyone(0n), role({ id: MOD_ID, permissions: Permission.ADMINISTRATOR, position: 3 })],
  };
  const highMod = { isOwner: false, roles: [everyone(0n), role({ id: 'role-high', position: 5 })] };
  const lowMod = { isOwner: false, roles: [everyone(0n), role({ id: 'role-low', position: 2 })] };
  const plain = { isOwner: false, roles: [everyone(0n)] };

  test('highestRolePosition defaults to -1 for nobody', () => {
    assert.equal(highestRolePosition([]), -1);
    assert.equal(highestRolePosition(highMod.roles), 5);
  });

  test('you may act on someone strictly below you', () => {
    assert.equal(canActOn(highMod, lowMod), true);
    assert.equal(canActOn(highMod, plain), true);
  });

  test('you may not act on someone above you', () => {
    assert.equal(canActOn(lowMod, highMod), false);
  });

  /**
   * Equal is not below. Two people holding the same top role cannot ban each
   * other, which is the rule that keeps a moderator team from eating itself.
   */
  test('equal rank is not enough', () => {
    const twin = { isOwner: false, roles: [everyone(0n), role({ id: 'role-other', position: 5 })] };
    assert.equal(canActOn(highMod, twin), false);
    assert.equal(canActOn(twin, highMod), false);
  });

  /**
   * The rule this project keeps and most clones get wrong. ADMINISTRATOR is a
   * permission, not a rank. It does not let a low-ranked administrator ban the
   * people above them; only the owner stands outside the hierarchy.
   */
  test('administrator does not bypass the hierarchy', () => {
    assert.equal(canActOn(admin, highMod), false);
    assert.equal(canActOn(admin, lowMod), true);
  });

  test('nobody may act on the owner', () => {
    assert.equal(canActOn(highMod, owner), false);
    assert.equal(canActOn(admin, owner), false);
    assert.equal(canActOn(owner, owner), false);
  });

  test('the owner outranks everyone else', () => {
    assert.equal(canActOn(owner, admin), true);
    assert.equal(canActOn(owner, highMod), true);
  });
});
