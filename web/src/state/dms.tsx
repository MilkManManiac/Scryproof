/**
 * Direct message state.
 *
 * Beside the main store rather than in it, for one reason: everything here is
 * asynchronous in a way the reducer is not. A message arrives sealed, and
 * turning it into text means fetching keys, checking them against what this
 * device remembers, and decrypting. The main store hears an event and the
 * state is different; this one hears an event and starts work.
 *
 * What is kept in memory is opened text. What is kept anywhere else is
 * nothing: no plaintext is written to storage, so closing the tab forgets it
 * and opening it again decrypts from the sealed copies.
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

import type { DeviceKey, DmChannel, DmMessage, PublicUser, ServerEvent } from '@scryproof/shared';

import { api, ApiError } from '../lib/api';
import {
  type AssessedDevice,
  type DmBody,
  type DmDevice,
  assessDevices,
  createDmKeypair,
  describeDevice,
  describeDmKeypair,
  isTrusted,
  openMessage,
  sealMessage,
} from '../lib/dm-crypto';
import { notifyPrefs, play, soundFor } from '../lib/notify';
import { acceptIdentityChange, createDeviceIdentity } from '../lib/voice-crypto';
import { IndexedDbIdentityStore, loadDeviceIdentity, loadDmKeypair } from '../lib/voice-identity';
import { useStore } from './store';

/** A message as the screen draws it. */
export interface DmView {
  id: string;
  dmId: string;
  authorId: string;
  createdAt: string;
  deleted: boolean;
  /** Null when deleted, or when it could not be opened. */
  text: string | null;
  /**
   * 'no-key': sent before this device existed, or before it was accepted.
   * 'failed': a copy was addressed here and does not open. Never shown as text.
   */
  problem: null | 'no-key' | 'failed';
  /** Opened, but from a device this person has not accepted yet. */
  unverified: boolean;
  /** The message this one answers. Read from inside the sealed body. */
  replyTo: string | null;
  editedAt: string | null;
}

/** One person's one emoji on one message. Only reactions that opened are kept. */
export interface DmReactionView {
  id: string;
  targetId: string;
  authorId: string;
  emoji: string;
}

interface DmState {
  /** This device has keys and the server has the public halves. */
  ready: boolean;
  /** Why not, in words, when setting up failed. */
  setupError: string | null;
  /** The DM screens are showing, rather than a server. */
  active: boolean;
  openId: string | null;
  dms: Record<string, DmChannel>;
  messages: Record<string, DmView[]>;
  reactions: Record<string, DmReactionView[]>;
  loaded: Record<string, boolean>;
  /** Per conversation: every device of everyone in it, and what we make of each. */
  devices: Record<string, AssessedDevice[]>;
}

const initialState: DmState = {
  ready: false,
  setupError: null,
  active: false,
  openId: null,
  dms: {},
  messages: {},
  reactions: {},
  loaded: {},
  devices: {},
};

type Action =
  | { type: 'ready' }
  | { type: 'setup-failed'; message: string }
  | { type: 'dms'; dms: DmChannel[] }
  | { type: 'dm'; dm: DmChannel }
  | { type: 'show'; dmId: string | null }
  | { type: 'hide' }
  | { type: 'devices'; dmId: string; devices: AssessedDevice[] }
  | { type: 'messages'; dmId: string; views: DmView[]; replace: boolean }
  | { type: 'reactions'; dmId: string; reactions: DmReactionView[] }
  | { type: 'reaction-removed'; dmId: string; id: string }
  | { type: 'deleted'; dmId: string; id: string }
  | { type: 'touched'; dmId: string; messageId: string }
  | { type: 'read'; dmId: string; messageId: string };

function reducer(state: DmState, action: Action): DmState {
  switch (action.type) {
    case 'ready':
      return { ...state, ready: true, setupError: null };
    case 'setup-failed':
      return { ...state, ready: false, setupError: action.message };
    case 'dms':
      return { ...state, dms: Object.fromEntries(action.dms.map((dm) => [dm.id, dm])) };
    case 'dm':
      return { ...state, dms: { ...state.dms, [action.dm.id]: { ...state.dms[action.dm.id], ...action.dm } } };
    case 'show':
      return { ...state, active: true, openId: action.dmId ?? state.openId };
    case 'hide':
      return { ...state, active: false };
    case 'devices':
      return { ...state, devices: { ...state.devices, [action.dmId]: action.devices } };
    case 'messages': {
      const existing = action.replace ? [] : (state.messages[action.dmId] ?? []);
      const byId = new Map([...existing, ...action.views].map((view) => [view.id, view]));
      // Ids are UUIDv7, so a string sort is a time sort.
      const ordered = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
      return {
        ...state,
        messages: { ...state.messages, [action.dmId]: ordered },
        loaded: { ...state.loaded, [action.dmId]: true },
      };
    }
    case 'reactions': {
      const byId = new Map(
        [...(state.reactions[action.dmId] ?? []), ...action.reactions].map((reaction) => [reaction.id, reaction]),
      );
      return { ...state, reactions: { ...state.reactions, [action.dmId]: [...byId.values()] } };
    }
    case 'reaction-removed':
      return {
        ...state,
        reactions: {
          ...state.reactions,
          [action.dmId]: (state.reactions[action.dmId] ?? []).filter((reaction) => reaction.id !== action.id),
        },
      };
    case 'deleted': {
      const existing = state.messages[action.dmId];
      if (!existing) return state;
      return {
        ...state,
        reactions: {
          ...state.reactions,
          [action.dmId]: (state.reactions[action.dmId] ?? []).filter((reaction) => reaction.targetId !== action.id),
        },
        messages: {
          ...state.messages,
          [action.dmId]: existing.map((view) =>
            view.id === action.id ? { ...view, deleted: true, text: null, problem: null, editedAt: null } : view,
          ),
        },
      };
    }
    case 'touched': {
      const dm = state.dms[action.dmId];
      if (!dm || (dm.lastMessageId && dm.lastMessageId >= action.messageId)) return state;
      return { ...state, dms: { ...state.dms, [action.dmId]: { ...dm, lastMessageId: action.messageId } } };
    }
    case 'read': {
      const dm = state.dms[action.dmId];
      if (!dm || (dm.lastReadMessageId && dm.lastReadMessageId >= action.messageId)) return state;
      return { ...state, dms: { ...state.dms, [action.dmId]: { ...dm, lastReadMessageId: action.messageId } } };
    }
    default:
      return state;
  }
}

interface DmValue {
  state: DmState;
  /** Show the DM screens, on the conversation last open. */
  showDms: () => void;
  /** Back to servers. */
  hideDms: () => void;
  openDm: (dmId: string) => void;
  /** Open the conversation with a person, making it if need be. */
  openWith: (userId: string) => Promise<void>;
  send: (dmId: string, text: string, replyTo?: string | null) => Promise<void>;
  /** Seal the message again with new text. What it replied to stays. */
  edit: (dmId: string, messageId: string, text: string) => Promise<void>;
  /** Add this emoji, or take it back if it is already yours. */
  react: (dmId: string, messageId: string, emoji: string) => Promise<void>;
  remove: (dmId: string, messageId: string) => Promise<void>;
  loadOlder: (dmId: string) => Promise<void>;
  markRead: (dmId: string) => void;
  /** Only ever called because somebody read a warning and clicked. */
  acceptDevice: (dmId: string, device: AssessedDevice) => Promise<void>;
}

const DmContext = createContext<DmValue | null>(null);

/**
 * One device per browser, made once. React's development mode runs effects
 * twice, and two set-ups racing each other made two identities, published both,
 * and left IndexedDB holding half of each. The promise is shared so the second
 * caller waits for the first instead of starting again.
 */
const devices = new Map<string, Promise<DmDevice>>();

function deviceFor(userId: string, pins: IndexedDbIdentityStore): Promise<DmDevice> {
  const existing = devices.get(userId);
  if (existing) return existing;

  const made = (async () => {
    const identity = await loadDeviceIdentity(createDeviceIdentity);
    const dm = await loadDmKeypair(createDmKeypair, describeDmKeypair);
    const mine: DmDevice = { userId, identity, dm };
    // This device believes itself whatever else it has seen. Without this, a
    // laptop that once pinned its owner's phone in a call would treat its own
    // key as the unfamiliar one.
    await pins.set(userId, identity.deviceId, identity.fingerprint);

    const { userId: _self, ...published } = await describeDevice(mine);
    void _self;
    await api.dms.publishDevice(published);
    return mine;
  })();
  // A failure should be retried on the next sign-in, not remembered.
  made.catch(() => devices.delete(userId));
  devices.set(userId, made);
  return made;
}

export function DmProvider({ children }: { children: ReactNode }) {
  const { state: app, onGatewayEvent } = useStore();
  const [state, dispatch] = useReducer(reducer, initialState);
  const selfId = app.user?.id ?? null;

  const device = useRef<DmDevice | null>(null);
  const pins = useRef(new IndexedDbIdentityStore());
  /** Sealed copies, kept so that accepting a device can re-open what it sent. */
  const sealed = useRef<Record<string, Map<string, DmMessage>>>({});
  const assessed = useRef<Record<string, AssessedDevice[]>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------------------------------- setup --------------------------------- */

  useEffect(() => {
    if (!selfId) return;
    let cancelled = false;

    void (async () => {
      try {
        const mine = await deviceFor(selfId, pins.current);
        const { dms } = await api.dms.list();
        if (cancelled) return;

        device.current = mine;
        dispatch({ type: 'dms', dms });
        dispatch({ type: 'ready' });
      } catch (problem) {
        if (cancelled) return;
        dispatch({
          type: 'setup-failed',
          message:
            problem instanceof ApiError
              ? problem.message
              : 'This browser would not store the keys direct messages need. Private windows often refuse.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selfId]);

  /* ------------------------------ keys and text ----------------------------- */

  const refreshDevices = useCallback(async (dmId: string): Promise<AssessedDevice[]> => {
    const { devices } = await api.dms.devices(dmId);
    const byUser = new Map<string, DeviceKey[]>();
    for (const entry of devices) byUser.set(entry.userId, [...(byUser.get(entry.userId) ?? []), entry]);

    const result: AssessedDevice[] = [];
    for (const [userId, list] of byUser) result.push(...(await assessDevices(pins.current, userId, list)));

    assessed.current[dmId] = result;
    dispatch({ type: 'devices', dmId, devices: result });
    return result;
  }, []);

  const toView = useCallback(async (message: DmMessage, known: AssessedDevice[]): Promise<DmView> => {
    const base = {
      id: message.id,
      dmId: message.dmId,
      authorId: message.authorId,
      createdAt: message.createdAt,
      deleted: message.deleted,
      replyTo: null,
      editedAt: message.deleted ? null : message.editedAt,
    };
    const self = device.current;
    if (message.deleted || !message.iv || !message.ciphertext || !self) {
      return { ...base, text: null, problem: message.deleted ? null : 'failed', unverified: false };
    }

    const sender = known.find(
      (entry) => entry.device.userId === message.authorId && entry.device.deviceId === message.senderDeviceId,
    );
    if (!sender || sender.verdict === 'invalid') return { ...base, text: null, problem: 'failed', unverified: false };

    const opened = await openMessage({
      dmId: message.dmId,
      self,
      authorId: message.authorId,
      senderDevice: sender.device,
      iv: message.iv,
      ciphertext: message.ciphertext,
      keys: message.keys,
    });
    if (!opened.ok) return { ...base, text: null, problem: opened.reason, unverified: false };
    // A reaction handed over as if it were a message is not one.
    if (opened.body.kind === 'reaction') return { ...base, text: null, problem: 'failed', unverified: false };
    return {
      ...base,
      text: opened.body.text,
      replyTo: opened.body.replyTo ?? null,
      problem: null,
      unverified: !isTrusted(sender.verdict),
    };
  }, []);

  /**
   * A reaction that does not open is dropped rather than drawn: there is
   * nothing to show for it. The sealed body names its own target, and that has
   * to agree with the row the server filed it under, or a server could move
   * somebody's thumbs-up onto a different message.
   */
  const toReaction = useCallback(async (message: DmMessage, known: AssessedDevice[]): Promise<DmReactionView | null> => {
    const self = device.current;
    if (!self || !message.reactionTo || !message.iv || !message.ciphertext) return null;
    const sender = known.find(
      (entry) => entry.device.userId === message.authorId && entry.device.deviceId === message.senderDeviceId,
    );
    if (!sender || sender.verdict === 'invalid') return null;
    const opened = await openMessage({
      dmId: message.dmId,
      self,
      authorId: message.authorId,
      senderDevice: sender.device,
      iv: message.iv,
      ciphertext: message.ciphertext,
      keys: message.keys,
    });
    if (!opened.ok || opened.body.kind !== 'reaction' || opened.body.target !== message.reactionTo) return null;
    return { id: message.id, targetId: message.reactionTo, authorId: message.authorId, emoji: opened.body.emoji };
  }, []);

  const toReactions = useCallback(
    async (messages: DmMessage[], known: AssessedDevice[]): Promise<DmReactionView[]> =>
      (await Promise.all(messages.map((message) => toReaction(message, known)))).filter(
        (reaction): reaction is DmReactionView => reaction !== null,
      ),
    [toReaction],
  );

  const remember = (messages: DmMessage[]): void => {
    for (const message of messages) {
      const map = (sealed.current[message.dmId] ??= new Map());
      map.set(message.id, message);
    }
  };

  const loadDm = useCallback(
    async (dmId: string) => {
      const known = await refreshDevices(dmId);
      const { messages, reactions } = await api.dms.messages(dmId);
      remember(messages);
      const views = await Promise.all(messages.map((message) => toView(message, known)));
      dispatch({ type: 'messages', dmId, views, replace: true });
      dispatch({ type: 'reactions', dmId, reactions: await toReactions(reactions, known) });
    },
    [refreshDevices, toView, toReactions],
  );

  /* --------------------------------- gateway -------------------------------- */

  useEffect(() => {
    const handle = async (event: ServerEvent): Promise<void> => {
      if (event.t === 'ready' && device.current) {
        // A reconnect may have missed anything. Ask again rather than guess.
        const { dms } = await api.dms.list();
        dispatch({ type: 'dms', dms });
        const open = stateRef.current.openId;
        if (open && stateRef.current.loaded[open]) await loadDm(open);
      }

      if (event.t === 'dm_create') dispatch({ type: 'dm', dm: event.d });

      if (event.t === 'dm_read') dispatch({ type: 'read', dmId: event.d.dmId, messageId: event.d.lastReadMessageId });

      if (event.t === 'dm_message_delete') {
        if (event.d.reactionTo) {
          dispatch({ type: 'reaction-removed', dmId: event.d.dmId, id: event.d.id });
        } else {
          sealed.current[event.d.dmId]?.delete(event.d.id);
          dispatch({ type: 'deleted', dmId: event.d.dmId, id: event.d.id });
        }
      }

      const knownFor = async (message: DmMessage): Promise<AssessedDevice[]> => {
        const known = assessed.current[message.dmId] ?? [];
        const senderKnown = known.some(
          (entry) => entry.device.userId === message.authorId && entry.device.deviceId === message.senderDeviceId,
        );
        return senderKnown ? known : refreshDevices(message.dmId);
      };

      if (event.t === 'dm_message_update') {
        const message = event.d;
        if (!stateRef.current.loaded[message.dmId]) return;
        remember([message]);
        const view = await toView(message, await knownFor(message));
        dispatch({ type: 'messages', dmId: message.dmId, views: [view], replace: false });
      }

      // A reaction makes no sound and no unread mark.
      if (event.t === 'dm_message_create' && event.d.reactionTo) {
        const message = event.d;
        if (!stateRef.current.loaded[message.dmId]) return;
        const reactions = await toReactions([message], await knownFor(message));
        dispatch({ type: 'reactions', dmId: message.dmId, reactions });
        return;
      }

      if (event.t === 'dm_message_create') {
        const message = event.d;
        if (!stateRef.current.dms[message.dmId]) {
          const { dms } = await api.dms.list();
          dispatch({ type: 'dms', dms });
        }
        dispatch({ type: 'touched', dmId: message.dmId, messageId: message.id });
        if (message.authorId === selfId) dispatch({ type: 'read', dmId: message.dmId, messageId: message.id });

        const looking = stateRef.current.active && stateRef.current.openId === message.dmId;
        const sound = soundFor({
          authorId: message.authorId,
          // A DM is addressed to you by definition.
          mentions: selfId ? [selfId] : [],
          mentionsEveryone: false,
          selfId,
          channelId: message.dmId,
          openChannelId: looking ? message.dmId : null,
          windowFocused: document.hasFocus(),
          prefs: notifyPrefs.get(),
        });
        if (sound) play(sound);

        // Only conversations that have been opened hold text. The rest decrypt
        // when somebody looks.
        if (!stateRef.current.loaded[message.dmId]) return;
        remember([message]);
        const view = await toView(message, await knownFor(message));
        dispatch({ type: 'messages', dmId: message.dmId, views: [view], replace: false });
      }
    };

    return onGatewayEvent((event) => {
      void handle(event).catch(() => undefined);
    });
  }, [onGatewayEvent, selfId, loadDm, refreshDevices, toView, toReactions]);

  /* --------------------------------- intents -------------------------------- */

  const showDms = useCallback(() => dispatch({ type: 'show', dmId: null }), []);
  const hideDms = useCallback(() => dispatch({ type: 'hide' }), []);

  const openDm = useCallback(
    (dmId: string) => {
      dispatch({ type: 'show', dmId });
      if (!stateRef.current.loaded[dmId]) void loadDm(dmId).catch(() => undefined);
    },
    [loadDm],
  );

  const openWith = useCallback(
    async (userId: string) => {
      const { dm } = await api.dms.open(userId);
      dispatch({ type: 'dm', dm });
      openDm(dm.id);
    },
    [openDm],
  );

  /** Lock a body for every accepted device in the conversation. */
  const seal = useCallback(
    async (dmId: string, body: DmBody) => {
      const self = device.current;
      if (!self) throw new Error('This device has no keys yet.');

      // Ask again every time. A phone somebody signed in on a minute ago
      // should be noticed now, not after a reload.
      const known = await refreshDevices(dmId);
      const recipients = known.filter((entry) => isTrusted(entry.verdict)).map((entry) => entry.device);
      const dm = stateRef.current.dms[dmId];
      const others = dm?.members.filter((member) => member.id !== self.userId) ?? [];
      for (const other of others) {
        if (!recipients.some((entry) => entry.userId === other.id)) {
          throw new Error(
            `${other.displayName} has no device you have accepted, so there is nothing to lock this message to. If a warning is showing above, that is why.`,
          );
        }
      }
      return { known, message: await sealMessage({ dmId, sender: self, body, recipients }) };
    },
    [refreshDevices],
  );

  const send = useCallback(
    async (dmId: string, text: string, replyTo?: string | null) => {
      const { known, message } = await seal(dmId, replyTo ? { v: 1, text, replyTo } : { v: 1, text });
      const { message: created } = await api.dms.send(dmId, message);
      remember([created]);
      dispatch({ type: 'touched', dmId, messageId: created.id });
      dispatch({ type: 'read', dmId, messageId: created.id });
      dispatch({ type: 'messages', dmId, views: [await toView(created, known)], replace: false });
    },
    [seal, toView],
  );

  const edit = useCallback(
    async (dmId: string, messageId: string, text: string) => {
      const current = stateRef.current.messages[dmId]?.find((view) => view.id === messageId);
      if (!current || current.text === null) return;
      const { known, message } = await seal(
        dmId,
        current.replyTo ? { v: 1, text, replyTo: current.replyTo } : { v: 1, text },
      );
      const { message: updated } = await api.dms.edit(dmId, messageId, message);
      remember([updated]);
      dispatch({ type: 'messages', dmId, views: [await toView(updated, known)], replace: false });
    },
    [seal, toView],
  );

  const react = useCallback(
    async (dmId: string, messageId: string, emoji: string) => {
      const mine = (stateRef.current.reactions[dmId] ?? []).find(
        (reaction) => reaction.targetId === messageId && reaction.authorId === selfId && reaction.emoji === emoji,
      );
      if (mine) {
        await api.dms.remove(dmId, mine.id);
        return;
      }
      const { known, message } = await seal(dmId, { v: 1, kind: 'reaction', target: messageId, emoji });
      const { message: created } = await api.dms.send(dmId, { ...message, reactionTo: messageId });
      dispatch({ type: 'reactions', dmId, reactions: await toReactions([created], known) });
    },
    [seal, selfId, toReactions],
  );

  const remove = useCallback(async (dmId: string, messageId: string) => {
    await api.dms.remove(dmId, messageId);
  }, []);

  const loadOlder = useCallback(
    async (dmId: string) => {
      const oldest = stateRef.current.messages[dmId]?.[0];
      if (!oldest) return;
      const { messages, reactions } = await api.dms.messages(dmId, oldest.id);
      remember(messages);
      const known = assessed.current[dmId] ?? (await refreshDevices(dmId));
      const views = await Promise.all(messages.map((message) => toView(message, known)));
      dispatch({ type: 'messages', dmId, views, replace: false });
      dispatch({ type: 'reactions', dmId, reactions: await toReactions(reactions, known) });
    },
    [refreshDevices, toView, toReactions],
  );

  const markRead = useCallback((dmId: string) => {
    const dm = stateRef.current.dms[dmId];
    const newest = dm?.lastMessageId;
    if (!dm || !newest) return;
    if (dm.lastReadMessageId && dm.lastReadMessageId >= newest) return;
    dispatch({ type: 'read', dmId, messageId: newest });
    void api.dms.markRead(dmId, newest).catch(() => undefined);
  }, []);

  const acceptDevice = useCallback(
    async (dmId: string, entry: AssessedDevice) => {
      if (entry.verdict === 'invalid') return;
      await acceptIdentityChange(pins.current, entry.device.userId, entry.device.deviceId, entry.fingerprint);
      const known = await refreshDevices(dmId);
      // What that device already sent was opened and marked unverified. Open it
      // again so the mark goes.
      const messages = [...(sealed.current[dmId]?.values() ?? [])];
      const views = await Promise.all(messages.map((message) => toView(message, known)));
      dispatch({ type: 'messages', dmId, views, replace: false });
    },
    [refreshDevices, toView],
  );

  const value = useMemo<DmValue>(
    () => ({ state, showDms, hideDms, openDm, openWith, send, edit, react, remove, loadOlder, markRead, acceptDevice }),
    [state, showDms, hideDms, openDm, openWith, send, edit, react, remove, loadOlder, markRead, acceptDevice],
  );

  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}

export function useDms(): DmValue {
  const value = useContext(DmContext);
  if (!value) throw new Error('useDms must be used inside a DmProvider.');
  return value;
}

/* -------------------------------- selectors -------------------------------- */

export const dmUnread = (dm: DmChannel): boolean =>
  Boolean(dm.lastMessageId && (!dm.lastReadMessageId || dm.lastMessageId > dm.lastReadMessageId));

export function unreadDmCount(state: DmState): number {
  return Object.values(state.dms).filter(dmUnread).length;
}

/** The person on the other end. In a one-to-one that is whoever is not you. */
export function otherMember(dm: DmChannel, selfId: string | null): PublicUser | null {
  return dm.members.find((member) => member.id !== selfId) ?? dm.members[0] ?? null;
}

/** Newest conversation first; one nobody has written in yet sorts by when it was made. */
export function sortedDms(state: DmState): DmChannel[] {
  const stamp = (dm: DmChannel): string => dm.lastMessageId ?? dm.id;
  return Object.values(state.dms).sort((a, b) => stamp(b).localeCompare(stamp(a)));
}
