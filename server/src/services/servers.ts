/**
 * Creating and tearing down servers, and moving members in and out.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { DEFAULT_EVERYONE_PERMISSIONS, validateServerName } from '@scryproof/shared';

import { getDb } from '../db/index.js';
import {
  bans,
  categories,
  channels,
  memberRoles,
  members,
  roles,
  servers,
} from '../db/schema.js';
import { uuidv7 } from '../lib/ids.js';
import { badRequest, forbidden } from '../lib/http-error.js';
import type { ServerRow } from '../db/schema.js';

/**
 * Who may make a new server: the owner of the first server this box ever had,
 * which is the person who set the box up. Anyone, when there are no servers
 * yet, or nobody could ever start. Wes, 2026-09-23: "Don't let other people
 * make new servers right now. Want to keep it kinda secure." Servers others
 * made before this rule are theirs and stay.
 */
export async function canCreateServers(userId: string): Promise<boolean> {
  const [first] = await getDb()
    .select({ ownerId: servers.ownerId })
    .from(servers)
    .orderBy(asc(servers.createdAt))
    .limit(1);
  return !first || first.ownerId === userId;
}

export interface CreateServerInput {
  name: string;
  ownerId: string;
}

/**
 * A new server arrives furnished: an @everyone role, a Text and a Voice
 * category, a #general and a General voice channel. An empty server is a dead
 * surface, and the first thing anyone does is create exactly these anyway.
 */
export async function createServer(input: CreateServerInput): Promise<ServerRow> {
  const name = input.name.trim();
  const check = validateServerName(name);
  if (!check.ok) throw badRequest(check.error, 'invalid_server_name');

  const db = getDb();
  const serverId = uuidv7();

  const [created] = await db
    .insert(servers)
    .values({ id: serverId, name, ownerId: input.ownerId })
    .returning();
  if (!created) throw badRequest('Could not create the server.', 'create_failed');

  await db.insert(roles).values({
    id: uuidv7(),
    serverId,
    name: '@everyone',
    position: 0,
    permissions: DEFAULT_EVERYONE_PERMISSIONS,
    isEveryone: true,
  });

  await db.insert(members).values({ serverId, userId: input.ownerId });

  const textCategoryId = uuidv7();
  const voiceCategoryId = uuidv7();

  await db.insert(categories).values([
    { id: textCategoryId, serverId, name: 'Text', position: 0 },
    { id: voiceCategoryId, serverId, name: 'Voice', position: 1 },
  ]);

  await db.insert(channels).values([
    {
      id: uuidv7(),
      serverId,
      categoryId: textCategoryId,
      type: 'text',
      name: 'general',
      position: 0,
    },
    {
      id: uuidv7(),
      serverId,
      categoryId: voiceCategoryId,
      type: 'voice',
      name: 'General',
      position: 0,
    },
  ]);

  return created;
}

export async function deleteServer(serverId: string, actorId: string): Promise<void> {
  const db = getDb();
  const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) return;

  // Only the owner, never an administrator. Deleting a server destroys
  // everyone's history, so it should not be reachable by handing out a role.
  if (server.ownerId !== actorId) {
    throw forbidden('Only the server owner can delete it.');
  }

  await db.delete(servers).where(eq(servers.id, serverId));
}

export async function isMember(serverId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ userId: members.userId })
    .from(members)
    .where(and(eq(members.serverId, serverId), eq(members.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether two people belong to any server in common.
 *
 * This is the whole of "do you know this person" in an app with no friends
 * list and no directory. Anybody who does not share a server is reported as
 * not existing, so nothing here can be used to find out who has an account.
 */
export async function sharesAServer(a: string, b: string): Promise<boolean> {
  const mine = await getDb()
    .select({ serverId: members.serverId })
    .from(members)
    .where(eq(members.userId, a));
  if (mine.length === 0) return false;
  const [shared] = await getDb()
    .select({ serverId: members.serverId })
    .from(members)
    .where(and(eq(members.userId, b), inArray(members.serverId, mine.map((row) => row.serverId))))
    .limit(1);
  return Boolean(shared);
}

export async function isBanned(serverId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ userId: bans.userId })
    .from(bans)
    .where(and(eq(bans.serverId, serverId), eq(bans.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function addMember(serverId: string, userId: string): Promise<void> {
  if (await isBanned(serverId, userId)) {
    throw forbidden('You are banned from that server.');
  }
  if (await isMember(serverId, userId)) return;

  await getDb().insert(members).values({ serverId, userId });
}

export async function removeMember(serverId: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(memberRoles)
    .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)));
  await db
    .delete(members)
    .where(and(eq(members.serverId, serverId), eq(members.userId, userId)));
}

/**
 * The owner cannot leave, because a server with no owner has no one who can
 * delete it or recover it. They delete it or transfer it first.
 */
export async function leaveServer(serverId: string, userId: string): Promise<void> {
  const [server] = await getDb().select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) return;

  if (server.ownerId === userId) {
    throw badRequest(
      'You own this server. Transfer it to someone else or delete it.',
      'owner_cannot_leave',
    );
  }

  await removeMember(serverId, userId);
}

export async function transferOwnership(
  serverId: string,
  currentOwnerId: string,
  newOwnerId: string,
): Promise<void> {
  const db = getDb();
  const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) throw badRequest('That server does not exist.', 'unknown_server');
  if (server.ownerId !== currentOwnerId) throw forbidden('Only the owner can transfer a server.');
  if (!(await isMember(serverId, newOwnerId))) {
    throw badRequest('That person is not in this server.', 'unknown_member');
  }

  await db.update(servers).set({ ownerId: newOwnerId }).where(eq(servers.id, serverId));
}
