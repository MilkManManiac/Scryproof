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
  Emoji,
  Member,
  Message,
  Presence,
  PresenceStatus,
  ReadState,
  SelfUser,
  ServerDetail,
  ServerEvent,
  VoiceState,
} from '@scryproof/shared';

import { api } from '../lib/api';
import { noticeFor, notices, previewOf } from '../lib/notices';
import { isMuted, notifyPrefs, play, soundFor } from '../lib/notify';
import { Gateway, type ConnectionStatus } from '../lib/gateway';
import { jumpToSoon } from '../lib/jump';
import { VoiceSession } from '../lib/voice-session';
import { voicePrefs } from '../lib/voice-prefs';

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
  | { type: 'emojis-loaded'; serverId: string; emojis: Emoji[] }
  | { type: 'voice-states-refreshed'; serverId: string; voiceStates: VoiceState[] }
  | { type: 'marked-read'; channelId: string; messageId: string }
  | { type: 'reply-to'; channelId: string; message: Message | null }
  | { type: 'blocks'; blocks: string[] }
  | { type: 'signed-out' }
  /**
   * A message this client already holds the truth about, straight from an API
   * response rather than the gateway. Voting on a poll is the reason this
   * exists: the broadcast for a vote is `poll_update`, which deliberately
   * carries no one's `mine` but the voter's own, so the voter's own copy has
   * to come from the response to their own request instead.
   */
  | { type: 'message-applied'; channelId: string; message: Message };

const voiceKey = (serverId: string, userId: string): string => `${serverId}:${userId}`;

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
  return { ...state.readStates, [channelId]: { channelId, lastReadMessageId, mentionCount } };
}

function upsertServer(state: State, server: ServerDetail): State {
  const known = state.serverOrder.includes(server.id);
  return {
    ...state,
    servers: { ...state.servers, [server.id]: server },
    serverOrder: known ? state.serverOrder : [...state.serverOrder, server.id],
  };
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
      return upsertServer(state, action.server);

    // The emoji arrive with the server and are replaced wholesale when they
    // change, for the same reason roles are reordered in one event: the answer
    // just fetched is complete, and a merge could keep one that was removed.
    case 'emojis-loaded': {
      const server = state.servers[action.serverId];
      if (!server) return state;
      return upsertServer(state, { ...server, emojis: action.emojis });
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
      for (const server of event.d.servers) servers[server.id] = server;

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
            : state.readStates,
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
          [event.d.channelId]: existing.map((message) =>
            message.id === event.d.id ? event.d : message,
          ),
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

    case 'read_state_update': {
      const current = state.readStates[event.d.channelId];
      // A count for a channel we have read past since is already stale.
      const ahead =
        current?.lastReadMessageId &&
        (!event.d.lastReadMessageId || current.lastReadMessageId > event.d.lastReadMessageId);
      return {
        ...state,
        readStates: {
          ...state.readStates,
          [event.d.channelId]: ahead
            ? { ...event.d, lastReadMessageId: current.lastReadMessageId }
            : event.d,
        },
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
      return upsertServer(state, event.d);

    case 'server_update': {
      const existing = state.servers[event.d.id];
      if (!existing) return state;
      return { ...state, servers: { ...state.servers, [event.d.id]: { ...existing, ...event.d } } };
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
      return upsertServer(state, { ...server, channels: [...server.channels, event.d] });
    }

    case 'channel_update': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      const known = server.channels.some((channel) => channel.id === event.d.id);
      return upsertServer(state, {
        ...server,
        channels: known
          ? server.channels.map((channel) => (channel.id === event.d.id ? event.d : channel))
          : [...server.channels, event.d],
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
      if (event.d.channelId === null) {
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
  loadMembers: (serverId: string) => Promise<void>;
  refreshServer: (serverId: string) => Promise<void>;
  /** Block or unblock somebody. The list the server answers with is the one kept. */
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
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
  const currentVoiceChannel = useRef<string | null>(null);
  const selfId = useRef<string | null>(null);
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
    Object.assign(window, { __voice: voice, __voicePrefs: voicePrefs });
  }

  useEffect(() => {
    const gateway = new Gateway({
      onEvent: (event) => {
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
            prefs: notifyPrefs.get(),
          });
          if (sound) play(sound);

          const message = event.d;
          const focused = document.hasFocus();
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
                preview: previewOf(message.content),
                read: false,
              },
              verdict.popup,
            );
          }
        }

        if (event.t === 'ready') {
          selfId.current = event.d.user.id;
          notices.use(event.d.user.id);
          // A fresh gateway connection means the server forgot we were in a
          // call when the old one dropped. Rejoin rather than sit in a room
          // the server no longer thinks we are in.
          const channelId = currentVoiceChannel.current;
          if (channelId) {
            void voice.join(channelId, () =>
              gatewayRef.current?.send({ t: 'voice_state', d: { channelId } }),
            );
          }
        }
        // The only errors the gateway sends are refusals of something we just
        // asked for. Mid-join, that is the join: show it rather than sit on
        // "connecting" forever.
        if (event.t === 'error' && currentVoiceChannel.current) {
          currentVoiceChannel.current = null;
          voice.fail(event.d.message);
        }
        if (event.t === 'voice_membership') void voice.onMembership(event.d);
        if (event.t === 'voice_signal') void voice.onSignal(event.d);
        if (event.t === 'voice_state_update' && event.d.userId === selfId.current) {
          if (event.d.channelId === null && currentVoiceChannel.current) {
            // Moved out by a moderator, or removed from the server.
            currentVoiceChannel.current = null;
            void voice.leave();
          } else {
            // A server mute is not a request. Enforce it here as well as in the grant.
            void voice.setMuted(event.d.selfMute || event.d.serverMute || event.d.selfDeaf);
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
            .then(({ voiceStates }) =>
              dispatch({ type: 'voice-states-refreshed', serverId, voiceStates }),
            )
            .catch(() => undefined);
        }
      },
      onStatus: (status) => {
        dispatch({ type: 'connection', status });
        if (status === 'closed') onSignedOut();
      },
    });

    gatewayRef.current = gateway;
    gateway.connect();

    return () => {
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

  const joinVoice = useCallback(
    (channelId: string) => {
      if (currentVoiceChannel.current === channelId) return;
      currentVoiceChannel.current = channelId;
      // The session prepares its keys first and only then tells the gateway,
      // because the gateway answers a join with the membership event at once.
      void voice.join(channelId, () =>
        gatewayRef.current?.send({ t: 'voice_state', d: { channelId } }),
      );
    },
    [voice],
  );

  const leaveVoice = useCallback(() => {
    currentVoiceChannel.current = null;
    gatewayRef.current?.send({ t: 'voice_state', d: { channelId: null } });
    void voice.leave();
  }, [voice]);

  const updateVoice = useCallback(
    (patch: { selfMute?: boolean; selfDeaf?: boolean; sharingScreen?: boolean; cameraOn?: boolean }) => {
      const channelId = currentVoiceChannel.current;
      if (!channelId) return;
      gatewayRef.current?.send({ t: 'voice_state', d: { channelId, ...patch } });
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

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    const { messages } = await api.messages.list(channelId, { before, limit: 50 });
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
    const { messages } = await api.messages.list(channelId, { after: newest.id, limit: 50 });
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
      const { messages } = await api.messages.list(channelId, { around: messageId });
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
      leaveVoice,
      updateVoice,
      voice,
      loadMessages,
      loadNewerMessages,
      jumpToMessage,
      markRead,
      replyTo,
      applyMessage,
      loadMembers,
      refreshServer,
      block,
      unblock,
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
      leaveVoice,
      updateVoice,
      voice,
      loadMessages,
      loadNewerMessages,
      jumpToMessage,
      markRead,
      replyTo,
      applyMessage,
      loadMembers,
      refreshServer,
      block,
      unblock,
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
}

/** Whether a channel holds anything newer than what this person has read. */
export function unreadFor(state: State, channel: { id: string; type: string; lastMessageId: string | null }): Unread {
  if (channel.type !== 'text') return { unread: false, mentions: 0 };
  const read = state.readStates[channel.id];
  const unread = Boolean(
    channel.lastMessageId && (!read?.lastReadMessageId || channel.lastMessageId > read.lastReadMessageId),
  );
  return { unread, mentions: read?.mentionCount ?? 0 };
}

export function unreadForServer(state: State, serverId: string): Unread {
  let unread = false;
  let mentions = 0;
  for (const channel of state.servers[serverId]?.channels ?? []) {
    const one = unreadFor(state, channel);
    unread = unread || one.unread;
    mentions += one.mentions;
  }
  return { unread, mentions };
}

/** Past 99 the number stops being information and starts being a shape. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** The same count said aloud, for a title or a screen reader. */
export function countLabel(count: number): string {
  return count === 1 ? '1 mention' : `${count} mentions`;
}
