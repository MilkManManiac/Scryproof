/**
 * Permission model.
 *
 * Deliberately a faithful copy of Discord's, because it is good and because
 * every clone that simplifies it feels wrong within a week. Two layers:
 *
 *   1. Roles carry a bitmask. A member's base permissions are the union of
 *      @everyone plus every role they hold.
 *   2. Channels carry overwrites that allow or deny specific bits for a role
 *      or for one member. Deny beats allow at the same level; a more specific
 *      level beats a less specific one.
 *
 * Bits are a 64-bit mask, so they are `bigint` in code and decimal strings on
 * the wire (JSON has no bigint). The server is the only place effective
 * permissions are ever computed. The client uses the same functions purely to
 * decide which buttons to hide, never to decide what is allowed.
 */

export const Permission = {
  // Text
  VIEW_CHANNEL: 1n << 0n,
  SEND_MESSAGES: 1n << 1n,
  MANAGE_MESSAGES: 1n << 2n,
  EMBED_LINKS: 1n << 3n,
  ATTACH_FILES: 1n << 4n,
  ADD_REACTIONS: 1n << 5n,
  MENTION_EVERYONE: 1n << 6n,
  READ_MESSAGE_HISTORY: 1n << 7n,

  // Voice
  CONNECT: 1n << 8n,
  SPEAK: 1n << 9n,
  VIDEO: 1n << 10n,
  SHARE_SCREEN: 1n << 11n,
  MUTE_MEMBERS: 1n << 12n,
  DEAFEN_MEMBERS: 1n << 13n,
  MOVE_MEMBERS: 1n << 14n,
  PRIORITY_SPEAKER: 1n << 15n,

  // Membership
  CREATE_INVITE: 1n << 16n,
  KICK_MEMBERS: 1n << 17n,
  BAN_MEMBERS: 1n << 18n,
  CHANGE_NICKNAME: 1n << 19n,
  MANAGE_NICKNAMES: 1n << 20n,

  // Administration
  MANAGE_CHANNELS: 1n << 21n,
  MANAGE_ROLES: 1n << 22n,
  MANAGE_SERVER: 1n << 23n,
  VIEW_AUDIT_LOG: 1n << 24n,
  ADMINISTRATOR: 1n << 25n,
} as const;

export type PermissionName = keyof typeof Permission;

export const PERMISSION_NAMES = Object.keys(Permission) as PermissionName[];

/** Every bit set that we have defined. Owner and administrator resolve to this. */
export const ALL_PERMISSIONS: bigint = PERMISSION_NAMES.reduce(
  (acc, name) => acc | Permission[name],
  0n,
);

/**
 * What a brand new @everyone role gets. Deliberately generous on the things a
 * normal member does all day and silent on everything administrative.
 */
export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  Permission.VIEW_CHANNEL |
  Permission.SEND_MESSAGES |
  Permission.EMBED_LINKS |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.READ_MESSAGE_HISTORY |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.VIDEO |
  Permission.SHARE_SCREEN |
  Permission.CREATE_INVITE |
  Permission.CHANGE_NICKNAME;

/** Permissions that only mean something in a voice channel. */
export const VOICE_ONLY_PERMISSIONS: bigint =
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.VIDEO |
  Permission.SHARE_SCREEN |
  Permission.MUTE_MEMBERS |
  Permission.DEAFEN_MEMBERS |
  Permission.MOVE_MEMBERS |
  Permission.PRIORITY_SPEAKER;

/** Permissions that only mean something in a text channel. */
export const TEXT_ONLY_PERMISSIONS: bigint =
  Permission.SEND_MESSAGES |
  Permission.MANAGE_MESSAGES |
  Permission.EMBED_LINKS |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.MENTION_EVERYONE |
  Permission.READ_MESSAGE_HISTORY;

export function has(permissions: bigint, wanted: bigint): boolean {
  if ((permissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) return true;
  return (permissions & wanted) === wanted;
}

export function hasAny(permissions: bigint, wanted: bigint): boolean {
  if ((permissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) return true;
  return (permissions & wanted) !== 0n;
}

/** Decompose a mask into names, for settings UI and audit log entries. */
export function toNames(permissions: bigint): PermissionName[] {
  return PERMISSION_NAMES.filter((name) => (permissions & Permission[name]) !== 0n);
}

export function fromNames(names: readonly PermissionName[]): bigint {
  return names.reduce((acc, name) => acc | (Permission[name] ?? 0n), 0n);
}

/** bigint does not survive JSON. Masks travel as decimal strings. */
export function encodeMask(mask: bigint): string {
  return mask.toString(10);
}

export function decodeMask(mask: string | number | bigint | null | undefined): bigint {
  if (mask === null || mask === undefined || mask === '') return 0n;
  try {
    return BigInt(mask);
  } catch {
    return 0n;
  }
}

export interface RoleLike {
  id: string;
  permissions: bigint;
  position: number;
  isEveryone: boolean;
}

export type OverwriteTarget = 'role' | 'member';

export interface OverwriteLike {
  targetType: OverwriteTarget;
  targetId: string;
  allow: bigint;
  deny: bigint;
}

/**
 * Server-wide permissions for a member, before any channel is considered.
 */
export function computeBasePermissions(input: {
  isOwner: boolean;
  roles: readonly RoleLike[];
}): bigint {
  if (input.isOwner) return ALL_PERMISSIONS;

  let permissions = 0n;
  for (const role of input.roles) permissions |= role.permissions;

  if ((permissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }
  return permissions;
}

/**
 * Apply one level of overwrites to a running permission mask.
 *
 * Order within a level matters and is the part clones get wrong:
 *   the @everyone overwrite, then every role overwrite the member actually
 *   holds merged together, then the member-specific overwrite. Deny is applied
 *   before allow at each step, so an explicit allow at a more specific level
 *   can rescue a deny from a broader one.
 *
 * The role overwrites are merged into a single allow mask and a single deny
 * mask before either is applied, so no accident of iteration order can let one
 * role shadow another.
 */
function applyOverwriteLevel(input: {
  permissions: bigint;
  everyoneRoleId: string;
  held: ReadonlySet<string>;
  userId: string;
  overwrites: readonly OverwriteLike[];
}): bigint {
  if (input.overwrites.length === 0) return input.permissions;

  let permissions = input.permissions;

  const everyone = input.overwrites.find(
    (o) => o.targetType === 'role' && o.targetId === input.everyoneRoleId,
  );
  if (everyone) {
    permissions &= ~everyone.deny;
    permissions |= everyone.allow;
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const o of input.overwrites) {
    if (o.targetType !== 'role') continue;
    if (o.targetId === input.everyoneRoleId) continue;
    if (!input.held.has(o.targetId)) continue;
    roleAllow |= o.allow;
    roleDeny |= o.deny;
  }
  permissions &= ~roleDeny;
  permissions |= roleAllow;

  const member = input.overwrites.find(
    (o) => o.targetType === 'member' && o.targetId === input.userId,
  );
  if (member) {
    permissions &= ~member.deny;
    permissions |= member.allow;
  }

  return permissions;
}

/**
 * Apply a channel's overwrites, and the overwrites of the category it sits in,
 * to a member's base permissions.
 *
 * Three levels, least specific first: the server-wide roles, then the
 * category, then the channel itself.
 *
 * The category is a real layer rather than a template that gets copied into
 * each channel when you "sync" it, which is how Discord does it. Copying means
 * two sources of truth that drift the moment somebody edits one channel, and a
 * category whose permissions are a lie about half the channels beneath it.
 * Layering means a channel dropped into "Staff" is staff-only immediately, and
 * moving it out restores it, with nothing to re-sync.
 *
 * Because the channel level runs last, one channel inside a locked category
 * can still open itself back up with its own allow. That is the point: the
 * category sets the default, the channel gets the final word.
 */
export function applyChannelOverwrites(input: {
  basePermissions: bigint;
  everyoneRoleId: string;
  memberRoleIds: readonly string[];
  userId: string;
  overwrites: readonly OverwriteLike[];
  /** The overwrites of the category this channel belongs to, if any. */
  categoryOverwrites?: readonly OverwriteLike[];
}): bigint {
  if ((input.basePermissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }

  const held = new Set(input.memberRoleIds);

  let permissions = applyOverwriteLevel({
    permissions: input.basePermissions,
    everyoneRoleId: input.everyoneRoleId,
    held,
    userId: input.userId,
    overwrites: input.categoryOverwrites ?? [],
  });

  permissions = applyOverwriteLevel({
    permissions,
    everyoneRoleId: input.everyoneRoleId,
    held,
    userId: input.userId,
    overwrites: input.overwrites,
  });

  return permissions;
}

/**
 * The whole computation in one call. This is what request handlers use.
 */
export function computeChannelPermissions(input: {
  isOwner: boolean;
  userId: string;
  roles: readonly RoleLike[];
  everyoneRoleId: string;
  overwrites: readonly OverwriteLike[];
  categoryOverwrites?: readonly OverwriteLike[];
}): bigint {
  const base = computeBasePermissions({ isOwner: input.isOwner, roles: input.roles });
  if (input.isOwner) return ALL_PERMISSIONS;

  return applyChannelOverwrites({
    basePermissions: base,
    everyoneRoleId: input.everyoneRoleId,
    memberRoleIds: input.roles.filter((r) => !r.isEveryone).map((r) => r.id),
    userId: input.userId,
    overwrites: input.overwrites,
    categoryOverwrites: input.categoryOverwrites,
  });
}

/**
 * Losing VIEW_CHANNEL takes everything else in that channel with it. Without
 * this, a member who cannot see a channel could still be handed a voice token
 * for it.
 */
export function normalizeChannelPermissions(permissions: bigint): bigint {
  if ((permissions & Permission.ADMINISTRATOR) === Permission.ADMINISTRATOR) {
    return ALL_PERMISSIONS;
  }
  if ((permissions & Permission.VIEW_CHANNEL) === 0n) return 0n;
  return permissions;
}

/**
 * Role hierarchy. You may only act on a member or edit a role that sits
 * strictly below your own highest role. The owner outranks everyone.
 */
export function highestRolePosition(roles: readonly RoleLike[]): number {
  let highest = -1;
  for (const role of roles) if (role.position > highest) highest = role.position;
  return highest;
}

export function canActOn(actor: {
  isOwner: boolean;
  roles: readonly RoleLike[];
}, target: {
  isOwner: boolean;
  roles: readonly RoleLike[];
}): boolean {
  if (target.isOwner) return false;
  if (actor.isOwner) return true;
  return highestRolePosition(actor.roles) > highestRolePosition(target.roles);
}
