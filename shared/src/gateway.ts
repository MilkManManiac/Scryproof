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
  DmChannel,
  DmMessage,
  Member,
  Message,
  Presence,
  Reaction,
  ReadState,
  Role,
  RsvpAnswer,
  ScheduledEvent,
  ScheduledEventBase,
  SelfUser,
  Server,
  ServerDetail,
  Snowflake,
  Timestamp,
  VoiceState,
  PublicUser,
} from './types.js';
import type { Tracker } from './initiative.js';

export const GATEWAY_PATH = '/gateway';

/** Bumped when the shape below changes incompatibly. */
export const GATEWAY_VERSION = 1;

export const HEARTBEAT_INTERVAL_MS = 25_000;
/**
 * Server drops a socket that has not been heard from in this long. Generous
 * on purpose: a tab hidden for more than five minutes has its timers slowed
 * by the browser to once a minute, so a 25 s heartbeat arrives every 60 s.
 * Anything under that and the sweep cuts off every idle tab, which then
 * reconnects and misses whatever was said in between.
 */
export const HEARTBEAT_TIMEOUT_MS = 100_000;

export type ServerEvent =
  /** First frame after a successful connection. Everything to paint the app. */
  /**
   * `blocks` is the ids this person has blocked, so the first paint already
   * collapses their messages rather than showing them and taking them back.
   */
  | { t: 'ready'; d: { user: SelfUser; servers: ServerDetail[]; presences: Presence[]; voiceStates: VoiceState[]; readStates: ReadState[]; blocks: Snowflake[]; sessionId: string } }
  | { t: 'heartbeat_ack'; d: { at: number } }
  | { t: 'message_create'; d: Message }
  | { t: 'message_update'; d: Message }
  | { t: 'message_delete'; d: { id: Snowflake; channelId: Snowflake } }
  /** The full set for one message after any change. Whole, so a missed event cannot leave a wrong count behind. */
  | { t: 'reaction_update'; d: { messageId: Snowflake; channelId: Snowflake; reactions: Reaction[] } }
  /**
   * Somebody pressed "again" on a character's jump: play it once more for
   * everyone looking. Nothing is stored; `content` is the jump message's own
   * text, so a client that has not loaded that message can still play it.
   */
  | { t: 'spawn_replay'; d: { messageId: Snowflake; channelId: Snowflake; content: string } }
  /**
   * A poll's public tally after a vote or a close. Never who voted for what,
   * and never anyone else's picks, which is why this is not `message_update`:
   * that carries the whole message, and a viewer's own picks are only theirs
   * to see.
   */
  | { t: 'poll_update'; d: { messageId: Snowflake; channelId: Snowflake; counts: number[]; closedAt: Timestamp | null } }
  /**
   * A channel's initiative tracker after any change, whole, so a missed event
   * cannot leave anyone looking at the wrong turn. `tracker` is null once the
   * fight has ended.
   */
  | { t: 'tracker_update'; d: { channelId: Snowflake; tracker: Tracker | null } }
  /** Sent only to the person it belongs to, on all their devices: read here, read everywhere. */
  | { t: 'read_state_update'; d: ReadState }
  | { t: 'typing_start'; d: { channelId: Snowflake; userId: Snowflake; at: number } }
  | { t: 'presence_update'; d: Presence }
  /** Somebody changed their name, picture or status. Sent to everyone who shares a server with them. */
  | { t: 'user_update'; d: PublicUser }
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
  /**
   * The server's custom emoji were added to or taken from. Carries the server
   * id and nothing else: an open client refetches the list, which cannot be
   * subtly wrong the way a per-emoji delta could.
   */
  | { t: 'emojis_changed'; d: { serverId: Snowflake } }
  /** The same for the soundboard: a clip was added, renamed or removed. Refetch. */
  | { t: 'sounds_changed'; d: { serverId: Snowflake } }
  /**
   * Events in the "Coming up" list. A create carries nobody's answer, since
   * nobody has given one yet; an update carries none either, and each client
   * keeps its own. `channelId` is null for anyone who cannot see the channel.
   */
  | { t: 'event_create'; d: ScheduledEvent }
  | { t: 'event_update'; d: ScheduledEventBase }
  | { t: 'event_delete'; d: { id: Snowflake; serverId: Snowflake } }
  /** Somebody answered, or took their answer back (`answer` null). The counts are whole. */
  | {
      t: 'event_rsvp';
      d: {
        eventId: Snowflake;
        serverId: Snowflake;
        userId: Snowflake;
        answer: RsvpAnswer | null;
        counts: Record<RsvpAnswer, number>;
      };
    }
  /** Sent once, about an hour before, to each member who said Going or Maybe. */
  | { t: 'event_reminder'; d: { eventId: Snowflake; serverId: Snowflake; title: string; startsAt: string } }
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
   * What replaces it is two events, neither of which carries anything this
   * server can use. See `web/src/lib/voice-crypto.ts`, `docs/voice-e2ee.md`,
   * GAMEPLAN 1b finding 1, and non-negotiable 8.
   */
  /**
   * Who is in a voice channel right now, and which epoch that makes it. Sent
   * to the occupants only, on every join and leave. The epoch is a counter and
   * nothing more: it gives everyone the same number to label keys with, and
   * has no influence on what any key is.
   */
  | { t: 'voice_membership'; d: VoiceMembership }
  /** A sealed message from another occupant, relayed unread. */
  | { t: 'voice_signal'; d: VoiceSignal & { from: Snowflake } }
  /**
   * Direct messages. Sent to the people in the conversation and nobody else,
   * each copy carrying only the wrapped keys addressed to that person.
   */
  | { t: 'dm_create'; d: DmChannel }
  /** Somebody joined or left a group. Everyone still in it is sent the new list. */
  | { t: 'dm_update'; d: DmChannel }
  /** This person left a group, from this device or another. */
  | { t: 'dm_left'; d: { dmId: Snowflake } }
  | { t: 'dm_message_create'; d: DmMessage }
  /** The same message sealed again by its author: an edit. */
  | { t: 'dm_message_update'; d: DmMessage }
  | { t: 'dm_message_delete'; d: { id: Snowflake; dmId: Snowflake; reactionTo: Snowflake | null } }
  | { t: 'dm_read'; d: { dmId: Snowflake; lastReadMessageId: Snowflake } }
  /** "Again" on a jump in a conversation. Only the message id: the server cannot read what it says. */
  | { t: 'dm_spawn_replay'; d: { dmId: Snowflake; messageId: Snowflake } }
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
    }
  /** Ask the gateway to pass a sealed message to the others in a voice channel. */
  | { t: 'voice_signal'; d: VoiceSignal & { to?: Snowflake } };

export interface VoiceMembership {
  channelId: Snowflake;
  epoch: number;
  members: Snowflake[];
}

/**
 * The envelope around key-agreement traffic.
 *
 * `payload` is opaque to the server by design. It is either a signed
 * announcement of public keys or a media key wrapped for exactly one device,
 * and the gateway's whole job is to check that the sender is really in the
 * channel and pass it along. It never parses it, stores it, or logs it.
 */
export interface VoiceSignal {
  channelId: Snowflake;
  epoch: number;
  kind: 'announce' | 'key';
  payload: Record<string, unknown>;
}

/** Bytes of JSON. A wrapped key is about 400; an announcement about 600. */
export const VOICE_SIGNAL_MAX_BYTES = 4096;

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
