/**
 * The realtime protocol.
 *
 * One WebSocket per client, authenticated by the same httpOnly session cookie
 * as the REST API, so there is no token in JavaScript for a script to steal.
 * The server pushes; the client sends only a small set of intents.
 */

import type {
  Category,
  Channel,
  Member,
  Message,
  Presence,
  Role,
  SelfUser,
  Server,
  ServerDetail,
  Snowflake,
  VoiceState,
} from './types.js';

export const GATEWAY_PATH = '/gateway';

/** Bumped when the shape below changes incompatibly. */
export const GATEWAY_VERSION = 1;

export const HEARTBEAT_INTERVAL_MS = 25_000;
/** Server drops a socket that has not been heard from in this long. */
export const HEARTBEAT_TIMEOUT_MS = 60_000;

export type ServerEvent =
  /** First frame after a successful connection. Everything to paint the app. */
  | { t: 'ready'; d: { user: SelfUser; servers: ServerDetail[]; presences: Presence[]; voiceStates: VoiceState[]; sessionId: string } }
  | { t: 'heartbeat_ack'; d: { at: number } }
  | { t: 'message_create'; d: Message }
  | { t: 'message_update'; d: Message }
  | { t: 'message_delete'; d: { id: Snowflake; channelId: Snowflake } }
  | { t: 'typing_start'; d: { channelId: Snowflake; userId: Snowflake; at: number } }
  | { t: 'presence_update'; d: Presence }
  | { t: 'server_create'; d: ServerDetail }
  | { t: 'server_update'; d: Server }
  | { t: 'server_delete'; d: { id: Snowflake } }
  | { t: 'channel_create'; d: Channel }
  | { t: 'channel_update'; d: Channel }
  | { t: 'channel_delete'; d: { id: Snowflake; serverId: Snowflake } }
  | { t: 'category_create'; d: Category }
  | { t: 'category_update'; d: Category }
  | { t: 'category_delete'; d: { id: Snowflake; serverId: Snowflake } }
  | { t: 'role_create'; d: Role }
  | { t: 'role_update'; d: Role }
  | { t: 'role_delete'; d: { id: Snowflake; serverId: Snowflake } }
  /** The whole hierarchy was renumbered at once. Carries every role in the
   * server so a client never has to reconcile a partial reorder. */
  | { t: 'roles_reorder'; d: { serverId: Snowflake; roles: Role[] } }
  | { t: 'member_join'; d: Member }
  | { t: 'member_update'; d: Member }
  | { t: 'member_leave'; d: { userId: Snowflake; serverId: Snowflake } }
  /**
   * The caller's own effective permissions changed somewhere. Rather than
   * recompute permission deltas per channel on the server, we tell the client
   * to refetch the server it affects. Correctness over cleverness.
   */
  | { t: 'permissions_stale'; d: { serverId: Snowflake } }
  | { t: 'voice_state_update'; d: VoiceState }
  /*
   * There was a `voice_key` event here, carrying a key this server had
   * generated. It is gone. A server that makes the key has the key, which
   * makes "end-to-end encrypted" a false claim in our own interface.
   *
   * Keys are made in the clients and wrapped for one recipient at a time; what
   * this gateway will relay is sealed blobs it cannot open. See
   * `web/src/lib/voice-crypto.ts`, GAMEPLAN 1b finding 1, and non-negotiable 8.
   * The relay events are defined when the server half of M3 is built, so that
   * they arrive with the code that handles them rather than as a shape nobody
   * has implemented.
   */
  | { t: 'error'; d: { code: string; message: string } };

export type ClientEvent =
  | { t: 'heartbeat' }
  | { t: 'typing'; d: { channelId: Snowflake } }
  | { t: 'presence'; d: { status: Presence['status'] } }
  | {
      t: 'voice_state';
      d: {
        channelId: Snowflake | null;
        selfMute?: boolean;
        selfDeaf?: boolean;
        sharingScreen?: boolean;
        cameraOn?: boolean;
      };
    };

export type ServerEventName = ServerEvent['t'];
export type ClientEventName = ClientEvent['t'];

export function encodeEvent(event: ClientEvent | ServerEvent): string {
  return JSON.stringify(event);
}

export function decodeServerEvent(raw: string): ServerEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof (parsed as { t?: unknown }).t !== 'string') return null;
    return parsed as ServerEvent;
  } catch {
    return null;
  }
}

export function decodeClientEvent(raw: string): ClientEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof (parsed as { t?: unknown }).t !== 'string') return null;
    return parsed as ClientEvent;
  } catch {
    return null;
  }
}
