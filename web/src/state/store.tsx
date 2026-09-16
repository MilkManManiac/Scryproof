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
  SelfUser,
  ServerDetail,
  ServerEvent,
  VoiceState,
} from '@gooffline/shared';

import { api } from '../lib/api';
import { Gateway, type ConnectionStatus } from '../lib/gateway';

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
  | { type: 'signed-out' };

const voiceKey = (serverId: string, userId: string): string => `${serverId}:${userId}`;

/** First text channel the member can see, for landing on a sensible default. */
function firstVisibleChannel(server: ServerDetail | undefined): string | null {
  if (!server) return null;
  const text = server.channels.filter((channel) => channel.type === 'text');
  const sorted = [...text].sort((a, b) => a.position - b.position);
  return sorted[0]?.id ?? null;
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
        selectedServerId,
        selectedChannelId,
      };
    }

    case 'message_create': {
      const existing = state.messages[event.d.channelId] ?? [];
      if (existing.some((message) => message.id === event.d.id)) return state;

      return {
        ...state,
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
    case 'voice_key':
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
  loadMessages: (channelId: string, before?: string) => Promise<void>;
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

  useEffect(() => {
    const gateway = new Gateway({
      onEvent: (event) => {
        dispatch({ type: 'gateway', event });

        // Any permission change anywhere means our view of that server may be
        // wrong. Refetching is cheap and cannot be subtly incorrect the way a
        // client-side delta would be.
        if (event.t === 'permissions_stale') {
          void api.servers
            .one(event.d.serverId)
            .then(({ server }) => dispatch({ type: 'server-refreshed', server }))
            .catch(() => {
              // Losing access entirely produces a 404; the server_delete or
              // member_leave event that accompanies it handles the cleanup.
            });
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
      gateway.close();
      gatewayRef.current = null;
    };
  }, [onSignedOut]);

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

  const joinVoice = useCallback((channelId: string) => {
    currentVoiceChannel.current = channelId;
    gatewayRef.current?.send({ t: 'voice_state', d: { channelId } });
  }, []);

  const leaveVoice = useCallback(() => {
    currentVoiceChannel.current = null;
    gatewayRef.current?.send({ t: 'voice_state', d: { channelId: null } });
  }, []);

  const updateVoice = useCallback(
    (patch: { selfMute?: boolean; selfDeaf?: boolean; sharingScreen?: boolean; cameraOn?: boolean }) => {
      const channelId = currentVoiceChannel.current;
      if (!channelId) return;
      gatewayRef.current?.send({ t: 'voice_state', d: { channelId, ...patch } });
    },
    [],
  );

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    const { messages } = await api.messages.list(channelId, { before, limit: 50 });
    dispatch({ type: 'messages-loaded', channelId, messages, prepend: Boolean(before) });
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
      loadMessages,
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
      loadMessages,
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
