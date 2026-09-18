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
  Member,
  Message,
  Presence,
  PresenceStatus,
  ReadState,
  SelfUser,
  ServerDetail,
  ServerEvent,
  VoiceState,
} from '@gooffline/shared';

import { api } from '../lib/api';
import { notifyPrefs, play, soundFor } from '../lib/notify';
import { Gateway, type ConnectionStatus } from '../lib/gateway';
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
  presences: Record<string, PresenceStatus>;
  voiceStates: Record<string, VoiceState>;
  /** channelId -> userId -> last typed at (ms). */
  typing: Record<string, Record<string, number>>;
  /** How far this person has read, per channel. Drives every unread mark. */
  readStates: Record<string, ReadState>;
  /** The message being replied to, per channel, so a half-written reply survives a channel switch. */
  replyingTo: Record<string, Message>;

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
  presences: {},
  voiceStates: {},
  typing: {},
  readStates: {},
  replyingTo: {},
  selectedServerId: null,
  selectedChannelId: null,
  lastChannelByServer: {},
};

type Action =
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'gateway'; event: ServerEvent }
  | { type: 'select-server'; serverId: string }
  | { type: 'select-channel'; channelId: string }
  | { type: 'messages-loaded'; channelId: string; messages: Message[]; prepend?: boolean }
  | { type: 'members-loaded'; serverId: string; members: Member[] }
  | { type: 'server-refreshed'; server: ServerDetail }
  | { type: 'voice-states-refreshed'; serverId: string; voiceStates: VoiceState[] }
  | { type: 'marked-read'; channelId: string; messageId: string }
  | { type: 'reply-to'; channelId: string; message: Message | null }
  | { type: 'signed-out' };

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
      return {
        ...state,
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
      const merged = action.prepend
        ? [...action.messages, ...existing]
        : action.messages;

      // Deduplicate by id and keep chronological order. Ids are UUIDv7, so a
      // plain string sort is a time sort.
      const byId = new Map(merged.map((message) => [message.id, message]));
      const ordered = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

      return {
        ...state,
        messages: { ...state.messages, [action.channelId]: ordered },
        loadedChannels: { ...state.loadedChannels, [action.channelId]: true },
      };
    }

    case 'members-loaded':
      return { ...state, members: { ...state.members, [action.serverId]: action.members } };

    case 'server-refreshed':
      return upsertServer(state, action.server);

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

    case 'reply-to': {
      const { [action.channelId]: removed, ...rest } = state.replyingTo;
      void removed;
      return { ...state, replyingTo: action.message ? { ...rest, [action.channelId]: action.message } : rest };
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
        messages: { ...state.messages, [event.d.channelId]: [...existing, event.d] },
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

    case 'role_delete': {
      const server = state.servers[event.d.serverId];
      if (!server) return state;
      return upsertServer(state, {
        ...server,
        roles: server.roles.filter((role) => role.id !== event.d.id),
      });
    }

    case 'member_join': {
      const existing = state.members[event.d.serverId] ?? [];
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
  /** Tell the server this channel has been read up to a message. Safe to call often. */
  markRead: (channelId: string, messageId: string) => void;
  replyTo: (channelId: string, message: Message | null) => void;
  loadMembers: (serverId: string) => Promise<void>;
  refreshServer: (serverId: string) => Promise<void>;
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

        if (event.t === 'message_create') {
          const sound = soundFor({
            authorId: event.d.authorId,
            mentions: event.d.mentions ?? [],
            mentionsEveryone: event.d.mentionsEveryone ?? false,
            selfId: selfId.current,
            channelId: event.d.channelId,
            openChannelId: openChannel.current,
            windowFocused: document.hasFocus(),
            prefs: notifyPrefs.get(),
          });
          if (sound) play(sound);
        }

        if (event.t === 'ready') {
          selfId.current = event.d.user.id;
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

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    const { messages } = await api.messages.list(channelId, { before, limit: 50 });
    dispatch({ type: 'messages-loaded', channelId, messages, prepend: Boolean(before) });
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
    void api.messages.markRead(channelId, messageId).catch(() => undefined);
  }, []);

  const replyTo = useCallback((channelId: string, message: Message | null) => {
    dispatch({ type: 'reply-to', channelId, message });
  }, []);

  const loadMembers = useCallback(async (serverId: string) => {
    const { members } = await api.servers.members(serverId);
    dispatch({ type: 'members-loaded', serverId, members });
  }, []);

  const refreshServer = useCallback(async (serverId: string) => {
    const { server } = await api.servers.one(serverId);
    dispatch({ type: 'server-refreshed', server });
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
      markRead,
      replyTo,
      loadMembers,
      refreshServer,
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
      markRead,
      replyTo,
      loadMembers,
      refreshServer,
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
