/**
 * Application state.
 *
 * A single reducer fed by two sources: gateway events from the server, and
 * local intents from the UI. Keeping both in one place means an optimistic
 * update and the authoritative event that follows it cannot disagree about
 * where the truth lives.
 *
 * Nothing here decides what a user is allowed to do. Permission masks arrive
 * from the server and are used only to hide controls.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import type {
  Channel,
  Emoji,
  Member,
  Message,
  Presence,
  PresenceStatus,
  PublicUser,
  ReadState,
  SelfUser,
  ServerDetail,
  ServerEvent,
  Sound,
  Tracker,
  VoiceState,
} from '@scryproof/shared';
import { UNREAD_COUNT_CAP, voiceRoomOf } from '@scryproof/shared';

import { purdle } from '../lib/purdle';
import { cuntections } from '../lib/cuntections';
import { bee } from '../lib/bee';
import { lowball, queens, thrice, travle, whereabouts } from '../lib/daily';
import { api } from '../lib/api';
import { noticeFor, notices, previewOf } from '../lib/notices';
import type { Notice } from '../lib/notices';
import { isMuted, momentSounds, notifyPrefs, placeMode, play, popupFor, soundFor } from '../lib/notify';
import type { Moment } from '../lib/notify';
import { present } from '../lib/popups';
import { toPlainLine } from '../lib/mentions';
import { Gateway, type ConnectionStatus } from '../lib/gateway';
import { fullWhen, withAnswer, withEvent } from '../lib/events';
import { jumpToSoon } from '../lib/jump';
import { channelKeysFor, channelMemory } from '../lib/channel-keys';
import { VoiceSession, type CallPlace } from '../lib/voice-session';
import { voicePrefs } from '../lib/voice-prefs';
import { sounds } from '../lib/voice-audio';
import { MutedTalkWatch, WATCH_EVERY_MS, muteCue, mutedTalkNote, talkingLevel } from '../lib/mute-state';
import { DEVICE_ACCEPTED, on } from '../lib/signals';
import { clearWhenOpened, startPushSync, watchAttention } from '../lib/push';

export interface State {
  connection: ConnectionStatus;
  /** Set once the first ready frame lands. */
  bootstrapped: boolean;
  user: SelfUser | null;

  servers: Record<string, ServerDetail>;
  serverOrder: string[];
  members: Record<string, Member[]>;
  messages: Record<string, Message[]>;
  /** Channels whose history has been fetched at least once. */
  loadedChannels: Record<string, boolean>;
  /**
   * Channels whose loaded list is a window around a message somebody jumped to
   * rather than the newest messages. A window does not reach the bottom, so it
   * is not pinned there and arriving messages are not spliced into it.
   */
  windowedChannels: Record<string, boolean>;
  presences: Record<string, PresenceStatus>;
  voiceStates: Record<string, VoiceState>;
  /** channelId -> userId -> last typed at (ms). */
  typing: Record<string, Record<string, number>>;
  /** How far this person has read, per channel. Drives every unread mark. */
  readStates: Record<string, ReadState>;
  /** The message being replied to, per channel, so a half-written reply survives a channel switch. */
  replyingTo: Record<string, Message>;
  /**
   * The people this person has blocked. It arrives in the ready frame so the
   * first paint already collapses them; the server does the part that matters
   * (no ping, no direct message) and this only hides.
   */
  blocks: Set<string>;
  /** Whether the + for a new server is offered. The server refuses anyone else either way. */
  canCreateServers: boolean;
  /**
   * The initiative tracker per channel, null when none is running. Absent
   * means not asked yet. Fetched when a channel is opened, then kept by
   * `tracker_update`.
   */
  trackers: Record<string, Tracker | null>;

  selectedServerId: string | null;
  selectedChannelId: string | null;
  /** Per server, the channel to return to when switching back. */
  lastChannelByServer: Record<string, string>;
}

const initialState: State = {
  connection: 'connecting',
  bootstrapped: false,
  user: null,
  servers: {},
  serverOrder: [],
  members: {},
  messages: {},
  loadedChannels: {},
  windowedChannels: {},
  presences: {},
  voiceStates: {},
  typing: {},
  readStates: {},
  replyingTo: {},
  blocks: new Set<string>(),
  canCreateServers: false,
  trackers: {},
  selectedServerId: null,
  selectedChannelId: null,
  lastChannelByServer: {},
};

type Action =
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'gateway'; event: ServerEvent }
  | { type: 'select-server'; serverId: string }
  | { type: 'select-channel'; channelId: string }
  | {
      type: 'messages-loaded';
      channelId: string;
      messages: Message[];
      /** Older messages, fetched by scrolling up. */
      prepend?: boolean;
      /** Newer messages, fetched by scrolling down out of a window. */
      append?: boolean;
      /** Whether the list this leaves behind stops short of the newest message. Left alone when absent. */
      windowed?: boolean;
    }
  | { type: 'members-loaded'; serverId: string; members: Member[] }
  | { type: 'server-refreshed'; server: ServerDetail }
  /** The channel memory has been read for this sign-in; see `lib/channel-memory.ts`. */
  | { type: 'memory-loaded' }
  | { type: 'emojis-loaded'; serverId: string; emojis: Emoji[] }
  | { type: 'sounds-loaded'; serverId: string; sounds: Sound[] }
  | { type: 'voice-states-refreshed'; serverId: string; voiceStates: VoiceState[] }
  | { type: 'marked-read'; channelId: string; messageId: string }
  | { type: 'reply-to'; channelId: string; message: Message | null }
  | { type: 'blocks'; blocks: string[] }
  /**
   * A change to this person's own account that the server does not broadcast
   * over the gateway (turning two-factor on or off), applied straight from
   * the response to the request that caused it.
   */
  | { type: 'patch-user'; patch: Partial<SelfUser> }
  /** A tracker straight from an API answer, the same shape `tracker_update` carries. */
  | { type: 'tracker'; channelId: string; tracker: Tracker | null }
  | { type: 'signed-out' }
  /**
   * A message this client already holds the truth about, straight from an API
   * response rather than the gateway. Voting on a poll is the reason this
   * exists: the broadcast for a vote is `poll_update`, which deliberately
   * carries no one's `mine` but the voter's own, so the voter's own copy has
   * to come from the response to their own request instead.
   */
  | { type: 'message-applied'; channelId: string; message: Message };

/**
 * One entry per person per server, and one for the conversation call they are
 * in, if any: a person is in one call at a time, so the conversation need not
 * be in the key. Matches the gateway's own bookkeeping.
 */
/** What each of the other daily games is called on screen, for a pop-up. */
const GAME_NAMES: Record<'queens' | 'travle' | 'thrice' | 'whereabouts' | 'lowball', string> = {
  queens: 'Queens',
  travle: 'Trundle',
  thrice: 'Thrice',
  whereabouts: 'Whereabouts',
  lowball: 'Lowball',
};

const voiceKey = (serverId: string | null, userId: string): string => `${serverId ?? 'dm'}:${userId}`;

/** What the gateway is told to put this person in. */
/** Muted and deafened as last left, sent with every join so a call (or a rejoin after a drop) starts that way. */
const standingVoice = (): { selfMute: boolean; selfDeaf: boolean } => {
  const { selfMute, selfDeaf } = voicePrefs.get();
  return { selfMute, selfDeaf };
};

const intentFor = (place: CallPlace): { channelId: string | null; dmId: string | null } =>
  place.kind === 'channel' ? { channelId: place.id, dmId: null } : { channelId: null, dmId: place.id };

/** First text channel the member can see, for landing on a sensible default. */
function firstVisibleChannel(server: ServerDetail | undefined): string | null {
  if (!server) return null;
  const text = server.channels.filter((channel) => channel.type === 'text');
  const sorted = [...text].sort((a, b) => a.position - b.position);
  return sorted[0]?.id ?? null;
}

/** Record a channel's newest message, wherever that channel lives. */
function touchChannel(state: State, channelId: string, messageId: string): State['servers'] {
  for (const server of Object.values(state.servers)) {
    const channel = server.channels.find((entry) => entry.id === channelId);
    if (!channel) continue;
    if (channel.lastMessageId && channel.lastMessageId >= messageId) return state.servers;
    return {
      ...state.servers,
      [server.id]: {
        ...server,
        channels: server.channels.map((entry) =>
          entry.id === channelId ? { ...entry, lastMessageId: messageId } : entry,
        ),
      },
    };
  }
  return state.servers;
}

/** Reading only ever moves forward. Ids sort by time, so this is a string compare. */
function readUpTo(state: State, channelId: string, messageId: string, mentionCount = 0): State['readStates'] {
  const current = state.readStates[channelId];
  const lastReadMessageId =
    current?.lastReadMessageId && current.lastReadMessageId > messageId ? current.lastReadMessageId : messageId;
  // Read to here is read to the end as far as this device knows. The server
  // answers with the true count (`read_state_update`) if something is still below.
  return { ...state.readStates, [channelId]: { channelId, lastReadMessageId, mentionCount, unreadCount: 0 } };
}

/**
 * One more message somebody else wrote, on the number beside its channel. Only
 * where there is a number already: a channel never opened has none, and the
 * server's count is the starting point for the rest.
 */
function countArrival(state: State, channelId: string, authorId: string): State['readStates'] {
  const current = state.readStates[channelId];
  if (!current?.lastReadMessageId || typeof current.unreadCount !== 'number') return state.readStates;
  if (authorId === state.user?.id || state.blocks.has(authorId)) return state.readStates;
  if (current.unreadCount >= UNREAD_COUNT_CAP) return state.readStates;
  return { ...state.readStates, [channelId]: { ...current, unreadCount: current.unreadCount + 1 } };
}

/**
 * The answer to a click and the broadcast about it can arrive in either
 * order. Both are whole trackers, so the newer one wins and an older one
 * landing second is dropped rather than winding the turn back.
 */
function withTracker(state: State, channelId: string, tracker: Tracker | null): State {
  const held = state.trackers[channelId];
  if (tracker && held && tracker.updatedAt < held.updatedAt) return state;
  return { ...state, trackers: { ...state.trackers, [channelId]: tracker } };
}

function upsertServer(state: State, server: ServerDetail): State {
  const known = state.serverOrder.includes(server.id);
  return {
    ...state,
    servers: { ...state.servers, [server.id]: server },
    serverOrder: known ? state.serverOrder : [...state.serverOrder, server.id],
  };
}

/**
 * Every channel passes through here on its way into the store, so what this
 * device has already seen is applied to what the server now says.
 *
 * A channel this device has seen encrypted stays encrypted here. Encryption
 * cannot be turned off — the honest server only ever turns it on, and stores
 * no readable text in an encrypted channel — so a channel that comes back
 * saying otherwise is either a mistake or a server trying to get plaintext out
 * of the next message. Either way it is kept encrypted, the claim is noted so
 * the channel can say what happened, and nothing readable is sent. This is the
 * one place it can be done: it is where the server's word first arrives.
 * `lib/channel-memory.ts`.
 *
 * Called from the reducer, which React may run twice in development; every
 * write it makes is idempotent (an earlier start stays earlier, a higher epoch
 * stays higher), so a repeat costs one no-op.
 */
function rememberedChannel(channel: Channel): Channel {
  const memory = channelMemory();
  if (channel.encrypted) {
    void memory.remember({ id: channel.id, encryptedAt: channel.encryptedAt });
    return channel;
  }
  const since = memory.since(channel.id);
  if (since === undefined) return channel;
  memory.noteDowngrade(channel.id);
  return { ...channel, encrypted: true, encryptedAt: channel.encryptedAt ?? since };
}

function withRemembrance(server: ServerDetail): ServerDetail {
  return { ...server, channels: server.channels.map(rememberedChannel) };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.status };

    case 'signed-out':
      return { ...initialState, connection: 'closed', bootstrapped: true };

    case 'select-server': {
      const server = state.servers[action.serverId];
      const remembered = state.lastChannelByServer[action.serverId];
      const stillVisible =
        remembered && server?.channels.some((channel) => channel.id === remembered);
      const channelId = stillVisible ? remembered : firstVisibleChannel(server);

      return {
        ...state,
        selectedServerId: action.serverId,
        selectedChannelId: channelId,
      };
    }

    case 'select-channel': {
      const serverId = state.selectedServerId;

      // Leaving a channel while parked in a window throws the window away, so
      // coming back lands at the bottom the way every other channel switch
      // does. The next visit fetches the newest page again.
      const left = state.selectedChannelId;
      const abandoning = left && left !== action.channelId && state.windowedChannels[left];
      const messages = abandoning ? { ...state.messages } : state.messages;
      const loadedChannels = abandoning ? { ...state.loadedChannels } : state.loadedChannels;
      const windowedChannels = abandoning ? { ...state.windowedChannels } : state.windowedChannels;
      if (abandoning && left) {
        delete messages[left];
        delete loadedChannels[left];
        delete windowedChannels[left];
      }

      return {
        ...state,
        messages,
        loadedChannels,
        windowedChannels,
        selectedChannelId: action.channelId,
        lastChannelByServer: serverId
          ? { ...state.lastChannelByServer, [serverId]: action.channelId }
          : state.lastChannelByServer,
        // Clear stale typing indicators when entering a channel.
        typing: { ...state.typing, [action.channelId]: {} },
      };
    }

    case 'messages-loaded': {
      const existing = state.messages[action.channelId] ?? [];
      // Neither flag means the answer replaces what was held: opening a channel
      // and landing on a window both say where the list now starts and ends.
      const merged = action.prepend
        ? [...action.messages, ...existing]
        : action.append
          ? [...existing, ...action.messages]
          : action.messages;

      // Deduplicate by id and keep chronological order. Ids are UUIDv7, so a
      // plain string sort is a time sort.
      const byId = new Map(merged.map((message) => [message.id, message]));
      const ordered = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

      return {
        ...state,
        messages: { ...state.messages, [action.channelId]: ordered },
        loadedChannels: { ...state.loadedChannels, [action.channelId]: true },
        windowedChannels: {
          ...state.windowedChannels,
          [action.channelId]:
            action.windowed ?? state.windowedChannels[action.channelId] ?? false,
        },
      };
    }

    case 'members-loaded':
      return { ...state, members: { ...state.members, [action.serverId]: action.members } };

    case 'server-refreshed':
      return upsertServer(state, withRemembrance(action.server));

    /**
     * The channel memory finished loading, which happens just after sign-in.
     * Every channel is put through it again: ones fetched before the read
     * finished are the ones this can still change.
     */
    case 'memory-loaded':
      return {
        ...state,
        servers: Object.fromEntries(
          Object.entries(state.servers).map(([id, server]) => [id, withRemembrance(server)]),
        ),
      };

    // The emoji arrive with the server and are replaced wholesale when they
    // change, for the same reason roles are reordered in one event: the answer
    // just fetched is complete, and a merge could keep one that was removed.
    case 'emojis-loaded': {
      const server = state.servers[action.serverId];
      if (!server) return state;
      return upsertServer(state, { ...server, emojis: action.emojis });
    }

    // The soundboard, wholesale, for the same reason.
    case 'sounds-loaded': {
      const server = state.servers[action.serverId];
      if (!server) return state;
      return upsertServer(state, { ...server, sounds: action.sounds });
    }

    /**
     * Voice presence only reaches people who can see the channel it is about,
     * so gaining access to a voice channel does not bring the people already
     * sitting in it — no event fires for somebody who has not moved. This
     * replaces every state for the server rather than merging, because the
     * answer just fetched is complete and a merge would keep anyone this
     * member has just stopped being allowed to see.
     */
    case 'voice-states-refreshed': {
      const kept = Object.fromEntries(
        Object.entries(state.voiceStates).filter(([, voice]) => voice.serverId !== action.serverId),
      );
      for (const voice of action.voiceStates) {
        kept[voiceKey(voice.serverId, voice.userId)] = voice;
      }
      return { ...state, voiceStates: kept };
    }

    case 'marked-read':
      return { ...state, readStates: readUpTo(state, action.channelId, action.messageId) };

    // The whole list, as the server just gave it back, rather than one id
    // added or taken away: there is nothing to reconcile that way.
    case 'blocks':
      return { ...state, blocks: new Set(action.blocks) };

    case 'patch-user':
      return state.user ? { ...state, user: { ...state.user, ...action.patch } } : state;

    case 'tracker':
      return withTracker(state, action.channelId, action.tracker);

    case 'reply-to': {
      const { [action.channelId]: removed, ...rest } = state.replyingTo;
      void removed;
      return { ...state, replyingTo: action.message ? { ...rest, [action.channelId]: action.message } : rest };
    }

    case 'message-applied': {
      const existing = state.messages[action.channelId];
      if (!existing) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.channelId]: existing.map((message) =>
            message.id === action.message.id ? action.message : message,
          ),
        },
      };
    }

    case 'gateway':
      return applyGatewayEvent(state, action.event);

    default:
      return state;
  }
}

function applyGatewayEvent(state: State, event: ServerEvent): State {
  switch (event.t) {
    case 'ready': {
      const servers: Record<string, ServerDetail> = {};
      for (const server of event.d.servers) servers[server.id] = withRemembrance(server);

      const presences: Record<string, PresenceStatus> = {};
      for (const presence of event.d.presences) presences[presence.userId] = presence.status;

      const voiceStates: Record<string, VoiceState> = {};
      for (const voice of event.d.voiceStates) {
        voiceStates[voiceKey(voice.serverId, voice.userId)] = voice;
      }

      const readStates: Record<string, ReadState> = {};
      for (const entry of event.d.readStates ?? []) readStates[entry.channelId] = entry;

      const order = event.d.servers.map((server) => server.id);

      // Keep the current selection across a reconnect if it still exists.
      const selectedServerId =
        state.selectedServerId && servers[state.selectedServerId]
          ? state.selectedServerId
          : (order[0] ?? null);

      const selectedServer = selectedServerId ? servers[selectedServerId] : undefined;
      const selectedChannelId =
        state.selectedChannelId &&
        selectedServer?.channels.some((channel) => channel.id === state.selectedChannelId)
          ? state.selectedChannelId
          : firstVisibleChannel(selectedServer);

      return {
        ...state,
        bootstrapped: true,
        user: event.d.user,
        servers,
        serverOrder: order,
        presences,
        voiceStates,
        readStates,
        blocks: new Set(event.d.blocks ?? []),
        canCreateServers: event.d.canCreateServers ?? false,
        selectedServerId,
        selectedChannelId,
      };
    }

    case 'message_create': {
      const existing = state.messages[event.d.channelId] ?? [];
      if (existing.some((message) => message.id === event.d.id)) return state;

      return {
        ...state,
        servers: touchChannel(state, event.d.channelId, event.d.id),
        // Your own message is never news to you, on this device or another.
        readStates:
          event.d.authorId === state.user?.id
            ? readUpTo(state, event.d.channelId, event.d.id, state.readStates[event.d.channelId]?.mentionCount ?? 0)
            : countArrival(state, event.d.channelId, event.d.authorId),
        // A window stops short of the newest message, so appending to it would
        // put this message directly after one from last week. It is dropped;
        // scrolling down out of the window fetches it in its proper place.
        messages: state.windowedChannels[event.d.channelId]
          ? state.messages
          : { ...state.messages, [event.d.channelId]: [...existing, event.d] },
        // Whoever just spoke has clearly stopped typing.
        typing: {
          ...state.typing,
          [event.d.channelId]: Object.fromEntries(
            Object.entries(state.typing[event.d.channelId] ?? {}).filter(
              ([userId]) => userId !== event.d.authorId,
            ),
          ),
        },
      };
    }

    case 'message_update': {
      const existing = state.messages[event.d.channelId];
      if (!existing) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [event.d.channelId]: existing.map((message) => {
            if (message.id === event.d.id) return event.d;
            // A reply quotes its parent. When the parent is edited, the quote
            // follows, or the old wording lives on above every answer to it.
            if (message.replyTo?.id === event.d.id && event.d.content !== null) {
              return { ...message, replyTo: { ...message.replyTo, content: event.d.content.slice(0, 140) } };
            }
            return message;
          }),
        },
      };
    }

    case 'message_delete': {
      const existing = state.messages[event.d.channelId];
      if (!existing) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [event.d.channelId]: existing.map((message) =>
            message.id === event.d.id
              ? { ...message, deleted: true, content: null, ciphertext: null, attachments: [] }
              : message,
          ),
        },
      };
    }

    case 'messages_expire': {
      // Gone for good, so gone from the screen too: no "deleted" line.
      const gone = new Set(event.d.ids);
      const existing = state.messages[event.d.channelId];
      let next: State = existing
        ? {
            ...state,
            messages: { ...state.messages, [event.d.channelId]: existing.filter((message) => !gone.has(message.id)) },
          }
        : state;
      // The newest one going means they all went; see message-expiry.ts on the server.
      for (const server of Object.values(next.servers)) {
        const channel = server.channels.find((entry) => entry.id === event.d.channelId);
        if (channel?.lastMessageId && gone.has(channel.lastMessageId)) {
          next = upsertServer(next, {
            ...server,
            channels: server.channels.map((entry) => (entry.id === channel.id ? { ...entry, lastMessageId: null } : entry)),
          });
        }
      }
      return next;
    }

    case 'reaction_update': {
      const existing = state.messages[event.d.channelId];
      if (!existing) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [event.d.channelId]: existing.map((message) =>
            message.id === event.d.messageId ? { ...message, reactions: event.d.reactions } : message,
          ),
        },
      };
    }

    case 'poll_update': {
      // Public tally only. `mine` is left exactly as it was: the vote that
      // caused this event, if it was ours, already came back on the request
      // that made it, and someone else's pick is never sent to us at all.
      const existing = state.messages[event.d.channelId];
      if (!existing) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [event.d.channelId]: existing.map((message) =>
            message.id === event.d.messageId && message.poll
              ? { ...message, poll: { ...message.poll, counts: event.d.counts, closedAt: event.d.closedAt } }
              : message,
          ),
        },
      };
    }

    case 'tracker_update':
      return withTracker(state, event.d.channelId, event.d.tracker);

    case 'read_state_update': {
      const current = state.readStates[event.d.channelId];
      // A count for a channel we have read past since is already stale.
      const ahead =
        current?.lastReadMessageId &&
        (!event.d.lastReadMessageId || current.lastReadMessageId > event.d.lastReadMessageId);
      // A mention bump carries no count; the one this device has been keeping stands.
      const unreadCount = ahead ? current?.unreadCount : (event.d.unreadCount ?? current?.unreadCount);
      const next: ReadState = ahead ? { ...event.d, lastReadMessageId: current.lastReadMessageId } : { ...event.d };
      if (typeof unreadCount === 'number') next.unreadCount = unreadCount;
      else delete next.unreadCount;
      return {
        ...state,
        readStates: { ...state.readStates, [event.d.channelId]: next },
      };
    }

    case 'typing_start': {
      const channel = state.typing[event.d.channelId] ?? {};
      return {
        ...state,
        typing: {
          ...state.typing,
          [event.d.channelId]: { ...channel, [event.d.userId]: event.d.at },
        },
      };
    }

    case 'presence_update':
      return {
        ...state,
        presences: { ...state.presences, [event.d.userId]: event.d.status },
      };

    case 'user_update': {
      // The same person is drawn in three places: the member lists, the
      // messages they wrote, and, if it is you, the panel at the bottom.
      const fresh = event.d;
      const members = Object.fromEntries(
        Object.entries(state.members).map(([serverId, list]) => [
          serverId,
          list.map((member) => (member.userId === fresh.id ? { ...member, user: fresh } : member)),
        ]),
      );
      const messages = Object.fromEntries(
        Object.entries(state.messages).map(([channelId, list]) => [
          channelId,
          list.some((message) => message.authorId === fresh.id)
            ? list.map((message) => (message.authorId === fresh.id ? { ...message, author: fresh } : message))
            : list,
        ]),
      );
      return {
        ...state,
        members,
        messages,
        user: state.user && state.user.id === fresh.id ? { ...state.user, ...fresh } : state.user,
      };
    }

    case 'server_create':
      return upsertServer(state, withRemembrance(event.d));

    case 'server_update': {
      const existing = state.servers[event.d.id];
      if (!existing) return state;
      return { ...state, servers: { ...state.servers, [event.d.id]: withRemembrance({ ...existing, ...event.d }) } };
    }

    case 'server_delete': {
      const { [event.d.id]: removed, ...rest } = state.servers;
      void removed;
      const order = state.serverOrder.filter((id) => id !== event.d.id);
      const selectedServerId =
        state.selectedServerId === event.d.id ? (order[0] ?? null) : state.selectedServerId;

      return {
        ...state,
        servers: rest,
        serverOrder: order,
        selectedServerId,
        selectedChannelId:
          state.selectedServerId === event.d.id
            ? firstVisibleChannel(selectedServerId ? rest[selectedServerId] : undefined)
            : state.selectedChannelId,
      };
    }

    case 'channel_create': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      if (server.channels.some((channel) => channel.id === event.d.id)) return state;
      return upsertServer(state, { ...server, channels: [...server.channels, rememberedChannel(event.d)] });
    }

    case 'channel_update': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      const known = server.channels.some((channel) => channel.id === event.d.id);
      return upsertServer(state, {
        ...server,
        channels: known
          ? server.channels.map((channel) => (channel.id === event.d.id ? rememberedChannel(event.d) : channel))
          : [...server.channels, rememberedChannel(event.d)],
      });
    }

    case 'channel_delete': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      const channels = server.channels.filter((channel) => channel.id !== event.d.id);
      const next = upsertServer(state, { ...server, channels });

      if (state.selectedChannelId !== event.d.id) return next;
      return {
        ...next,
        selectedChannelId: firstVisibleChannel(next.servers[event.d.serverId]),
      };
    }

    case 'category_create': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      if (server.categories.some((category) => category.id === event.d.id)) return state;
      return upsertServer(state, { ...server, categories: [...server.categories, event.d] });
    }

    case 'category_update': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        categories: server.categories.map((category) =>
          category.id === event.d.id ? event.d : category,
        ),
      });
    }

    case 'category_delete': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        categories: server.categories.filter((category) => category.id !== event.d.id),
      });
    }

    case 'role_create':
    case 'role_update': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      const known = server.roles.some((role) => role.id === event.d.id);
      return upsertServer(state, {
        ...server,
        roles: known
          ? server.roles.map((role) => (role.id === event.d.id ? event.d : role))
          : [...server.roles, event.d],
      });
    }

    case 'roles_reorder': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, { ...server, roles: event.d.roles });
    }

    // The list itself is fetched by the effect in the provider, which then
    // dispatches 'emojis-loaded'. Nothing to do from the event alone.
    case 'emojis_changed':
    case 'sounds_changed':
      return state;

    case 'event_create':
    case 'event_update': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, { ...server, events: withEvent(server.events ?? [], event.d) });
    }

    case 'event_delete': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        events: (server.events ?? []).filter((entry) => entry.id !== event.d.id),
      });
    }

    case 'event_rsvp': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        events: withAnswer(server.events ?? [], event.d, state.user?.id ?? null),
      });
    }

    // Nothing to change in the list: it goes to the notices, in the provider below.
    case 'event_reminder':
      return state;

    case 'role_delete': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        roles: server.roles.filter((role) => role.id !== event.d.id),
      });
    }

    case 'member_join': {
      // A roster this browser has not loaded stays unloaded: starting it with
      // just the joiner made the loader think it was complete, and everyone
      // already there showed as "Someone" until a reload (Wes, 2026-09-22).
      const existing = state.members[event.d.serverId];
      if (!existing) return state;
      if (existing.some((member) => member.userId === event.d.userId)) return state;
      return {
        ...state,
        members: { ...state.members, [event.d.serverId]: [...existing, event.d] },
      };
    }

    case 'member_update': {
      const existing = state.members[event.d.serverId];
      if (!existing) return state;
      return {
        ...state,
        members: {
          ...state.members,
          [event.d.serverId]: existing.map((member) =>
            member.userId === event.d.userId ? event.d : member,
          ),
        },
      };
    }

    case 'member_leave': {
      const existing = state.members[event.d.serverId];
      const { [voiceKey(event.d.serverId, event.d.userId)]: removed, ...voiceRest } =
        state.voiceStates;
      void removed;

      return {
        ...state,
        voiceStates: voiceRest,
        members: existing
          ? {
              ...state.members,
              [event.d.serverId]: existing.filter((member) => member.userId !== event.d.userId),
            }
          : state.members,
      };
    }

    case 'voice_state_update': {
      const key = voiceKey(event.d.serverId, event.d.userId);
      // A DM call has no channel, so "no channel" alone is not leaving.
      if (voiceRoomOf(event.d) === null) {
        const { [key]: removed, ...rest } = state.voiceStates;
        void removed;
        return { ...state, voiceStates: rest };
      }
      return { ...state, voiceStates: { ...state.voiceStates, [key]: event.d } };
    }

    // Handled by an effect that refetches the server; see the provider below.
    case 'permissions_stale':
    case 'heartbeat_ack':
    case 'error':
      return state;

    default:
      return state;
  }
}

interface StoreValue {
  state: State;
  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  sendTyping: (channelId: string) => void;
  setPresence: (status: PresenceStatus) => void;
  joinVoice: (channelId: string) => void;
  /** Start, or join, the call inside a direct message conversation. */
  joinDmCall: (dmId: string) => void;
  leaveVoice: () => void;
  updateVoice: (patch: { selfMute?: boolean; selfDeaf?: boolean; sharingScreen?: boolean; cameraOn?: boolean }) => void;
  /** The live call, if any: media, keys, and the numbers the connection panel shows. */
  voice: VoiceSession;
  loadMessages: (channelId: string, before?: string) => Promise<void>;
  /**
   * The next page forward from the end of a window, for scrolling down out of
   * one. Reaching the newest message ends the window.
   */
  loadNewerMessages: (channelId: string) => Promise<void>;
  /**
   * Land on a message however old it is: scroll to it if it is loaded,
   * otherwise fetch the window around it first. Selects the channel too, so a
   * search hit in another channel is one call.
   */
  jumpToMessage: (channelId: string, messageId: string) => Promise<void>;
  /** Tell the server this channel has been read up to a message. Safe to call often. */
  markRead: (channelId: string, messageId: string) => void;
  replyTo: (channelId: string, message: Message | null) => void;
  /** Replace one message with a fresher copy that only came back to this client, such as a vote's own response. */
  applyMessage: (channelId: string, message: Message) => void;
  /** Keep a tracker that came back on the answer to this client's own request. */
  applyTracker: (channelId: string, tracker: Tracker | null) => void;
  loadMembers: (serverId: string) => Promise<void>;
  refreshServer: (serverId: string) => Promise<void>;
  /** Block or unblock somebody. The list the server answers with is the one kept. */
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  /** Apply a change to this person's own account that the server did not broadcast, such as two-factor turning on or off. */
  patchUser: (patch: Partial<SelfUser>) => void;
  /**
   * Hear every gateway event, after the reducer has. For state that lives
   * beside this store rather than in it; direct messages are the first.
   * Returns the function that stops listening.
   */
  onGatewayEvent: (listener: (event: ServerEvent) => void) => () => void;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  onSignedOut,
}: {
  children: ReactNode;
  onSignedOut: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gatewayRef = useRef<Gateway | null>(null);
  /** The call this device has asked to be in, wherever it is. */
  const currentCall = useRef<CallPlace | null>(null);
  /**
   * The room each of this person's voice entries was last announced in, by
   * entry key. A departure says only "left" with no room, so this is how a
   * departure from the call being left behind (on the way to another one) is
   * told apart from being taken out of the call this device is in.
   */
  const selfRooms = useRef(new Map<string, string>());
  const selfId = useRef<string | null>(null);
  /** This person's own voice entry in the call this device is in, as last announced. */
  const ownVoice = useRef<VoiceState | null>(null);
  // Read inside the long-lived gateway callback, which is created once and
  // would otherwise be looking at whatever was selected when it was made.
  const openChannel = useRef<string | null>(null);
  openChannel.current = state.selectedChannelId;
  // Same reason: a notice names the server and channel a message came from.
  const serversRef = useRef(state.servers);
  serversRef.current = state.servers;
  // And the same again: nothing a blocked person says makes a sound or a notice.
  const blocksRef = useRef(state.blocks);
  blocksRef.current = state.blocks;
  // Names for a pop-up about someone joining a call or finishing a game.
  const membersRef = useRef(state.members);
  membersRef.current = state.members;
  /**
   * Everyone's voice entry as last seen, so a change can be told apart from a
   * repeat: "went live" is sharing now and not sharing before.
   */
  const voiceSeen = useRef(new Map<string, VoiceState>());
  const eventListeners = useRef(new Set<(event: ServerEvent) => void>());

  // One session object for the life of the app. It is idle until a call is
  // joined, and it reaches the gateway through the ref so it never holds a
  // socket that has since been replaced.
  const voiceRef = useRef<VoiceSession | null>(null);
  if (!voiceRef.current) {
    voiceRef.current = new VoiceSession(
      () => selfId.current ?? '',
      (signal) => gatewayRef.current?.send({ t: 'voice_signal', d: signal }),
    );
  }
  const voice = voiceRef.current;
  // Lets `npm run test:voice` ask a real browser what it actually decoded.
  // Dev builds only; Vite removes the branch from production.
  if (import.meta.env.DEV) {
    Object.assign(window, { __voice: voice, __voicePrefs: voicePrefs, __mutedTalkNote: mutedTalkNote, __ownVoice: () => ownVoice.current });
  }

  // "You're muted", for someone talking into a muted microphone. The level is
  // the gate's own, read from a copy of the microphone that goes only to a
  // meter on this device; nothing is sent while muted, this included.
  useEffect(() => {
    const watch = new MutedTalkWatch();
    const timer = setInterval(() => {
      const own = ownVoice.current;
      const prefs = voicePrefs.get();
      const watching =
        prefs.mutedTalkNote &&
        currentCall.current !== null &&
        voice.getSnapshot().phase === 'connected' &&
        own !== null &&
        own.selfMute &&
        !own.selfDeaf &&
        !own.serverMute &&
        !own.serverDeaf;
      const loud = watching && voice.micLevel() >= talkingLevel(prefs.thresholdDb);
      if (watch.feed(Date.now(), loud, watching)) mutedTalkNote.show();
      else if (!watching && mutedTalkNote.visible()) mutedTalkNote.hide();
    }, WATCH_EVERY_MS);
    return () => clearInterval(timer);
  }, [voice]);

  useEffect(() => {
    if (!state.bootstrapped || !state.user) return;
    // Which channels this device has seen encrypted, read once per sign-in.
    // The store holds channels as they arrive either way; this is what puts
    // them through it afterwards, for anything that landed before the read
    // finished. A read that fails is tried again on the next sign-in
    // (`channelMemory` drops the failed attempt), and everything that sends
    // asks for the same thing itself before it sends.
    void channelMemory()
      .load()
      .then(() => dispatch({ type: 'memory-loaded' }))
      .catch(() => undefined);
  }, [state.bootstrapped, state.user]);

  useEffect(() => {
    /**
     * A message as one plain line for the bell and pop-ups: names instead of
     * mention codes, spoilers kept hidden. A server whose member list has not
     * loaded yet cannot name anyone, and saying so beats a wrong name.
     */
    const plainPreview = (content: string | null, serverId: string | null): string | null => {
      if (!content) return null;
      const members = serverId ? (membersRef.current[serverId] ?? []) : [];
      const line = toPlainLine(content, members);
      return previewOf(members.length > 0 ? line : line.replace(/@someone who left/g, '@someone'));
    };

    /** A member's name in a server, for a pop-up that only has their id. */
    const nameIn = (serverId: string, userId: string): { name: string; user?: PublicUser } => {
      const member = membersRef.current[serverId]?.find((entry) => entry.userId === userId);
      if (member) return { name: member.nickname ?? member.user.displayName, user: member.user };
      return { name: 'Someone' };
    };

    /**
     * Someone arriving in a voice room, leaving one, starting to share their
     * screen or stopping. Pop-ups follow the moments and the room's setting;
     * a sound only for the call this device is in (where joining and leaving
     * already chime, in voice-session) or a room being watched.
     */
    const voiceMoments = (after: VoiceState): void => {
      const key = voiceKey(after.serverId, after.userId);
      const before = voiceSeen.current.get(key) ?? null;
      if (voiceRoomOf(after) === null) voiceSeen.current.delete(key);
      else voiceSeen.current.set(key, after);
      if (after.userId === selfId.current || !after.serverId) return;
      const server = serversRef.current[after.serverId];
      if (!server) return;

      const was = before ? before.channelId : null;
      const now = after.channelId;
      const moments: { moment: Moment; channelId: string }[] = [];
      if (now && now !== was) moments.push({ moment: 'joined', channelId: now });
      if (was && !now) moments.push({ moment: 'left', channelId: was });
      const sharedBefore = Boolean(before?.sharingScreen) && was === now;
      // Only a change from a known state is news: someone this device never
      // saw before (a reconnect, a room just made visible) may have been
      // sharing all along, and "went live" would be wrong.
      if (before && now && after.sharingScreen && !sharedBefore) moments.push({ moment: 'live', channelId: now });
      if (was && before?.sharingScreen && !(after.sharingScreen && was === now)) {
        moments.push({ moment: 'ended', channelId: was });
      }
      if (moments.length === 0) return;

      const prefs = notifyPrefs.get();
      const mine = new Set(selfRooms.current.values());
      const focused = document.hasFocus();
      const { name, user } = nameIn(server.id, after.userId);
      // Going live outranks having just arrived: one card, the interesting one.
      const shown = moments.find((entry) => entry.moment === 'live') ?? moments[0]!;
      for (const { moment, channelId } of moments) {
        const mode = placeMode(prefs, server.id, channelId);
        const inMyCall = mine.has(channelId);
        // Joining and leaving my own call already chime in voice-session.
        const soundHere = moment === 'joined' || moment === 'left' ? !inMyCall && mode === 'watch' : inMyCall || mode === 'watch';
        if (soundHere && momentSounds(prefs, moment, mode)) play(moment, { force: mode === 'watch' });
        if (moment !== shown.moment) continue;
        const room = server.channels.find((entry) => entry.id === channelId);
        const onScreen = inMyCall || (focused && openChannel.current === channelId);
        if (!popupFor({ moment, authorId: after.userId, selfId: selfId.current, blocked: blocksRef.current.has(after.userId), mode, onScreen, prefs })) continue;
        const target: Notice = {
          id: `voice-${channelId}`,
          at: Date.now(),
          kind: 'event',
          authorId: after.userId,
          authorName: name,
          serverId: server.id,
          serverName: server.name,
          channelId,
          channelName: room?.name ?? null,
          dmId: null,
          preview: null,
          read: true,
        };
        present(
          {
            id: `voice-${after.userId}-${moment}`,
            moment,
            who: name,
            user,
            where: `${room?.name ?? 'A voice room'} · ${server.name}`,
            what: null,
            open: () => notices.goTo(target),
          },
          prefs.popupDetail,
          focused,
        );
      }
    };

    /** Someone finished one of the daily games. Silent and unshown unless chosen. */
    const gameMoment = (serverId: string, userId: string, game: string): void => {
      if (userId === selfId.current) return;
      const server = serversRef.current[serverId];
      if (!server) return;
      const prefs = notifyPrefs.get();
      const mode = placeMode(prefs, serverId, null);
      if (momentSounds(prefs, 'game', mode)) play('game');
      if (!popupFor({ moment: 'game', authorId: userId, selfId: selfId.current, blocked: blocksRef.current.has(userId), mode, onScreen: false, prefs })) return;
      const { name, user } = nameIn(serverId, userId);
      const target: Notice = {
        id: `game-${serverId}`,
        at: Date.now(),
        kind: 'event',
        authorId: userId,
        authorName: name,
        serverId,
        serverName: server.name,
        channelId: null,
        channelName: null,
        dmId: null,
        preview: null,
        read: true,
      };
      present(
        {
          id: `game-${userId}-${game}`,
          moment: 'game',
          who: name,
          user,
          where: `${game} · ${server.name}`,
          what: null,
          open: () => notices.goTo(target),
        },
        prefs.popupDetail,
        document.hasFocus(),
      );
    };

    const handleEvent = (event: ServerEvent): void => {
      dispatch({ type: 'gateway', event });
      for (const listener of eventListeners.current) listener(event);

      if (event.t === 'message_create') {
        // Looked up once and reused: the sound decision, the pop-up decision,
        // and the notice's own server/channel names all need it.
        const server = Object.values(serversRef.current).find((entry) =>
          entry.channels.some((channel) => channel.id === event.d.channelId),
        );
        const muted = isMuted(notifyPrefs.get(), server?.id ?? null, event.d.channelId);
        const blocked = blocksRef.current.has(event.d.authorId);

        const prefs = notifyPrefs.get();
        const mode = placeMode(prefs, server?.id ?? null, event.d.channelId);
        const sound = soundFor({
          authorId: event.d.authorId,
          mentions: event.d.mentions ?? [],
          mentionsEveryone: event.d.mentionsEveryone ?? false,
          selfId: selfId.current,
          channelId: event.d.channelId,
          serverId: server?.id ?? null,
          openChannelId: openChannel.current,
          windowFocused: document.hasFocus(),
          blocked,
          prefs,
        });
        if (sound) play(sound, { force: mode === 'watch' });

        const message = event.d;
        const focused = document.hasFocus();
        const pingsMe =
          (message.mentionsEveryone ?? false) || (message.mentions ?? []).includes(selfId.current ?? '');
        const channelName = server?.channels.find((entry) => entry.id === message.channelId)?.name ?? 'channel';
        const target: Notice = {
          id: message.id,
          at: Date.now(),
          kind: 'mention',
          authorId: message.authorId,
          authorName: message.author.displayName,
          serverId: server?.id ?? null,
          serverName: server?.name ?? null,
          channelId: message.channelId,
          channelName,
          dmId: null,
          preview: null,
          read: false,
        };
        if (
          popupFor({
            moment: pingsMe ? 'mention' : 'message',
            authorId: message.authorId,
            selfId: selfId.current,
            blocked,
            mode,
            onScreen: focused && message.channelId === openChannel.current,
            prefs,
          })
        ) {
          present(
            {
              // One card per channel: a burst updates it rather than stacking.
              id: pingsMe ? `mention-${message.id}` : `message-${message.channelId}`,
              moment: pingsMe ? 'mention' : 'message',
              who: message.author.displayName,
              user: message.author,
              where: `#${channelName} · ${server?.name ?? 'a server'}`,
              what: plainPreview(message.content, server?.id ?? null),
              open: () => notices.open(target),
            },
            prefs.popupDetail,
            focused,
          );
        }
        const verdict = noticeFor({
          authorId: message.authorId,
          selfId: selfId.current,
          addressedToMe:
            (message.mentionsEveryone ?? false) || (message.mentions ?? []).includes(selfId.current ?? ''),
          watching: focused && message.channelId === openChannel.current,
          windowFocused: focused,
          muted,
          blocked,
        });
        if (verdict.list) {
          const channel = server?.channels.find((entry) => entry.id === message.channelId);
          notices.arrived(
            {
              id: message.id,
              at: Date.now(),
              kind: 'mention',
              authorId: message.authorId,
              authorName: message.author.displayName,
              serverId: server?.id ?? null,
              serverName: server?.name ?? null,
              channelId: message.channelId,
              channelName: channel?.name ?? null,
              dmId: null,
              preview: plainPreview(message.content, server?.id ?? null),
              read: false,
            },
          );
        }

        // Everything else said where you were not looking goes on its
        // channel's running row, so a sound is never without a line behind
        // the bell saying where it came from. Muted places stay off it:
        // muting is "I do not care what happens there".
        const watching = focused && message.channelId === openChannel.current;
        if (selfId.current && message.authorId !== selfId.current && !blocked && !muted && !watching) {
          const channel = server?.channels.find((entry) => entry.id === message.channelId);
          notices.activity({
            messageId: message.id,
            at: Date.now(),
            authorId: message.authorId,
            authorName: message.author.displayName,
            serverId: server?.id ?? null,
            serverName: server?.name ?? null,
            channelId: message.channelId,
            channelName: channel?.name ?? null,
            preview: plainPreview(message.content, server?.id ?? null),
          });
        }
      }

      // Read on another device: the rows behind the bell catch up too.
      if (event.t === 'read_state_update' && event.d.lastReadMessageId) {
        notices.readThrough(event.d.channelId, event.d.lastReadMessageId);
      }

      if (event.t === 'event_reminder') {
        const server = serversRef.current[event.d.serverId];
        // The channel comes from the list this member already holds, where it
        // is null if they cannot see it; the reminder itself never names one.
        const planned = server?.events?.find((entry) => entry.id === event.d.eventId);
        const channelId = planned?.channelId ?? null;
        const channel = channelId ? server?.channels.find((entry) => entry.id === channelId) : undefined;
        const prefs = notifyPrefs.get();
        const mode = placeMode(prefs, event.d.serverId, channelId);

        // Its own moment since 2026-10-01: its own sound, its own pop-up switch.
        if (momentSounds(prefs, 'event', mode)) play('event');
        const reminder: Notice = {
          id: `event-${event.d.eventId}`,
          at: Date.now(),
          kind: 'event',
          authorId: planned?.createdBy ?? '',
          authorName: event.d.title,
          serverId: event.d.serverId,
          serverName: server?.name ?? null,
          channelId,
          channelName: channel?.name ?? null,
          dmId: null,
          preview: `Starts ${fullWhen(event.d.startsAt)}`,
          read: false,
        };
        if (popupFor({ moment: 'event', authorId: '', selfId: selfId.current, blocked: false, mode, onScreen: false, prefs })) {
          present(
            {
              id: reminder.id,
              moment: 'event',
              who: event.d.title,
              where: [channel ? `#${channel.name}` : null, server?.name ?? null].filter(Boolean).join(' · ') || null,
              what: reminder.preview,
              open: () => notices.open(reminder),
            },
            prefs.popupDetail,
            document.hasFocus(),
          );
        }
        notices.arrived(
          {
            id: `event-${event.d.eventId}`,
            at: Date.now(),
            kind: 'event',
            authorId: planned?.createdBy ?? '',
            authorName: event.d.title,
            serverId: event.d.serverId,
            serverName: server?.name ?? null,
            channelId,
            channelName: channel?.name ?? null,
            dmId: null,
            preview: `Starts ${fullWhen(event.d.startsAt)}`,
            read: false,
          },
        );
      }

      if (event.t === 'voice_state_update') voiceMoments(event.d);

      if (event.t === 'purdle_done' || event.t === 'cuntections_done' || event.t === 'game_done') {
        const name =
          event.t === 'purdle_done'
            ? 'Purdle'
            : event.t === 'cuntections_done'
              ? 'Cuntections'
              : GAME_NAMES[event.d.game];
        gameMoment(event.d.serverId, event.d.userId, name);
      }

      if (event.t === 'ready') {
        selfId.current = event.d.user.id;
        notices.use(event.d.user.id);
        // A fresh gateway connection means the server forgot we were in a
        // call when the old one dropped. Rejoin rather than sit in a room
        // the server no longer thinks we are in.
        selfRooms.current.clear();
        voiceSeen.current.clear();
        for (const entry of event.d.voiceStates) voiceSeen.current.set(voiceKey(entry.serverId, entry.userId), entry);
        for (const entry of event.d.voiceStates) {
          const room = voiceRoomOf(entry);
          if (entry.userId === event.d.user.id && room) selfRooms.current.set(voiceKey(entry.serverId, entry.userId), room);
        }
        const place = currentCall.current;
        if (place) {
          void voice.join(place, () =>
            gatewayRef.current?.send({ t: 'voice_state', d: { ...intentFor(place), ...standingVoice() } }),
          );
        }
      }
      // The only errors the gateway sends are refusals of something we just
      // asked for. Mid-join, that is the join: show it rather than sit on
      // "connecting" forever.
      if (event.t === 'error' && currentCall.current) {
        currentCall.current = null;
        voice.fail(event.d.message);
      }
      // A moderator moved us. Only the device in that call follows, and it
      // joins the ordinary way, so its keys are made here as for any join.
      // The server takes us out of the old channel right after; that
      // departure names the old room, not this one, so it does not hang up.
      if (event.t === 'voice_move') {
        const place = currentCall.current;
        if (place?.kind === 'channel' && place.id === event.d.fromChannelId) {
          const next: CallPlace = { kind: 'channel', id: event.d.channelId };
          currentCall.current = next;
          if (openChannel.current === event.d.fromChannelId) dispatch({ type: 'select-channel', channelId: event.d.channelId });
          void voice.join(next, () =>
            gatewayRef.current?.send({ t: 'voice_state', d: { ...intentFor(next), ...standingVoice() } }),
          );
        }
      }
      if (event.t === 'voice_membership') void voice.onMembership(event.d);
      if (event.t === 'voice_signal') void voice.onSignal(event.d);
      if (event.t === 'voice_state_update' && event.d.userId === selfId.current) {
        const key = voiceKey(event.d.serverId, event.d.userId);
        const room = voiceRoomOf(event.d);
        const left = room === null ? selfRooms.current.get(key) : undefined;
        if (room === null) selfRooms.current.delete(key);
        else selfRooms.current.set(key, room);

        // A tone when mute or deafen changes, yours or a moderator's, like
        // Discord. Only within one call: joining somewhere new is not a change.
        const before = ownVoice.current;
        if (room === null) {
          if (before && voiceRoomOf(before) === left) ownVoice.current = null;
        } else {
          ownVoice.current = event.d;
          const cue = before && voiceRoomOf(before) === room ? muteCue(before, event.d) : null;
          const prefs = voicePrefs.get();
          if (cue && currentCall.current && prefs.muteSounds) sounds[cue](prefs.outputVolume);
        }

        if (room === null) {
          // Moved out by a moderator, removed from the server, or refused
          // mid-call; but only if it is the call this device is in. Starting
          // a call somewhere else announces leaving the old one, and that
          // must not hang up the new one.
          const place = currentCall.current;
          if (place && left === place.id) {
            currentCall.current = null;
            void voice.leave();
          }
        } else {
          // A server mute is not a request. Enforce it here as well as in the grant.
          void voice.setMuted(event.d.selfMute || event.d.serverMute || event.d.selfDeaf);
          // The soundboard is a separate track, so a moderator's mute has to
          // reach it separately. Muting yourself does not: picking a sound
          // is as deliberate as unmuting.
          voice.setServerMuted(event.d.serverMute);
          voice.setDeafened(event.d.selfDeaf || event.d.serverDeaf);
        }
      }

      if (event.t === 'emojis_changed') {
        const serverId = event.d.serverId;
        void api.emojis
          .list(serverId)
          .then(({ emojis }) => dispatch({ type: 'emojis-loaded', serverId, emojis }))
          .catch(() => undefined);
      }

      if (event.t === 'purdle_done') purdle.done(event.d);
      if (event.t === 'cuntections_done') cuntections.done(event.d);
      if (event.t === 'bee_score') bee.moved(event.d);
      if (event.t === 'game_done') ({ queens, travle, thrice, whereabouts, lowball })[event.d.game].done(event.d);

      if (event.t === 'sounds_changed') {
        const serverId = event.d.serverId;
        void api.sounds
          .list(serverId)
          .then(({ sounds }) => dispatch({ type: 'sounds-loaded', serverId, sounds }))
          .catch(() => undefined);
      }

      // Any permission change anywhere means our view of that server may be
      // wrong. Refetching is cheap and cannot be subtly incorrect the way a
      // client-side delta would be.
      if (event.t === 'permissions_stale') {
        const serverId = event.d.serverId;
        void api.servers
          .one(serverId)
          .then(({ server }) => dispatch({ type: 'server-refreshed', server }))
          .catch(() => {
            // Losing access entirely produces a 404; the server_delete or
            // member_leave event that accompanies it handles the cleanup.
          });
        // And who is in a call, which the channel list does not carry. Being
        // let into a voice channel has to show the people already in it, and
        // nobody is going to move just to generate an event.
        void api.voice
          .states(serverId)
          .then(({ voiceStates }) => {
            // Remembered too, so nobody already sharing reads as "went live".
            for (const [key, seen] of voiceSeen.current) if (seen.serverId === serverId) voiceSeen.current.delete(key);
            for (const entry of voiceStates) voiceSeen.current.set(voiceKey(entry.serverId, entry.userId), entry);
            dispatch({ type: 'voice-states-refreshed', serverId, voiceStates });
          })
          .catch(() => undefined);
      }
    };

    /**
     * Sealed messages are opened here, before anything else sees them, so the
     * reducer, the listeners and the notices all get what the rest of the app
     * expects: a message with its text. `channel-keys.ts`.
     */
    const prepareEvent = async (event: ServerEvent): Promise<ServerEvent> => {
      const me = selfId.current;
      if (!me) return event;
      const keys = channelKeysFor(me);
      if (event.t === 'message_create' || event.t === 'message_update') {
        // Sealed messages by their ciphertext; plain ones in a channel this
        // device has seen encrypted too, because there the honest server
        // stores no plaintext at all, and one that arrives was made up.
        // `channelMemory().isEncrypted` is a lookup in memory, so this costs
        // nothing for the channels that are plain as far as this device knows.
        // It waits for the memory's first read, or a made-up message arriving
        // just after sign-in would be drawn before the channel is known.
        await channelMemory().load().catch(() => undefined);
        if (event.d.ciphertext || channelMemory().isEncrypted(event.d.channelId)) {
          // Live: a plain message arriving now was written now, whatever date
          // the server put on it.
          const [opened] = await keys.open([event.d], { live: true });
          return { ...event, d: opened ?? event.d };
        }
        return event;
      }
      if (event.t === 'spawn_replay' && event.d.content === null) {
        return { ...event, d: { ...event.d, content: keys.textOf(event.d.messageId) } };
      }
      if (event.t === 'channel_keys') {
        keys.keysChanged(event.d.channelId, event.d.wanted);
        // A copy may have just arrived for this device: try again whatever did not open.
        const waiting = (messagesRef.current[event.d.channelId] ?? []).filter(
          (message) => message.ciphertext && message.sealed && message.sealed !== 'ok' && !message.deleted,
        );
        if (waiting.length > 0) {
          keys.forgetUnopened(event.d.channelId, waiting);
          for (const message of await keys.open(waiting)) {
            if (message.sealed !== 'no-key') dispatch({ type: 'gateway', event: { t: 'message_update', d: message } });
          }
        }
      }
      return event;
    };

    // Events are handled one at a time, in order. Most pass straight through;
    // a sealed message is opened first, which is asynchronous, and nothing
    // behind it may overtake it (a delete arriving before its create).
    let queue: Promise<void> = Promise.resolve();
    const gateway = new Gateway({
      onEvent: (raw) => {
        queue = queue.then(async () => {
          const event = await prepareEvent(raw).catch(() => raw);
          handleEvent(event);
        });
      },
      onStatus: (status) => {
        dispatch({ type: 'connection', status });
        if (status === 'closed') onSignedOut();
        // A fresh connection starts out as nobody looking; say otherwise.
        if (status === 'open' && attending) gateway.send({ t: 'attention', d: { active: true } });
      },
    });

    // Whether somebody is at this window decides whether their phone is
    // woken for a message (`lib/push.ts`).
    let attending = false;
    const stopAttention = watchAttention((active) => {
      attending = active;
      gateway.send({ t: 'attention', d: { active } });
    });
    const stopPushSync = startPushSync();
    const stopClearing = clearWhenOpened();

    gatewayRef.current = gateway;
    gateway.connect();

    return () => {
      stopAttention();
      stopPushSync();
      stopClearing();
      void voice.leave();
      gateway.close();
      gatewayRef.current = null;
    };
  }, [onSignedOut, voice]);

  const selectServer = useCallback((serverId: string) => {
    dispatch({ type: 'select-server', serverId });
  }, []);

  const selectChannel = useCallback((channelId: string) => {
    dispatch({ type: 'select-channel', channelId });
  }, []);

  // Typing is rate limited client-side: one event per channel every few
  // seconds is plenty to keep an indicator alive, and anything more is noise
  // on every other client's socket.
  const lastTypingSent = useRef<Record<string, number>>({});
  const sendTyping = useCallback((channelId: string) => {
    const now = Date.now();
    const last = lastTypingSent.current[channelId] ?? 0;
    if (now - last < 4000) return;
    lastTypingSent.current[channelId] = now;
    gatewayRef.current?.send({ t: 'typing', d: { channelId } });
  }, []);

  const setPresence = useCallback((status: PresenceStatus) => {
    gatewayRef.current?.send({ t: 'presence', d: { status } });
  }, []);

  const joinCall = useCallback(
    (place: CallPlace) => {
      const current = currentCall.current;
      if (current && current.kind === place.kind && current.id === place.id) return;
      currentCall.current = place;
      // The session prepares its keys first and only then tells the gateway,
      // because the gateway answers a join with the membership event at once.
      // The gateway takes this person out of any other call as it puts them
      // in this one: one call at a time, a server's or a conversation's.
      void voice.join(place, () =>
        gatewayRef.current?.send({ t: 'voice_state', d: { ...intentFor(place), ...standingVoice() } }),
      );
    },
    [voice],
  );

  const joinVoice = useCallback((channelId: string) => joinCall({ kind: 'channel', id: channelId }), [joinCall]);
  const joinDmCall = useCallback((dmId: string) => joinCall({ kind: 'dm', id: dmId }), [joinCall]);

  const leaveVoice = useCallback(() => {
    currentCall.current = null;
    gatewayRef.current?.send({ t: 'voice_state', d: { channelId: null } });
    void voice.leave();
  }, [voice]);

  const updateVoice = useCallback(
    (patch: { selfMute?: boolean; selfDeaf?: boolean; sharingScreen?: boolean; cameraOn?: boolean }) => {
      // Remembered either way, so the next call starts as this one was left.
      const remembered: { selfMute?: boolean; selfDeaf?: boolean } = {};
      if (patch.selfMute !== undefined) remembered.selfMute = patch.selfMute;
      if (patch.selfDeaf !== undefined) remembered.selfDeaf = patch.selfDeaf;
      if (Object.keys(remembered).length) voicePrefs.set(remembered);
      const place = currentCall.current;
      if (!place) return;
      gatewayRef.current?.send({ t: 'voice_state', d: { ...intentFor(place), ...patch } });
    },
    [],
  );

  // What the member list says about the camera and the screen follows what
  // LiveKit is actually sending, including a share ended from the browser's
  // own "Stop sharing" bar.
  useEffect(() => {
    let sent = { camera: false, sharing: false };
    return voice.subscribe(() => {
      const { phase, camera, sharing } = voice.getSnapshot();
      if (phase !== 'connected') {
        sent = { camera: false, sharing: false };
        return;
      }
      if (camera === sent.camera && sharing === sent.sharing) return;
      sent = { camera, sharing };
      updateVoice({ cameraOn: camera, sharingScreen: sharing });
    });
  }, [voice, updateVoice]);

  // Read by the actions below, which need the list as it is now rather than as
  // it was when the callback was made.
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  useEffect(() => on(DEVICE_ACCEPTED, () => {
    const me = selfId.current;
    if (!me) return;
    const keys = channelKeysFor(me);
    void keys.refreshAccepted().then(async () => {
      const waiting = Object.values(messagesRef.current).flat().filter((message) => message.sealed === 'unverified');
      for (const message of await keys.open(waiting)) {
        if (selfId.current === me) dispatch({ type: 'gateway', event: { t: 'message_update', d: message } });
      }
    }).catch(() => undefined);
  }), []);

  /**
   * Sealed messages in a page are opened before the page reaches the store,
   * and plain ones in a channel this device has seen encrypted are checked:
   * there is no readable history there to believe. `lib/channel-keys.ts`.
   */
  const openSealed = useCallback(async (messages: Message[]): Promise<Message[]> => {
    const me = selfId.current ?? state.user?.id ?? null;
    if (!me) return messages;
    // The first history page after sign-in must not be judged before the
    // memory has been read, for the same reason as a live message.
    await channelMemory().load().catch(() => undefined);
    const worthOpening = messages.some(
      (message) => message.ciphertext || channelMemory().isEncrypted(message.channelId),
    );
    if (!worthOpening) return messages;
    return channelKeysFor(me).open(messages);
  }, [state.user?.id]);

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    const messages = await openSealed((await api.messages.list(channelId, { before, limit: 50 })).messages);
    dispatch({
      type: 'messages-loaded',
      channelId,
      messages,
      prepend: Boolean(before),
      // Paging up stays inside whatever the list already is. Loading a channel
      // from scratch is always the newest page, so it is never a window.
      ...(before ? {} : { windowed: false }),
    });
  }, []);

  const loadNewerMessages = useCallback(async (channelId: string) => {
    const newest = (messagesRef.current[channelId] ?? []).at(-1);
    if (!newest) return;
    const messages = await openSealed((await api.messages.list(channelId, { after: newest.id, limit: 50 })).messages);
    dispatch({
      type: 'messages-loaded',
      channelId,
      messages,
      append: true,
      // A short page means there was nothing more to fetch, so the list now
      // ends at the newest message and behaves like an ordinary channel again.
      windowed: messages.length >= 50,
    });
  }, []);

  const jumpToMessage = useCallback(async (channelId: string, messageId: string) => {
    const known = (messagesRef.current[channelId] ?? []).some((message) => message.id === messageId);
    if (!known) {
      const messages = await openSealed((await api.messages.list(channelId, { around: messageId })).messages);
      // A window is only a window if the half after the target came back full;
      // a short half means the newest message is already in hand.
      const at = messages.findIndex((message) => message.id === messageId);
      const windowed = at >= 0 && messages.length - at - 1 >= 25;
      dispatch({ type: 'messages-loaded', channelId, messages, windowed });
    }
    // After the window is in the store, so selecting the channel finds it
    // already loaded rather than fetching the newest page over the top of it.
    if (openChannel.current !== channelId) dispatch({ type: 'select-channel', channelId });
    jumpToSoon(messageId);
  }, []);

  // The ref keeps this callback stable while still seeing the latest state,
  // so the message list can call it on every scroll without re-rendering.
  const readStatesRef = useRef(state.readStates);
  readStatesRef.current = state.readStates;
  const markRead = useCallback((channelId: string, messageId: string) => {
    const current = readStatesRef.current[channelId];
    const caughtUp = current?.lastReadMessageId && current.lastReadMessageId >= messageId;
    if (caughtUp && current.mentionCount === 0) return;
    dispatch({ type: 'marked-read', channelId, messageId });
    notices.readWhere({ channelId });
    void api.messages.markRead(channelId, messageId).catch(() => undefined);
  }, []);

  const replyTo = useCallback((channelId: string, message: Message | null) => {
    dispatch({ type: 'reply-to', channelId, message });
  }, []);

  const applyMessage = useCallback((channelId: string, message: Message) => {
    dispatch({ type: 'message-applied', channelId, message });
  }, []);

  const applyTracker = useCallback((channelId: string, tracker: Tracker | null) => {
    dispatch({ type: 'tracker', channelId, tracker });
  }, []);

  // The open channel's tracker, asked for on opening it and again after a
  // reconnect, since any `tracker_update` sent while the socket was down is lost.
  const selectedChannelId = state.selectedChannelId;
  const connected = state.connection === 'open';
  useEffect(() => {
    if (!selectedChannelId || !connected) return;
    const channelId = selectedChannelId;
    void api.trackers
      .get(channelId)
      .then(({ tracker }) => dispatch({ type: 'tracker', channelId, tracker }))
      .catch(() => undefined);
  }, [selectedChannelId, connected]);

  const loadMembers = useCallback(async (serverId: string) => {
    const { members } = await api.servers.members(serverId);
    dispatch({ type: 'members-loaded', serverId, members });
  }, []);

  const refreshServer = useCallback(async (serverId: string) => {
    const { server } = await api.servers.one(serverId);
    dispatch({ type: 'server-refreshed', server });
  }, []);

  const block = useCallback(async (userId: string) => {
    const { blocks } = await api.blocks.add(userId);
    dispatch({ type: 'blocks', blocks });
  }, []);

  const unblock = useCallback(async (userId: string) => {
    const { blocks } = await api.blocks.remove(userId);
    dispatch({ type: 'blocks', blocks });
  }, []);

  const patchUser = useCallback((patch: Partial<SelfUser>) => {
    dispatch({ type: 'patch-user', patch });
  }, []);

  const onGatewayEvent = useCallback((listener: (event: ServerEvent) => void) => {
    eventListeners.current.add(listener);
    return () => {
      eventListeners.current.delete(listener);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      gatewayRef.current?.close();
      // What this device has seen of channels is per browser, but the view is
      // one account's; it is read again on the next sign-in.
      channelMemory().forget();
      dispatch({ type: 'signed-out' });
      onSignedOut();
    }
  }, [onSignedOut]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      selectServer,
      selectChannel,
      sendTyping,
      setPresence,
      joinVoice,
      joinDmCall,
      leaveVoice,
      updateVoice,
      voice,
      loadMessages,
      loadNewerMessages,
      jumpToMessage,
      markRead,
      replyTo,
      applyMessage,
      applyTracker,
      loadMembers,
      refreshServer,
      block,
      unblock,
      patchUser,
      onGatewayEvent,
      signOut,
    }),
    [
      state,
      selectServer,
      selectChannel,
      sendTyping,
      setPresence,
      joinVoice,
      joinDmCall,
      leaveVoice,
      updateVoice,
      voice,
      loadMessages,
      loadNewerMessages,
      jumpToMessage,
      markRead,
      replyTo,
      applyMessage,
      applyTracker,
      loadMembers,
      refreshServer,
      block,
      unblock,
      patchUser,
      onGatewayEvent,
      signOut,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside a StoreProvider.');
  return value;
}

/* ------------------------------- selectors ------------------------------- */

export function useSelectedServer(): ServerDetail | null {
  const { state } = useStore();
  return state.selectedServerId ? (state.servers[state.selectedServerId] ?? null) : null;
}

export function useSelectedChannel() {
  const server = useSelectedServer();
  const { state } = useStore();
  if (!server || !state.selectedChannelId) return null;
  return server.channels.find((channel) => channel.id === state.selectedChannelId) ?? null;
}

export function usePresence(userId: string): PresenceStatus {
  const { state } = useStore();
  return state.presences[userId] ?? 'offline';
}

/** Everyone currently sitting in a given voice channel. */
export function useVoiceMembers(channelId: string): VoiceState[] {
  const { state } = useStore();
  return useMemo(
    () => Object.values(state.voiceStates).filter((voice) => voice.channelId === channelId),
    [state.voiceStates, channelId],
  );
}

export function useTypingUsers(channelId: string | null): string[] {
  const { state } = useStore();
  return useMemo(() => {
    if (!channelId) return [];
    const entries = state.typing[channelId] ?? {};
    const cutoff = Date.now() - 7000;
    return Object.entries(entries)
      .filter(([userId, at]) => at > cutoff && userId !== state.user?.id)
      .map(([userId]) => userId);
  }, [state.typing, channelId, state.user?.id]);
}

export type { Presence };

/* --------------------------------- unread ---------------------------------- */

export interface Unread {
  unread: boolean;
  mentions: number;
  /** Messages since the last one read, where that is known; see `ReadState.unreadCount`. */
  count: number;
}

/** Whether a channel holds anything newer than what this person has read. */
export function unreadFor(state: State, channel: { id: string; type: string; lastMessageId: string | null }): Unread {
  if (channel.type !== 'text') return { unread: false, mentions: 0, count: 0 };
  const read = state.readStates[channel.id];
  const unread = Boolean(
    channel.lastMessageId && (!read?.lastReadMessageId || channel.lastMessageId > read.lastReadMessageId),
  );
  return { unread, mentions: read?.mentionCount ?? 0, count: unread ? (read?.unreadCount ?? 0) : 0 };
}

export function unreadForServer(state: State, serverId: string): Unread {
  let unread = false;
  let mentions = 0;
  let count = 0;
  for (const channel of state.servers[serverId]?.channels ?? []) {
    const one = unreadFor(state, channel);
    unread = unread || one.unread;
    mentions += one.mentions;
    count += one.count;
  }
  return { unread, mentions, count };
}

/** Past 99 the number stops being information and starts being a shape. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** The same count said aloud, for a title or a screen reader. */
export function countLabel(count: number): string {
  return count === 1 ? '1 mention' : `${count} mentions`;
}
