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
  believedDevice,
  createDmKeypair,
  describeDevice,
  describeDmKeypair,
  endorse,
  isTrusted,
  openMessage,
  recipientsFor,
  replayedIds,
  rewrapKey,
  sealMessage,
} from '../lib/dm-crypto';
import { isRecoveryDevice, recoveryDevice } from '../lib/dm-recovery';
import { nameFor } from '../lib/local-names';
import { noticeFor, notices } from '../lib/notices';
import { notifyPrefs, play, soundFor } from '../lib/notify';
import { spawnOf } from '../lib/commands';
import { play as playCharacter } from '../lib/stage';
import { acceptIdentityChange, createDeviceIdentity } from '../lib/voice-crypto';
import {
  IndexedDbIdentityStore,
  letInEverywhere,
  loadDeviceIdentity,
  loadDmKeypair,
  loadRecoveryKey,
  saveRecoveryKey,
} from '../lib/voice-identity';
import { deviceFor, setRecoveryOpener } from '../lib/this-device';
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
  /**
   * A group message sealed before copies of its key were bound to its exact
   * bytes (2026-09-23): it opened, but anyone else in the group could have
   * written it in the sender's name.
   */
  unproven?: boolean;
  /** The message this one answers. Read from inside the sealed body. */
  replyTo: string | null;
  /**
   * When the sender's own clock said they wrote it, from inside the seal.
   * Null on messages sealed before that time was carried, which is a fact
   * about the message and not a problem with it.
   */
  sealedAt: number | null;
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
   * Per conversation: messages not drawn because a message before them carried
   * the same sealed bytes. A server can hand an old message a new id and time;
   * it cannot make the bytes different, so the repeat is what catches it.
   */
  replayed: Record<string, string[]>;
  /**
   * This device, for the safety-number screen: the number shown for "you" is
   * this device's identity, so it is known without asking the server anything.
   */
  me: { userId: string; deviceId: string; fingerprint: string } | null;
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
  replayed: {},
  me: null,
  recovery: null,
};

type Action =
  | { type: 'ready' }
  | { type: 'recovery'; exists: boolean; held: boolean }
  | { type: 'setup-failed'; message: string }
  | { type: 'me'; userId: string; deviceId: string; fingerprint: string }
  | { type: 'dms'; dms: DmChannel[] }
  | { type: 'dm'; dm: DmChannel }
  | { type: 'left'; dmId: string }
  | { type: 'show'; dmId: string | null }
  | { type: 'hide' }
  | { type: 'devices'; dmId: string; devices: AssessedDevice[] }
  | { type: 'replayed'; dmId: string; ids: string[] }
  | { type: 'messages'; dmId: string; views: DmView[]; replace: boolean }
  | { type: 'reactions'; dmId: string; reactions: DmReactionView[] }
  | { type: 'reaction-removed'; dmId: string; id: string }
  | { type: 'deleted'; dmId: string; id: string }
  | { type: 'touched'; dmId: string; messageId: string; fromOther: boolean }
  | { type: 'read'; dmId: string; messageId: string };

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const out = { ...record };
  delete out[key];
  return out;
}

function reducer(state: DmState, action: Action): DmState {
  switch (action.type) {
    case 'ready':
      return { ...state, ready: true, setupError: null };
    case 'recovery':
      return { ...state, recovery: { exists: action.exists, held: action.held } };
    case 'setup-failed':
      return { ...state, ready: false, setupError: action.message };
    case 'me':
      return {
        ...state,
        me: { userId: action.userId, deviceId: action.deviceId, fingerprint: action.fingerprint },
      };
    case 'dms':
      return { ...state, dms: Object.fromEntries(action.dms.map((dm) => [dm.id, dm])) };
    case 'dm':
      return { ...state, dms: { ...state.dms, [action.dm.id]: { ...state.dms[action.dm.id], ...action.dm } } };
    case 'left': {
      // What was opened stays nowhere: the conversation is not this person's any more.
      return {
        ...state,
        dms: without(state.dms, action.dmId),
        messages: without(state.messages, action.dmId),
        reactions: without(state.reactions, action.dmId),
        loaded: without(state.loaded, action.dmId),
        devices: without(state.devices, action.dmId),
        replayed: without(state.replayed, action.dmId),
        openId: state.openId === action.dmId ? null : state.openId,
      };
    }
    case 'show':
      return { ...state, active: true, openId: action.dmId ?? state.openId };
    case 'hide':
      return { ...state, active: false };
    case 'devices':
      return { ...state, devices: { ...state.devices, [action.dmId]: action.devices } };
    case 'replayed':
      return { ...state, replayed: { ...state.replayed, [action.dmId]: action.ids } };
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
      const unreadCount = (dm.unreadCount ?? 0) + (action.fromOther ? 1 : 0);
      return { ...state, dms: { ...state.dms, [action.dmId]: { ...dm, lastMessageId: action.messageId, unreadCount } } };
    }
    case 'read': {
      const dm = state.dms[action.dmId];
      if (!dm || (dm.lastReadMessageId && dm.lastReadMessageId >= action.messageId)) return state;
      // Read to the newest is read. Read part way (another device, mid-scroll)
      // keeps the count until the list is fetched again: a count that is a
      // little high beats one that says nothing is waiting when something is.
      const caughtUp = !dm.lastMessageId || action.messageId >= dm.lastMessageId;
      return {
        ...state,
        dms: {
          ...state.dms,
          [action.dmId]: { ...dm, lastReadMessageId: action.messageId, unreadCount: caughtUp ? 0 : dm.unreadCount },
        },
      };
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
  /** Make a group of these people and yourself, and open it. Answers its id. */
  createGroup: (userIds: string[], title?: string | null) => Promise<string>;
  /** Bring someone into a group. They read from now on. */
  addMember: (dmId: string, userId: string) => Promise<void>;
  /** Leave a group. It goes from the list on every device. */
  leave: (dmId: string) => Promise<void>;
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

export function DmProvider({ children }: { children: ReactNode }) {
  const { state: app, onGatewayEvent } = useStore();
  const [state, dispatch] = useReducer(reducer, initialState);
  const selfId = app.user?.id ?? null;
  const selfRef = useRef(selfId);
  selfRef.current = selfId;
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
        setRecoveryOpener(recovery.current);
        dispatch({ type: 'recovery', exists: Boolean(published), held });
        dispatch({
          type: 'me',
          userId: selfId,
          deviceId: mine.identity.deviceId,
          fingerprint: mine.identity.fingerprint,
        });
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

  const isGroup = (dm: DmChannel | undefined): boolean => !dm || dm.kind === 'group' || dm.members.length > 2;

  const toView = useCallback(async (message: DmMessage, known: AssessedDevice[]): Promise<DmView> => {
    const base = {
      id: message.id,
      dmId: message.dmId,
      authorId: message.authorId,
      createdAt: message.createdAt,
      deleted: message.deleted,
      replyTo: null,
      sealedAt: null as number | null,
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
      sealedAt: opened.body.at ?? null,
      files: opened.body.files ?? [],
      problem: null,
      unverified: !isTrusted(sender.verdict),
      // Between two people nobody else holds the key, so the old format proves
      // enough. With more, it does not.
      // Your own messages are yours, whatever the format.
      // Read through a ref: making `toView` depend on the signed-in id
      // remade it on sign-in and the conversation never finished opening
      // (test:dm, 2026-09-23).
      unproven: opened.legacy && message.authorId !== selfRef.current && isGroup(stateRef.current.dms[message.dmId]),
    };
  }, [open]);

  /**
   * A reaction that does not open is dropped rather than drawn: there is
   * nothing to show for it. The sealed body names its own target, and that has
   * to agree with the row the server filed it under, or a server could move
   * somebody's thumbs-up onto a different message.
   *
   * A reaction from a device nobody here has accepted is dropped too, unlike a
   * message from one: a message is shown with a mark, but a thumbs-up counted
   * as somebody's is words in their mouth, so it waits until someone says the
   * device is theirs.
   */
  const toReaction = useCallback(async (message: DmMessage, known: AssessedDevice[]): Promise<DmReactionView | null> => {
    const self = device.current;
    if (!self || !message.reactionTo || !message.iv || !message.ciphertext) return null;
    const sender = believedDevice(known, message.authorId, message.senderDeviceId);
    if (!sender) return null;
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

  /**
   * Keep the sealed rows this device has seen, and work out again which of
   * them repeat what came before. Every message this device is given goes
   * through here, so this is the one place that sees a whole conversation.
   */
  const remember = (messages: DmMessage[]): void => {
    const touched = new Set<string>();
    for (const message of messages) {
      const map = (sealed.current[message.dmId] ??= new Map());
      map.set(message.id, message);
      touched.add(message.dmId);
    }
    for (const dmId of touched) {
      const rows = [...(sealed.current[dmId]?.values() ?? [])];
      dispatch({ type: 'replayed', dmId, ids: replayedIds(rows) });
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
      if (message.deleted || !message.iv || !message.ciphertext || message.keys.some((key) => key.deviceId === target.deviceId)) continue;
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
        ciphertext: message.ciphertext,
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

      // Somebody joined or left. Whoever joined has devices this one has not
      // assessed yet; fetching them now puts any warning on screen before
      // anything is typed, and the next message is locked for them either way.
      if (event.t === 'dm_update') {
        dispatch({ type: 'dm', dm: event.d });
        if (stateRef.current.loaded[event.d.id]) await refreshDevices(event.d.id);
      }

      if (event.t === 'dm_left') {
        delete sealed.current[event.d.dmId];
        delete assessed.current[event.d.dmId];
        dispatch({ type: 'left', dmId: event.d.dmId });
      }

      if (event.t === 'dm_read') dispatch({ type: 'read', dmId: event.d.dmId, messageId: event.d.lastReadMessageId });

      // "Again" on a jump: the server says which message, this side knows what it says.
      if (event.t === 'dm_spawn_replay') {
        const current = stateRef.current;
        if (!current.active || current.openId !== event.d.dmId) return;
        const view = current.messages[event.d.dmId]?.find((entry) => entry.id === event.d.messageId);
        const spawn = spawnOf(view?.text);
        if (spawn) playCharacter(spawn.id);
      }

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
        dispatch({ type: 'touched', dmId: message.dmId, messageId: message.id, fromOther: message.authorId !== selfId });
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
          const dm = stateRef.current.dms[message.dmId];
          const author = dm?.members.find((member) => member.id === message.authorId);
          // Who and when. Never what: see the note at the top of notices.ts.
          // A group is named where a channel would be.
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
              channelName: dm?.kind === 'group' ? titleOf(dm, selfId) : null,
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

  const createGroup = useCallback(
    async (userIds: string[], title?: string | null) => {
      const { dm } = await api.dms.createGroup({ userIds, title: title ?? null });
      dispatch({ type: 'dm', dm });
      openDm(dm.id);
      return dm.id;
    },
    [openDm],
  );

  const addMember = useCallback(
    async (dmId: string, userId: string) => {
      const { dm } = await api.dms.addMember(dmId, userId);
      dispatch({ type: 'dm', dm });
      if (stateRef.current.loaded[dmId]) await refreshDevices(dmId);
    },
    [refreshDevices],
  );

  const leave = useCallback(async (dmId: string) => {
    await api.dms.leave(dmId);
    delete sealed.current[dmId];
    delete assessed.current[dmId];
    dispatch({ type: 'left', dmId });
  }, []);

  /** Lock a body for every accepted device of the people in this conversation. */
  const seal = useCallback(
    async (dmId: string, body: DmBody) => {
      const self = device.current;
      if (!self) throw new Error('This device has no keys yet.');

      // Ask again every time. A phone somebody signed in on a minute ago
      // should be noticed now, not after a reload. In a group that includes
      // whoever was added a moment ago.
      const known = await refreshDevices(dmId);
      const dm = stateRef.current.dms[dmId];
      // Fail closed. The member list is what says who may read this, and it
      // comes from the conversation; with no conversation there is no member
      // list, and the device list the server just handed over is not one. A
      // message locked to whatever that list says would go to whoever the
      // server chose, which is the attack this whole file is against.
      if (!dm || dm.members.length === 0) {
        throw new Error(
          'This conversation is still loading, so there is no way to tell who can read what you send. Try again in a moment.',
        );
      }
      const { recipients } = recipientsFor(known, new Set(dm.members.map((member) => member.id)));
      const others = dm.members.filter((member) => member.id !== self.userId);
      if (dm.kind === 'group') {
        // One person without a key, or with only devices waiting to be
        // accepted, must not silence everyone else. They are named in the
        // warnings above the conversation, and get no copy until that is
        // settled. With nobody at all to lock it to, there is nothing to send.
        if (!others.some((other) => recipients.some((entry) => entry.userId === other.id))) {
          throw new Error(
            'Nobody else here has a device you have accepted, so there is nothing to lock this message to. The warnings above say why.',
          );
        }
        return { known, message: await sealMessage({ dmId, sender: self, body, recipients }) };
      }
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
      // This device's clock, inside the seal. The server's own timestamp for
      // the row is a claim it can change; this one it cannot, so the screen
      // can say when the words were actually written.
      const body: DmBody = { v: 1, text: houseRules(text), at: Date.now() };
      if (replyTo) body.replyTo = replyTo;
      if (files && files.length > 0) body.files = files;
      const { known, message } = await seal(dmId, body);
      const { message: created } = await api.dms.send(dmId, { ...message, fileIds: files?.map((file) => file.id) });
      remember([created]);
      dispatch({ type: 'touched', dmId, messageId: created.id, fromOther: false });
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
      // The message's own time stands: it is the same message, only reworded,
      // and a fresh time here would read as the server having moved it.
      if (current.sealedAt !== null) body.at = current.sealedAt;
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
      await letInEverywhere(entry.device.userId, entry.device.deviceId, entry.fingerprint);
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
      setRecoveryOpener(null);
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
      setRecoveryOpener(recovery.current);
      dispatch({ type: 'recovery', exists: true, held: true });

      // What is on screen was drawn as locked. Draw it again.
      for (const dmId of Object.keys(stateRef.current.loaded)) await loadDm(dmId).catch(() => undefined);
    },
    [loadDm, vouchForThisDevice],
  );

  const value = useMemo<DmValue>(
    () => ({
      state, showDms, hideDms, openDm, openWith, createGroup, addMember, leave, send, edit, react, remove, loadOlder,
      markRead, acceptDevice, createRecovery, restoreRecovery,
    }),
    [
      state, showDms, hideDms, openDm, openWith, createGroup, addMember, leave, send, edit, react, remove, loadOlder,
      markRead, acceptDevice, createRecovery, restoreRecovery,
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

/** Messages waiting in one conversation. At least one if it is unread at all. */
export function dmWaiting(dm: DmChannel): number {
  return dmUnread(dm) ? Math.max(1, dm.unreadCount ?? 0) : 0;
}

/** Unread conversations, newest first: the faces stacked under the DM button. */
export function waitingDms(state: DmState): DmChannel[] {
  return sortedDms(state).filter(dmUnread);
}

/** The pair conversation with this person, if there is one. */
export function pairWith(state: DmState, selfId: string | null, userId: string): DmChannel | null {
  return (
    Object.values(state.dms).find(
      (dm) => dm.kind === 'pair' && dm.members.some((member) => member.id === userId) && othersIn(dm, selfId).length === 1,
    ) ?? null
  );
}

/**
 * Everyone in a conversation but you. In a pair that is one person. A pair
 * whose other person has gone (their account deleted) answers an empty list.
 */
export function othersIn(dm: DmChannel, selfId: string | null): PublicUser[] {
  return dm.members.filter((member) => member.id !== selfId);
}

/**
 * What to call a conversation: a group's name if it was given one, otherwise
 * the people in it, as this device names them. A group everyone else has left
 * is just you.
 */
export function titleOf(dm: DmChannel, selfId: string | null): string {
  if (dm.title) return dm.title;
  const others = othersIn(dm, selfId);
  if (others.length === 0) return dm.kind === 'group' ? 'Only you' : 'Conversation';
  return others.map((member) => nameFor(member.id, member.displayName)).join(', ');
}

/** Newest conversation first; one nobody has written in yet sorts by when it was made. */
export function sortedDms(state: DmState): DmChannel[] {
  const stamp = (dm: DmChannel): string => dm.lastMessageId ?? dm.id;
  return Object.values(state.dms).sort((a, b) => stamp(b).localeCompare(stamp(a)));
}
