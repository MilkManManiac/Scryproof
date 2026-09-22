/**
 * Audit log.
 *
 * Every permission change, removal and destructive edit lands here with who
 * did it and when. Two reasons this exists from Milestone 2 rather than "later":
 * a private server without an audit trail cannot answer "who took that
 * channel away", and retrofitting one means the earliest and most interesting
 * history is already gone.
 *
 * Message bodies never appear in `changes`. Ids and names only.
 */

import { desc, eq } from 'drizzle-orm';

import { getDb } from '../db/index.js';
import { auditLog, users } from '../db/schema.js';
import { uuidv7 } from '../lib/ids.js';
import * as serialize from './serialize.js';
import type { AuditLogEntry } from '@scryproof/shared';

export type AuditAction =
  | 'server.update'
  | 'server.delete'
  | 'channel.create'
  | 'channel.update'
  | 'channel.delete'
  | 'channel.permissions'
  | 'channel.privacy'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'category.permissions'
  | 'server.layout'
  | 'role.create'
  | 'role.update'
  | 'role.reorder'
  | 'role.delete'
  | 'emoji.create'
  | 'emoji.delete'
  | 'member.roles'
  | 'member.nickname'
  | 'member.kick'
  /** One action for both ends of a timeout; `changes.until` is null for the end. */
  | 'member.timeout'
  | 'member.ban'
  | 'member.unban'
  | 'message.delete'
  | 'invite.create'
  | 'invite.revoke'
  | 'event.create'
  | 'event.update'
  | 'event.delete';

export async function record(entry: {
  serverId: string;
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  changes?: Record<string, unknown>;
}): Promise<void> {
  await getDb().insert(auditLog).values({
    id: uuidv7(),
    serverId: entry.serverId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    changes: entry.changes ?? null,
  });
}

export async function list(serverId: string, limit = 100): Promise<AuditLogEntry[]> {
  const db = getDb();

  const rows = await db
    .select({ entry: auditLog, actor: users })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.serverId, serverId))
    .orderBy(desc(auditLog.id))
    .limit(Math.min(limit, 200));

  return rows.map(({ entry, actor }) => ({
    id: entry.id,
    serverId: entry.serverId,
    actorId: entry.actorId,
    actor: actor ? serialize.publicUser(actor) : null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    changes: entry.changes,
    createdAt: new Date(entry.createdAt).toISOString(),
  }));
}
