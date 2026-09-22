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

import { houseRules } from '@scryproof/shared';
import type { DeviceKey, DmChannel, DmMessage, PublicUser, ServerEvent } from '@scryproof/shared';

import { api, ApiError } from '../lib/api';
import {
  type AssessedDevice,
  type DmBody,
  type DmDevice,
  type DmFileRef,
  type DmOpener,
  type OpenResult,
  assessDevices,
  createDmKeypair,
  describeDevice,
  describeDmKeypair,
  endorse,
  isTrusted,
  openMessage,
  rewrapKey,
  sealMessage,
} from '../lib/dm-crypto';
import { isRecoveryDevice, recoveryDevice } from '../lib/dm-recovery';
import { noticeFor, notices } from '../lib/notices';
import { notifyPrefs, play, soundFor } from '../lib/notify';
import { spawnOf } from '../lib/commands';
import { play as playCharacter } from '../lib/stage';
import { acceptIdentityChange, createDeviceIdentity } from '../lib/voice-crypto';
import {
  IndexedDbIdentityStore,
  loadDeviceIdentity,
  loadDmKeypair,
  loadRecoveryKey,
  saveRecoveryKey,
} from '../lib/voice-identity';
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
  files: DmFileRef[];
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
  /**
   * Whether this person has a recovery phrase, and whether its words have been
   * typed into this device. Null until the server has been asked.
   */
  recovery: { exists: boolean; held: boolean } | null;
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
  recovery: null,
};

type Action =
  | { type: 'ready' }
  | { type: 'recovery'; exists: boolean; held: boolean }
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
    case 'recovery':
      return { ...state, recovery: { exists: action.exists, held: action.held } };
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
            view.id === action.id
              ? { ...view, deleted: true, text: null, problem: null, editedAt: null, files: [] }
              : view,
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
  /** Open the conversation with a person, making it if need be. Answers its id. */
  openWith: (userId: string) => Promise<string>;
  send: (dmId: string, text: string, replyTo?: string | null, files?: DmFileRef[]) => Promise<void>;
  /** Seal the message again with new text. What it replied to stays. */
  edit: (dmId: string, messageId: string, text: string) => Promise<void>;
  /** Add this emoji, or take it back if it is already yours. */
  react: (dmId: string, messageId: string, emoji: string) => Promise<void>;
  remove: (dmId: string, messageId: string) => Promise<void>;
  loadOlder: (dmId: string) => Promise<void>;
  markRead: (dmId: string) => void;
  /** Only ever called because somebody read a warning and clicked. */
  acceptDevice: (dmId: string, device: AssessedDevice) => Promise<void>;
  /**
   * Publish the device these words stand for, and pass every key this device
   * can open on to it. Replaces any phrase made before. `onProgress` is told
   * how many conversations are done, because a long history takes a while.
   */
  createRecovery: (phrase: string, onProgress?: (done: number, total: number) => void) => Promise<void>;
  /** On a new device: rebuild the phrase's key from its words and open what was locked to it. */
  restoreRecovery: (phrase: string) => Promise<void>;
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
  const blocks = app.blocks;

  const device = useRef<DmDevice | null>(null);
  /** The phrase's key, on a device its words have been typed into. */
  const recovery = useRef<DmOpener | null>(null);
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
        const { devices: own } = await api.dms.myDevices();
        const stored = await loadRecoveryKey(selfId).catch(() => null);
        if (cancelled) return;

        device.current = mine;
        // A key for a phrase that has since been replaced opens nothing new, and says so by not counting.
        const published = own.find((entry) => isRecoveryDevice(entry.deviceId));
        const held = Boolean(stored && published && stored.deviceId === published.deviceId);
        recovery.current =
          held && stored ? { userId: selfId, identity: { deviceId: stored.deviceId }, dm: { privateKey: stored.privateKey } } : null;
        dispatch({ type: 'recovery', exists: Boolean(published), held });
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

  /**
   * Open with this device's own copy, and failing that with the phrase's, if
   * its words have been typed in here. A copy for the phrase may have been
   * passed on by one of this person's other devices, which only counts if that
   * device is one this device believes.
   */
  const open = useCallback(
    async (message: DmMessage & { iv: string; ciphertext: string }, sender: AssessedDevice, known: AssessedDevice[]): Promise<OpenResult> => {
      const self = device.current;
      if (!self) return { ok: false, reason: 'failed' };
      const sealedMessage = {
        dmId: message.dmId,
        authorId: message.authorId,
        senderDevice: sender.device,
        iv: message.iv,
        ciphertext: message.ciphertext,
        keys: message.keys,
      };
      const direct = await openMessage({ ...sealedMessage, self });
      if (direct.ok || direct.reason !== 'no-key' || !recovery.current) return direct;
      const ownDevices = known
        .filter((entry) => entry.device.userId === self.userId && isTrusted(entry.verdict))
        .map((entry) => entry.device);
      return openMessage({ ...sealedMessage, self: recovery.current, ownDevices });
    },
    [],
  );

  const toView = useCallback(async (message: DmMessage, known: AssessedDevice[]): Promise<DmView> => {
    const base = {
      id: message.id,
      dmId: message.dmId,
      authorId: message.authorId,
      createdAt: message.createdAt,
      deleted: message.deleted,
      replyTo: null,
      files: [],
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

    const opened = await open({ ...message, iv: message.iv, ciphertext: message.ciphertext }, sender, known);
    if (!opened.ok) return { ...base, text: null, problem: opened.reason, unverified: false };
    // A reaction handed over as if it were a message is not one.
    if (opened.body.kind === 'reaction') return { ...base, text: null, problem: 'failed', unverified: false };
    return {
      ...base,
      text: opened.body.text,
      replyTo: opened.body.replyTo ?? null,
      files: opened.body.files ?? [],
      problem: null,
      unverified: !isTrusted(sender.verdict),
    };
  }, [open]);

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
    const opened = await open({ ...message, iv: message.iv, ciphertext: message.ciphertext }, sender, known);
    if (!opened.ok || opened.body.kind !== 'reaction' || opened.body.target !== message.reactionTo) return null;
    return { id: message.id, targetId: message.reactionTo, authorId: message.authorId, emoji: opened.body.emoji };
  }, [open]);

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

  /**
   * Give the recovery phrase a copy of any key it is missing and this device
   * has. Messages from before the phrase existed were never locked to it, and
   * neither is anything from a friend whose app had not yet heard of it. Runs
   * whenever messages are fetched, so the gaps close by themselves.
   */
  const passOn = useCallback(async (dmId: string, messages: DmMessage[], known: AssessedDevice[]): Promise<void> => {
    const self = device.current;
    if (!self) return;
    const target = known.find(
      (entry) => entry.device.userId === self.userId && isRecoveryDevice(entry.device.deviceId) && isTrusted(entry.verdict),
    )?.device;
    if (!target) return;

    const keys: { messageId: string; iv: string; key: string }[] = [];
    for (const message of messages) {
      if (message.deleted || !message.iv || message.keys.some((key) => key.deviceId === target.deviceId)) continue;
      const sender = known.find(
        (entry) => entry.device.userId === message.authorId && entry.device.deviceId === message.senderDeviceId,
      );
      if (!sender || sender.verdict === 'invalid') continue;
      const copy = await rewrapKey({
        dmId,
        self,
        authorId: message.authorId,
        senderDevice: sender.device,
        iv: message.iv,
        keys: message.keys,
        target,
      });
      if (copy) keys.push({ messageId: message.id, ...copy });
    }
    for (let at = 0; at < keys.length; at += 200) {
      await api.dms.addKeys(dmId, { wrappedBy: self.identity.deviceId, deviceId: target.deviceId, keys: keys.slice(at, at + 200) });
    }
  }, []);

  const loadDm = useCallback(
    async (dmId: string) => {
      const known = await refreshDevices(dmId);
      const { messages, reactions } = await api.dms.messages(dmId);
      void passOn(dmId, [...messages, ...reactions], known).catch(() => undefined);
      remember(messages);
      const views = await Promise.all(messages.map((message) => toView(message, known)));
      dispatch({ type: 'messages', dmId, views, replace: true });
      dispatch({ type: 'reactions', dmId, reactions: await toReactions(reactions, known) });
    },
    [refreshDevices, toView, toReactions, passOn],
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
        // A block stops new messages at the server, so this is about the ones
        // that were already sent when it happened.
        const blocked = blocks.has(message.authorId);
        const sound = soundFor({
          authorId: message.authorId,
          // A DM is addressed to you by definition.
          mentions: selfId ? [selfId] : [],
          mentionsEveryone: false,
          selfId,
          channelId: message.dmId,
          // Mute is a server/channel idea. There is no server-wide mute that
          // reaches a direct message, and a DM has nothing to mute it by.
          serverId: null,
          openChannelId: looking ? message.dmId : null,
          windowFocused: document.hasFocus(),
          blocked,
          prefs: notifyPrefs.get(),
        });
        if (sound) play(sound);

        const focused = document.hasFocus();
        const verdict = noticeFor({
          authorId: message.authorId,
          selfId,
          addressedToMe: true,
          watching: focused && looking,
          windowFocused: focused,
          muted: false,
          blocked,
        });
        if (verdict.list) {
          const author = stateRef.current.dms[message.dmId]?.members.find((member) => member.id === message.authorId);
          // Who and when. Never what: see the note at the top of notices.ts.
          notices.arrived(
            {
              id: message.id,
              at: Date.now(),
              kind: 'dm',
              authorId: message.authorId,
              authorName: author?.displayName ?? 'Someone',
              serverId: null,
              serverName: null,
              channelId: null,
              channelName: null,
              dmId: message.dmId,
              preview: null,
              read: false,
            },
            verdict.popup,
          );
        }

        // Only conversations that have been opened hold text. The rest decrypt
        // when somebody looks.
        if (!stateRef.current.loaded[message.dmId]) return;
        remember([message]);
        const view = await toView(message, await knownFor(message));
        dispatch({ type: 'messages', dmId: message.dmId, views: [view], replace: false });
        // A character sent into the conversation you are looking at crosses the room.
        const spawn = spawnOf(view.text);
        if (spawn && stateRef.current.active && stateRef.current.openId === message.dmId) playCharacter(spawn.id);
      }
    };

    return onGatewayEvent((event) => {
      void handle(event).catch(() => undefined);
    });
  }, [onGatewayEvent, selfId, blocks, loadDm, refreshDevices, toView, toReactions]);

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
      return dm.id;
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
        if (!known.some((entry) => entry.device.userId === other.id)) {
          // Their browser makes its key the first time it loads a build that has DMs.
          throw new Error(
            `${other.displayName} has not opened Scryproof since DMs were added, so there is no key to lock this to yet. It will work once they have signed in.`,
          );
        }
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
    async (dmId: string, text: string, replyTo?: string | null, files?: DmFileRef[]) => {
      const body: DmBody = { v: 1, text: houseRules(text) };
      if (replyTo) body.replyTo = replyTo;
      if (files && files.length > 0) body.files = files;
      const { known, message } = await seal(dmId, body);
      const { message: created } = await api.dms.send(dmId, { ...message, fileIds: files?.map((file) => file.id) });
      remember([created]);
      dispatch({ type: 'touched', dmId, messageId: created.id });
      dispatch({ type: 'read', dmId, messageId: created.id });
      dispatch({ type: 'messages', dmId, views: [await toView(created, known)], replace: false });
      const spawn = spawnOf(text);
      if (spawn) playCharacter(spawn.id);
    },
    [seal, toView],
  );

  const edit = useCallback(
    async (dmId: string, messageId: string, text: string) => {
      const current = stateRef.current.messages[dmId]?.find((view) => view.id === messageId);
      if (!current || current.text === null) return;
      // Everything but the words is carried over: what it answered, what it came with.
      const body: DmBody = { v: 1, text: houseRules(text) };
      if (current.replyTo) body.replyTo = current.replyTo;
      if (current.files.length > 0) body.files = current.files;
      const { known, message } = await seal(dmId, body);
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
      void passOn(dmId, [...messages, ...reactions], known).catch(() => undefined);
      const views = await Promise.all(messages.map((message) => toView(message, known)));
      dispatch({ type: 'messages', dmId, views, replace: false });
      dispatch({ type: 'reactions', dmId, reactions: await toReactions(reactions, known) });
    },
    [refreshDevices, toView, toReactions, passOn],
  );

  const markRead = useCallback((dmId: string) => {
    const dm = stateRef.current.dms[dmId];
    const newest = dm?.lastMessageId;
    if (!dm || !newest) return;
    if (dm.lastReadMessageId && dm.lastReadMessageId >= newest) return;
    dispatch({ type: 'read', dmId, messageId: newest });
    notices.readWhere({ dmId });
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

  /** Publish this device again, vouched for by the phrase. The keys do not change; the server only adds the vouching. */
  const vouchForThisDevice = useCallback(async (self: DmDevice, phrase: DmDevice) => {
    const { userId: _self, ...published } = await describeDevice(self);
    void _self;
    await api.dms.publishDevice({ ...published, endorsedBy: await endorse(self.userId, phrase.identity, published) });
  }, []);

  const createRecovery = useCallback(
    async (words: string, onProgress?: (done: number, total: number) => void) => {
      const self = device.current;
      if (!self) throw new Error('This device has no keys yet.');
      const phrase = await recoveryDevice(self.userId, words);

      // Each vouches for the other. Friends who believe this device then believe
      // the phrase, and a device that believes the phrase then believes this one.
      const { userId: _self, ...published } = await describeDevice(phrase);
      void _self;
      // Believed here before anyone is told of it, so this device never warns its owner about their own phrase.
      await pins.current.set(self.userId, phrase.identity.deviceId, phrase.identity.fingerprint);
      await api.dms.publishDevice({ ...published, endorsedBy: await endorse(self.userId, self.identity, published) });
      await vouchForThisDevice(self, phrase);
      // This device made the phrase and needs nothing from it, so nothing of it is kept here.
      recovery.current = null;
      dispatch({ type: 'recovery', exists: true, held: false });

      // Everything already written, in every conversation, newest page first.
      const all = Object.keys(stateRef.current.dms);
      let done = 0;
      onProgress?.(done, all.length);
      for (const dmId of all) {
        const known = await refreshDevices(dmId);
        let before: string | undefined;
        for (;;) {
          const { messages, reactions } = await api.dms.messages(dmId, before);
          await passOn(dmId, [...messages, ...reactions], known);
          // Ids sort by time. Whatever order the page came in, the smallest is the oldest.
          const oldest = messages.map((message) => message.id).sort()[0];
          if (!oldest || oldest === before) break;
          before = oldest;
        }
        done += 1;
        onProgress?.(done, all.length);
      }
    },
    [refreshDevices, passOn, vouchForThisDevice],
  );

  const restoreRecovery = useCallback(
    async (words: string) => {
      const self = device.current;
      if (!self) throw new Error('This device has no keys yet.');
      const phrase = await recoveryDevice(self.userId, words);
      const { devices: own } = await api.dms.myDevices();
      if (!own.some((entry) => entry.deviceId === phrase.identity.deviceId)) {
        throw new Error(
          own.some((entry) => isRecoveryDevice(entry.deviceId))
            ? 'Those are real words, but not the phrase this account is using. If you made a newer phrase, it is that one.'
            : 'This account has no recovery phrase yet.',
        );
      }

      await saveRecoveryKey(self.userId, { deviceId: phrase.identity.deviceId, privateKey: phrase.dm.privateKey });
      await pins.current.set(self.userId, phrase.identity.deviceId, phrase.identity.fingerprint);
      await vouchForThisDevice(self, phrase);
      recovery.current = { userId: self.userId, identity: { deviceId: phrase.identity.deviceId }, dm: { privateKey: phrase.dm.privateKey } };
      dispatch({ type: 'recovery', exists: true, held: true });

      // What is on screen was drawn as locked. Draw it again.
      for (const dmId of Object.keys(stateRef.current.loaded)) await loadDm(dmId).catch(() => undefined);
    },
    [loadDm, vouchForThisDevice],
  );

  const value = useMemo<DmValue>(
    () => ({
      state, showDms, hideDms, openDm, openWith, send, edit, react, remove, loadOlder, markRead, acceptDevice,
      createRecovery, restoreRecovery,
    }),
    [
      state, showDms, hideDms, openDm, openWith, send, edit, react, remove, loadOlder, markRead, acceptDevice,
      createRecovery, restoreRecovery,
    ],
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
