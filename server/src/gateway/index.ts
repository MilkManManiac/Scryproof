/**
 * WebSocket endpoint.
 *
 * Authentication is the same httpOnly session cookie the REST API uses. That
 * is deliberate: there is no token sitting in JavaScript for a cross-site
 * script to steal and replay, and revoking a session kills the socket too.
 */

import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocketServer, type WebSocket } from 'ws';

import {
  GATEWAY_PATH,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  decodeClientEvent,
  encodeEvent,
} from '@scryproof/shared';
import type { ClientEvent, Presence, ServerEvent } from '@scryproof/shared';

import { config } from '../config.js';
import { resolveSession } from '../services/auth.js';
import { loadAllServerDetails, memberIdsForServers } from '../services/server-detail.js';
import { readStatesFor } from '../services/read-state.js';
import * as serialize from '../services/serialize.js';
import { uuidv7 } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import * as hub from './hub.js';
import { handleVoiceSignal, handleVoiceStateIntent } from './voice.js';

/** Parse one cookie out of a raw header without pulling in a parser. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

/**
 * A browser WebSocket cannot set custom headers, so the Origin header is the
 * only thing standing between us and a cross-site socket opened with the
 * user's cookies. Checking it is not optional.
 */
function originAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    // Non-browser clients (a future desktop app, scripts) send no Origin.
    // They still need a valid session cookie to get any further.
    return true;
  }
  if (origin === config.publicUrl) return true;
  if (!config.isProduction) {
    try {
      const { hostname } = new URL(origin);
      return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }
  return false;
}

export function attachGateway(httpServer: HttpServer): () => void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== GATEWAY_PATH) return;

    if (!originAllowed(request)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    void (async () => {
      const token = readCookie(request.headers.cookie, config.cookieName);
      const session = await resolveSession(token);

      if (!session) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        void onConnection(ws, session.user.id, session.sessionId, request);
      });
    })().catch((error: unknown) => {
      logger.error({ error }, 'gateway upgrade failed');
      socket.destroy();
    });
  });

  // Drop sockets that stopped answering. Without this, a client that vanished
  // without a close frame stays "online" in everyone's member list forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const connection of hub.allConnections()) {
      if (now - connection.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        connection.ws.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(sweep);
    wss.close();
  };
}

async function onConnection(
  ws: WebSocket,
  userId: string,
  sessionId: string,
  request: IncomingMessage,
): Promise<void> {
  const connection: hub.Connection = {
    id: uuidv7(),
    ws,
    userId,
    sessionId,
    servers: new Set<string>(),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
  };

  hub.addConnection(connection);

  ws.on('message', (raw: Buffer) => {
    connection.lastSeenAt = Date.now();
    // A 16 KiB ceiling on a control-plane frame. Nothing the client legitimately
    // sends here is large, and the limit removes a trivial memory-pressure
    // attack from an authenticated but hostile client.
    if (raw.length > 16 * 1024) return;

    const event = decodeClientEvent(raw.toString('utf8'));
    if (!event) return;
    void handleClientEvent(connection, event).catch((error: unknown) => {
      logger.error({ error, event: event.t }, 'gateway event failed');
    });
  });

  ws.on('pong', () => {
    connection.lastSeenAt = Date.now();
  });

  ws.on('close', () => {
    hub.removeConnection(connection);
    void announceDeparture(connection);
  });

  ws.on('error', () => {
    hub.removeConnection(connection);
  });

  try {
    await sendReady(connection, request);
  } catch (error) {
    logger.error({ error }, 'failed to send ready frame');
    ws.close(1011, 'ready failed');
  }
}

async function sendReady(connection: hub.Connection, request: IncomingMessage): Promise<void> {
  const { findUserById } = await import('../services/auth.js');
  const user = await findUserById(connection.userId);
  if (!user) {
    connection.ws.close(4001, 'unknown user');
    return;
  }

  const serverDetails = await loadAllServerDetails(connection.userId);
  for (const detail of serverDetails) connection.servers.add(detail.id);

  const serverIds = serverDetails.map((detail) => detail.id);
  const visibleChannelIds = new Set(
    serverDetails.flatMap((detail) => detail.channels.map((channel) => channel.id)),
  );
  const peerIds = await memberIdsForServers(serverIds);

  const presences: Presence[] = peerIds
    .map((id) => hub.presenceFor(id))
    .filter((presence) => presence.status !== 'offline');

  const ready: ServerEvent = {
    t: 'ready',
    d: {
      user: serialize.selfUser(user),
      servers: serverDetails,
      presences,
      // Scoped to what this member can see. `serverDetails` has already had
      // the hidden channels taken out of it, so reusing that set is the same
      // answer the rest of the frame gives rather than a second one.
      voiceStates: hub
        .allVoiceStatesFor(serverIds)
        .filter((state) => visibleChannelIds.has(state.channelId ?? '')),
      readStates: await readStatesFor(connection.userId),
      sessionId: connection.sessionId,
    },
  };

  connection.ws.send(encodeEvent(ready));
  void request; // kept for future per-connection diagnostics

  // Tell everyone who shares a server with this user that they came online,
  // but only if this is their first connection.
  if (hub.connectionsForUser(connection.userId).length === 1) {
    const presence = hub.presenceFor(connection.userId);
    for (const serverId of serverIds) {
      hub.broadcastToServer(serverId, { t: 'presence_update', d: presence });
    }
  }
}

async function announceDeparture(connection: hub.Connection): Promise<void> {
  // Other devices may still be connected; only announce a real disconnect.
  if (hub.connectionsForUser(connection.userId).length > 0) return;

  const presence = hub.presenceFor(connection.userId);
  for (const serverId of connection.servers) {
    hub.broadcastToServer(serverId, { t: 'presence_update', d: presence });
  }

  // Someone whose browser died should not be left standing in a voice channel.
  for (const { announcement, leftChannelId } of hub.clearVoiceStatesForUser(connection.userId)) {
    await hub.announceVoiceState(announcement.serverId, leftChannelId, announcement);
  }
}

async function handleClientEvent(
  connection: hub.Connection,
  event: ClientEvent,
): Promise<void> {
  switch (event.t) {
    case 'heartbeat': {
      connection.ws.send(encodeEvent({ t: 'heartbeat_ack', d: { at: Date.now() } }));
      return;
    }

    case 'presence': {
      const status = event.d.status;
      if (status !== 'online' && status !== 'idle' && status !== 'dnd' && status !== 'offline') {
        return;
      }
      connection.status = status;
      const presence = hub.presenceFor(connection.userId);
      for (const serverId of connection.servers) {
        hub.broadcastToServer(serverId, { t: 'presence_update', d: presence });
      }
      return;
    }

    case 'typing': {
      const { channelId } = event.d;
      if (typeof channelId !== 'string') return;

      const { getDb } = await import('../db/index.js');
      const { channels } = await import('../db/schema.js');
      const { eq } = await import('drizzle-orm');
      const { Permission } = await import('@scryproof/shared');

      const [channel] = await getDb()
        .select({ id: channels.id, serverId: channels.serverId })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1);
      if (!channel) return;
      if (!connection.servers.has(channel.serverId)) return;

      // A typing indicator is a claim about a channel, so it is permission
      // checked on the way in as well as on the way out. Otherwise a member
      // could probe which channels exist by watching who reacts.
      const { requireChannelPermission } = await import('../services/permissions.js');
      try {
        await requireChannelPermission(channelId, connection.userId, Permission.SEND_MESSAGES);
      } catch {
        return;
      }

      await hub.broadcastToChannel(
        channel.serverId,
        channelId,
        { t: 'typing_start', d: { channelId, userId: connection.userId, at: Date.now() } },
        Permission.VIEW_CHANNEL | Permission.READ_MESSAGE_HISTORY,
      );
      return;
    }

    case 'voice_state': {
      await handleVoiceStateIntent(connection, event.d);
      return;
    }

    case 'voice_signal': {
      handleVoiceSignal(connection, event.d);
      return;
    }

    default: {
      // Unknown event types are ignored rather than answered, so a probing
      // client learns nothing about what the server does or does not support.
      return;
    }
  }
}
