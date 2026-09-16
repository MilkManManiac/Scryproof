/**
 * What the person looking at the settings screen is allowed to touch.
 *
 * A deliberate mirror of `server/src/services/permissions.ts`, and nothing
 * more than a mirror: every rule here is enforced again on the server, and if
 * the two ever disagree the server wins and the user gets a 403. The point is
 * to disable a control rather than let someone fill in a form that was always
 * going to be rejected.
 *
 * Two rules worth remembering because they surprise people:
 *   - Administrator does NOT beat the hierarchy. Only the owner does.
 *   - @everyone sits below everything, so anyone with MANAGE_ROLES can edit it.
 */

import {
  ALL_PERMISSIONS,
  Permission,
  decodeMask,
  has,
  highestRolePosition,
} from '@gooffline/shared';
import type { Member, Role, ServerDetail } from '@gooffline/shared';

export interface Authority {
  isOwner: boolean;
  /** Server-wide mask, straight from the server. */
  mask: bigint;
  /** The most this person can hand out. */
  ceiling: bigint;
  /** Highest role position held; -1 with no roles, Infinity for the owner. */
  highest: number;
  can: (wanted: bigint) => boolean;
  canEditRole: (role: Role) => boolean;
  canActOnMember: (member: Member) => boolean;
}

export function authorityFor(
  server: ServerDetail,
  members: Member[],
  userId: string | null,
): Authority {
  const isOwner = Boolean(userId) && server.ownerId === userId;
  const mask = decodeMask(server.permissions);
  const isAdmin = has(mask, Permission.ADMINISTRATOR);

  const rolesById = new Map(server.roles.map((role) => [role.id, role]));
  const rolesOf = (member: Member | undefined) =>
    (member?.roleIds ?? [])
      .map((id) => rolesById.get(id))
      .filter((role): role is Role => Boolean(role))
      .map((role) => ({ ...role, permissions: decodeMask(role.permissions) }));

  const self = members.find((member) => member.userId === userId);
  const highest = isOwner ? Number.POSITIVE_INFINITY : highestRolePosition(rolesOf(self));

  return {
    isOwner,
    mask,
    ceiling: isOwner || isAdmin ? ALL_PERMISSIONS : mask,
    highest,
    can: (wanted) => isOwner || has(mask, wanted),

    canEditRole: (role) => {
      if (!has(mask, Permission.MANAGE_ROLES) && !isOwner) return false;
      if (isOwner) return true;
      // @everyone is position 0 and exempt from the hierarchy check on the
      // server, so it is editable by anyone who can manage roles at all.
      if (role.isEveryone) return true;
      return role.position < highest;
    },

    canActOnMember: (member) => {
      if (member.userId === server.ownerId) return false;
      if (isOwner) return true;
      return highestRolePosition(rolesOf(member)) < highest;
    },
  };
}
