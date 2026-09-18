/**
 * The realtime hub.
 *
 * Holds every open socket and decides who is allowed to hear about what. The
 * rule that governs this file: a member must never receive an event for a
 * channel they cannot see. Getting that wrong leaks channel names, message
 * bodies and who is talking to whom, which would defeat the whole project even
 * though the REST API was correct.
 *
 * Permissions are cached per connection because recomputing them for every
 * recipient of every message would be wasteful, and invalidated explicitly
 * whenever a role, overwrite or membership changes. Cache correctness is
 * driven by invalidation events, never by a timeout.
 */

import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';

import { Permission, encodeEvent, has } from '@gooffline/shared';
import type { Presence, ServerEvent, VoiceState } from '@gooffline/shared';

import { getDb } from '../db/index.js';
import { channels as channelsTable } from '../db/schema.js';
import {
  computePermissionsForServerChannels,
  loadMemberContext,
} from '../services/permissions.js';
import { canSeeCategory } from '../services/server-detail.js';

export interface Connection {
  readonly id: string;
  readonly ws: WebSocket;
  readonly userId: string;
  readonly sessionId: string;
  /** Servers this user belongs to. Kept current on join and leave. */
  servers: Set<string>;
  /** serverId -> channelId -> effective permissions. Cleared on invalidation. */
  permissionCache: Map<string, Map<string, bigint>>;
  status: Presence['status'];
  lastSeenAt: number;
  alive: boolean;
}

const connections = new Map<string, Connection>();
const byUser = new Map<string, Set<Connection>>();

/** Ephemeral, so it lives in memory and dies with a restart, as it should. */
const voiceStates = new Map<string, VoiceState>();

const voiceKey = (serverId: string, userId: string): string => `${serverId}:${userId}`;

export function addConnection(connection: Connection): void {
  connections.set(connection.id, connection);
  const set = byUser.get(connection.userId) ?? new Set<Connection>();
  set.add(connection);
  byUser.set(connection.userId, set);
}

export function removeConnection(connection: Connection): void {
  connections.delete(connection.id);
  const set = byUser.get(connection.userId);
  if (!set) return;
  set.delete(connection);
  if (set.size === 0) byUser.delete(connection.userId);
}

export function isOnline(userId: string): boolean {
  return byUser.has(userId);
}

export function onlineUserIds(): string[] {
  return [...byUser.keys()];
}

export function connectionCount(): number {
  return connections.size;
}

/** Highest-priority status across a user's devices, for the member list. */
export function presenceFor(userId: string): Presence {
  const set = byUser.get(userId);
  if (!set || set.size === 0) return { userId, status: 'offline' };

  let status: Presence['status'] = 'offline';
  for (const connection of set) {
    if (connection.status === 'online') return { userId, status: 'online' };
    if (connection.status === 'dnd') status = 'dnd';
    else if (connection.status === 'idle' && status !== 'dnd') status = 'idle';
  }
  return { userId, status };
}

function send(connection: Connection, event: ServerEvent): void {
  // 1 === WebSocket.OPEN. Comparing the numeric constant avoids importing the
  // ws class into a module that only ever holds instances.
  if (connection.ws.readyState !== 1) return;
  try {
    connection.ws.send(encodeEvent(event));
  } catch {
    // A failed write means the socket is going away; the close handler will
    // clean it up. Never let one dead client break a broadcast to everyone
    // else.
  }
}

export function sendToUser(userId: string, event: ServerEvent): void {
  const set = byUser.get(userId);
  if (!set) return;
  for (const connection of set) send(connection, event);
}

export function sendToConnection(connectionId: string, event: ServerEvent): void {
  const connection = connections.get(connectionId);
  if (connection) send(connection, event);
}

/**
 * Everyone in a server, regardless of channel. Used for things that are server
 * scoped by nature: roles, members, the server itself.
 */
export function broadcastToServer(serverId: string, event: ServerEvent): void {
  for (const connection of connections.values()) {
    if (connection.servers.has(serverId)) send(connection, event);
  }
}

/**
 * Everyone in a server who can actually see a channel.
 *
 * `required` defaults to VIEW_CHANNEL. Message events also require
 * READ_MESSAGE_HISTORY so a member who may enter a channel but not read it
 * does not receive its contents over the socket.
 */
export async function broadcastToChannel(
  serverId: string,
  channelId: string,
  event: ServerEvent,
  required: bigint = Permission.VIEW_CHANNEL,
): Promise<void> {
  const targets = [...connections.values()].filter((c) => c.servers.has(serverId));
  if (targets.length === 0) return;

  // Resolve permissions once per user, not once per connection: a user with
  // three devices should not cost three permission computations.
  const byUserId = new Map<string, Connection[]>();
  for (const connection of targets) {
    const list = byUserId.get(connection.userId) ?? [];
    list.push(connection);
    byUserId.set(connection.userId, list);
  }

  await Promise.all(
    [...byUserId.entries()].map(async ([userId, userConnections]) => {
      const first = userConnections[0];
      if (!first) return;

      const permissions = await permissionsForChannel(first, serverId, channelId);
      if (permissions === null) return;
      if (!has(permissions, required)) return;

      for (const connection of userConnections) send(connection, event);
    }),
  );
}

/**
 * Everyone in a server who may be told this category exists.
 *
 * A category event carries a name, and a name is information: broadcasting
 * "category_create: staff-only" to the whole server gives away precisely what
 * denying View channel on it was meant to hide. The rule is the one the ready
 * frame uses, so a category cannot arrive over the socket that a reconnect
 * would then take away.
 */
export async function broadcastToCategory(
  serverId: string,
  categoryId: string,
  event: ServerEvent,
): Promise<void> {
  const targets = [...connections.values()].filter((c) => c.servers.has(serverId));
  if (targets.length === 0) return;

  // One query for the whole broadcast rather than one per recipient. Category
  // events are rare; this runs when somebody renames a heading.
  const serverChannels = await getDb()
    .select({ id: channelsTable.id, categoryId: channelsTable.categoryId })
    .from(channelsTable)
    .where(eq(channelsTable.serverId, serverId));

  const byUserId = new Map<string, Connection[]>();
  for (const connection of targets) {
    const list = byUserId.get(connection.userId) ?? [];
    list.push(connection);
    byUserId.set(connection.userId, list);
  }

  await Promise.all(
    [...byUserId.entries()].map(async ([userId, userConnections]) => {
      const ctx = await loadMemberContext(serverId, userId);
      if (!ctx) return;
      const permissions = await computePermissionsForServerChannels(ctx);
      const visible = serverChannels.filter((channel) =>
        has(permissions.get(channel.id) ?? 0n, Permission.VIEW_CHANNEL),
      );
      if (!canSeeCategory(categoryId, ctx.basePermissions, visible)) return;
      for (const connection of userConnections) send(connection, event);
    }),
  );
}

/**
 * Cached lookup of one connection's permissions in one channel. Returns null
 * when the user is no longer a member, which is treated as "cannot see it".
 */
async function permissionsForChannel(
  connection: Connection,
  serverId: string,
  channelId: string,
): Promise<bigint | null> {
  let serverCache = connection.permissionCache.get(serverId);

  if (!serverCache) {
    const ctx = await loadMemberContext(serverId, connection.userId);
    if (!ctx) {
      connection.servers.delete(serverId);
      return null;
    }
    serverCache = await computePermissionsForServerChannels(ctx);
    connection.permissionCache.set(serverId, serverCache);
  }

  const cached = serverCache.get(channelId);
  if (cached !== undefined) return cached;

  // A channel created since this cache was built. Rebuild rather than guess.
  const ctx = await loadMemberContext(serverId, connection.userId);
  if (!ctx) return null;
  const fresh = await computePermissionsForServerChannels(ctx);
  connection.permissionCache.set(serverId, fresh);
  return fresh.get(channelId) ?? null;
}

/**
 * Drop cached permissions for a server across every connection, and tell
 * clients to refetch. Called whenever a role, an overwrite, a channel or a
 * membership changes.
 *
 * This is deliberately blunt. Computing an exact per-user permission delta is
 * where subtle privilege bugs live; refetching a server is cheap and cannot be
 * wrong.
 */
export function invalidateServerPermissions(serverId: string, notify = true): void {
  for (const connection of connections.values()) {
    if (!connection.servers.has(serverId)) continue;
    connection.permissionCache.delete(serverId);
    if (notify) send(connection, { t: 'permissions_stale', d: { serverId } });
  }
}

/** Track a user joining a server while already connected. */
export function addUserToServer(userId: string, serverId: string): void {
  const set = byUser.get(userId);
  if (!set) return;
  for (const connection of set) {
    connection.servers.add(serverId);
    connection.permissionCache.delete(serverId);
  }
}

export function removeUserFromServer(userId: string, serverId: string): void {
  const set = byUser.get(userId);
  if (!set) return;
  for (const connection of set) {
    connection.servers.delete(serverId);
    connection.permissionCache.delete(serverId);
  }
  const state = voiceStates.get(voiceKey(serverId, userId));
  if (state) setVoiceState({ ...state, channelId: null });
}

/* ---------------------------------- voice --------------------------------- */

export function getVoiceState(serverId: string, userId: string): VoiceState | null {
  return voiceStates.get(voiceKey(serverId, userId)) ?? null;
}

export function allVoiceStatesFor(serverIds: readonly string[]): VoiceState[] {
  const wanted = new Set(serverIds);
  return [...voiceStates.values()].filter((state) => wanted.has(state.serverId));
}

export function setVoiceState(state: VoiceState): void {
  const key = voiceKey(state.serverId, state.userId);
  const before = voiceStates.get(key)?.channelId ?? null;

  if (state.channelId === null) voiceStates.delete(key);
  else voiceStates.set(key, state);

  // Muting and unmuting come through here too and must not rotate anything.
  if (before !== state.channelId) {
    if (before) voiceMembershipChanged(before);
    if (state.channelId) voiceMembershipChanged(state.channelId);
  }
}

/** Clear every voice state for a user across all their servers. */
/**
 * The announcement carries `channelId: null`, which is what "they left" looks
 * like on the wire — but the channel they left is what decides who is allowed
 * to hear it, so it comes back alongside rather than being thrown away.
 */
export interface ClearedVoiceState {
  announcement: VoiceState;
  leftChannelId: string | null;
}

export function clearVoiceStatesForUser(
  userId: string,
  exceptServerId?: string,
): ClearedVoiceState[] {
  const cleared: ClearedVoiceState[] = [];
  for (const [key, state] of voiceStates) {
    if (state.userId !== userId) continue;
    if (state.serverId === exceptServerId) continue;
    voiceStates.delete(key);
    cleared.push({
      announcement: { ...state, channelId: null, sharingScreen: false, cameraOn: false },
      leftChannelId: state.channelId,
    });
    if (state.channelId) voiceMembershipChanged(state.channelId);
  }
  return cleared;
}

/**
 * Who is standing in a voice channel is only news to the people who can see
 * that channel.
 *
 * Broadcasting it to the whole server told everybody that a channel id exists,
 * that somebody is sitting in it, and whether their camera is on — for a
 * channel the permissions were hiding. That is the 404-not-403 rule broken at
 * the gateway, and it is call metadata besides (GAMEPLAN 1b, finding 4).
 *
 * `aboutChannelId` is the channel the state concerns: the one being joined, or
 * the one just left, which is not the same as the `channelId` on the wire.
 */
export async function announceVoiceState(
  serverId: string,
  aboutChannelId: string | null,
  state: VoiceState,
): Promise<void> {
  // No channel means there is nothing to scope to and nothing to reveal; this
  // only happens for a state that was never in a channel to begin with.
  if (!aboutChannelId) return;
  await broadcastToChannel(serverId, aboutChannelId, { t: 'voice_state_update', d: state });
}

/*
 * Voice epochs.
 *
 * Every time the set of people in a voice channel changes, that channel's
 * epoch goes up by one and the occupants are told. Clients answer by throwing
 * away their media keys and making new ones, which is what makes leaving a
 * call mean something.
 *
 * It lives here, under setVoiceState and clearVoiceStatesForUser, rather than
 * beside the code that handles a join, so that no path out of a channel can
 * forget it: leaving, moving, being disconnected by a moderator, being removed
 * from the server, a browser dying. A missed rotation is a departed member who
 * can still decrypt.
 *
 * The counter is the only thing the server contributes. It never goes down
 * while the process lives, and clients refuse to go backwards regardless.
 */
const voiceEpochs = new Map<string, number>();

export function voiceEpoch(channelId: string): number {
  return voiceEpochs.get(channelId) ?? 0;
}

export function voiceOccupants(channelId: string): string[] {
  const occupants: string[] = [];
  for (const state of voiceStates.values()) {
    if (state.channelId === channelId) occupants.push(state.userId);
  }
  return occupants;
}

function voiceMembershipChanged(channelId: string): void {
  const epoch = voiceEpoch(channelId) + 1;
  voiceEpochs.set(channelId, epoch);

  const members = voiceOccupants(channelId);
  for (const userId of members) {
    sendToUser(userId, { t: 'voice_membership', d: { channelId, epoch, members } });
  }
}

export function connectionsForUser(userId: string): Connection[] {
  return [...(byUser.get(userId) ?? [])];
}

export function allConnections(): Connection[] {
  return [...connections.values()];
}
