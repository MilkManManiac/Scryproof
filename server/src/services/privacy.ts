/**
 * A private channel, in one switch.
 *
 * Hidden channels have always been possible by hand: deny View channel to
 * @everyone, allow it back to the roles and people who belong. That is four
 * screens of overwrite editing for the most common thing anyone wants from
 * permissions. This turns it into "Private: on, for these roles and people",
 * and the overwrites underneath stay exactly what a person would have set by
 * hand, so the editor and the switch never disagree about what a channel is.
 *
 * Only the View channel bit is touched. Whatever else an overwrite says is
 * left alone: a role that is muted in a channel stays muted when the channel
 * turns private, and stays muted when it turns public again.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { Permission, has } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import { channelOverwrites, channels, roles } from '../db/schema.js';
import type { OverwriteRow } from '../db/schema.js';

export interface Privacy {
  private: boolean;
  roleIds: string[];
  memberIds: string[];
}

export interface OverwriteLike {
  targetType: string;
  targetId: string;
  allow: bigint;
  deny: bigint;
}

export interface PrivacyPlan {
  /** Rows to write, replacing whatever was there for that target. */
  upsert: OverwriteLike[];
  /** Targets whose overwrite ends up saying nothing at all, so the row goes. */
  remove: Pick<OverwriteLike, 'targetType' | 'targetId'>[];
}

const VIEW = Permission.VIEW_CHANNEL;

/** What the overwrites say, read back as a switch and two lists. */
export function readPrivacy(existing: readonly OverwriteLike[], everyoneRoleId: string): Privacy {
  const everyone = existing.find((row) => row.targetType === 'role' && row.targetId === everyoneRoleId);
  const isPrivate = everyone !== undefined && has(everyone.deny, VIEW);
  const allowed = existing.filter((row) => has(row.allow, VIEW) && !(row.targetType === 'role' && row.targetId === everyoneRoleId));
  return {
    private: isPrivate,
    roleIds: allowed.filter((row) => row.targetType === 'role').map((row) => row.targetId),
    memberIds: allowed.filter((row) => row.targetType === 'member').map((row) => row.targetId),
  };
}

/**
 * The overwrite changes that take a channel from what it is to what is wanted.
 * Pure, so the rule "only the View bit moves" can be tested without a database.
 */
export function planPrivacy(existing: readonly OverwriteLike[], everyoneRoleId: string, wanted: Privacy): PrivacyPlan {
  const key = (type: string, id: string) => `${type}:${id}`;
  const rows = new Map(existing.map((row) => [key(row.targetType, row.targetId), { ...row }]));
  const at = (targetType: string, targetId: string): OverwriteLike => {
    const found = rows.get(key(targetType, targetId));
    if (found) return found;
    const fresh = { targetType, targetId, allow: 0n, deny: 0n };
    rows.set(key(targetType, targetId), fresh);
    return fresh;
  };

  // Start from public: nobody is singled out for View, and @everyone is not denied it.
  for (const row of rows.values()) row.allow &= ~VIEW;
  at('role', everyoneRoleId).deny &= ~VIEW;

  if (wanted.private) {
    at('role', everyoneRoleId).deny |= VIEW;
    for (const roleId of wanted.roleIds) {
      if (roleId === everyoneRoleId) continue;
      const row = at('role', roleId);
      row.allow |= VIEW;
      row.deny &= ~VIEW;
    }
    for (const memberId of wanted.memberIds) {
      const row = at('member', memberId);
      row.allow |= VIEW;
      row.deny &= ~VIEW;
    }
  }

  const plan: PrivacyPlan = { upsert: [], remove: [] };
  const before = new Map(existing.map((row) => [key(row.targetType, row.targetId), row]));
  for (const [id, row] of rows) {
    const was = before.get(id);
    const empty = row.allow === 0n && row.deny === 0n;
    if (empty) {
      if (was) plan.remove.push({ targetType: row.targetType, targetId: row.targetId });
    } else if (!was || was.allow !== row.allow || was.deny !== row.deny) {
      plan.upsert.push(row);
    }
  }
  return plan;
}

/* ------------------------------ with the database ------------------------------ */

export async function everyoneRoleId(serverId: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.serverId, serverId), eq(roles.isEveryone, true)))
    .limit(1);
  if (!row) throw new Error(`server ${serverId} has no @everyone role`);
  return row.id;
}

async function overwritesOf(channelId: string): Promise<OverwriteRow[]> {
  return getDb().select().from(channelOverwrites).where(eq(channelOverwrites.channelId, channelId));
}

export async function loadPrivacy(channelId: string, serverId: string): Promise<Privacy> {
  return readPrivacy(await overwritesOf(channelId), await everyoneRoleId(serverId));
}

export async function applyPrivacy(channelId: string, serverId: string, wanted: Privacy): Promise<PrivacyPlan> {
  const plan = planPrivacy(await overwritesOf(channelId), await everyoneRoleId(serverId), wanted);
  const db = getDb();
  for (const row of plan.upsert) {
    await db
      .insert(channelOverwrites)
      .values({ channelId, targetType: row.targetType, targetId: row.targetId, allow: row.allow, deny: row.deny })
      .onConflictDoUpdate({
        target: [channelOverwrites.channelId, channelOverwrites.targetType, channelOverwrites.targetId],
        set: { allow: row.allow, deny: row.deny },
      });
  }
  for (const row of plan.remove) {
    await db
      .delete(channelOverwrites)
      .where(
        and(
          eq(channelOverwrites.channelId, channelId),
          eq(channelOverwrites.targetType, row.targetType),
          eq(channelOverwrites.targetId, row.targetId),
        ),
      );
  }
  return plan;
}

/** Which of a server's channels are private, for the lock in the channel list. */
export async function privateChannelIds(serverId: string): Promise<Set<string>> {
  const db = getDb();
  const everyone = await everyoneRoleId(serverId);
  const ids = (await db.select({ id: channels.id }).from(channels).where(eq(channels.serverId, serverId))).map((row) => row.id);
  if (ids.length === 0) return new Set();
  const rows = await db
    .select()
    .from(channelOverwrites)
    .where(
      and(
        inArray(channelOverwrites.channelId, ids),
        eq(channelOverwrites.targetType, 'role'),
        eq(channelOverwrites.targetId, everyone),
      ),
    );
  return new Set(rows.filter((row) => has(row.deny, VIEW)).map((row) => row.channelId));
}

export async function isPrivate(channelId: string, serverId: string): Promise<boolean> {
  return (await loadPrivacy(channelId, serverId)).private;
}
