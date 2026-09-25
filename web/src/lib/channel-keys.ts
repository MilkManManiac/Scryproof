/**
 * Encrypted channels, the working half: fetching this device's copies of a
 * channel's keys, checking each against its maker's commitment, opening
 * messages as they arrive, sealing what is sent, and handing keys on to
 * devices that are missing them. The crypto itself is `channel-crypto.ts`;
 * the reasoning is `docs/channel-e2ee.md`.
 *
 * One of these per signed-in person, outside React, because the gateway and
 * the history loaders both need it and neither is a component. What it keeps
 * is in memory only, like DMs: opened text and unlocked keys vanish with the
 * tab, and come back by opening the sealed copies again.
 */

import { parseMentions } from '@scryproof/shared';
import type { ChannelEpoch, ChannelKeyState, DeviceKey, Message } from '@scryproof/shared';

import { ApiError, api } from './api';
import { type AdmittedDevice, admit } from './acceptance';
import { ChannelMemory } from './channel-memory';
import {
  type ChannelFileRef,
  type SealedChannelMessage,
  createEpochKey,
  describeEpoch,
  handOver,
  keyMatchesEpoch,
  openChannelMessage,
  sealChannelMessage,
  takeOver,
} from './channel-crypto';
import { type AssessedDevice, type DmDevice, assessDevices, describeDevice } from './dm-crypto';
import { deviceFor, recoveryOpenerFor } from './this-device';
import { DEVICE_ACCEPTED, emit } from './signals';
import { acceptIdentityChange } from './voice-crypto';
import { IndexedDbAcceptedStore, IndexedDbChannelMemory, IndexedDbIdentityStore } from './voice-identity';

/**
 * What became of one sealed message on this device.
 * - ok: opened, signed by a device a person here has accepted.
 * - unverified: opened and signed, by a device nobody here has accepted yet.
 * - no-key: this device has no key for it (yet): newer than the message, or waiting for a hand-over.
 * - forged: the signature does not hold, or the message was not sealed at all
 *   in a channel this device has seen encrypted. Never drawn as text.
 * - failed: anything else that did not open. Never drawn as text.
 */
export type SealStatus = 'ok' | 'unverified' | 'no-key' | 'forged' | 'failed';

/** Why this device cannot send, in terms the composer can say. */
export class KeyWait extends Error {
  constructor(
    readonly reason: 'no-key' | 'untrusted-maker' | 'nobody-else' | 'rolled-back' | 'downgraded',
    /** For 'untrusted-maker': the device whose key the channel is on, for accepting. */
    readonly device?: AssessedDevice,
  ) {
    super(WAIT_MESSAGE[reason]);
  }
}

/**
 * Not all of these are waits. The last two are refusals: this device will not
 * send at all until what the server says lines up again.
 */
const WAIT_MESSAGE: Record<KeyWait['reason'], string> = {
  'no-key': "Waiting for someone who has this channel's key to come online and hand it to this device.",
  'untrusted-maker': "This channel's key was made by a device you have not let in yet. Open the lock at the top of the channel to see whose.",
  'nobody-else':
    "This channel needs a new key, and you have not let in anyone else's device yet, so only you could read it. Open the lock at the top of the channel and let someone in, or wait for someone who has.",
  'rolled-back': 'The server says this channel moved back to an older key. This device will not send under a key it has already left behind.',
  downgraded:
    'This channel was end-to-end encrypted on this device, and that cannot be turned off. The server now says it is not encrypted, so this device will not send here. Tell whoever runs the server.',
};

interface Entry {
  state: ChannelKeyState | null;
  loading: Promise<ChannelKeyState> | null;
  /** Epoch keys this device has opened and checked against their commitments. */
  keys: Map<number, Uint8Array>;
  /** "user/device" to what this device makes of it. */
  devices: Map<string, AdmittedDevice>;
  readers: Set<string>;
  devicesLoaded: boolean;
}

const at = (userId: string, deviceId: string): string => `${userId}/${deviceId}`;

/** Retried once on these: the channel moved to a new key between asking and sending. */
const STALE = new Set(['key_rotated', 'no_epoch', 'epoch_exists']);

let memory: ChannelMemory | null = null;

/**
 * Which channels this device has seen encrypted, for whoever is signed in.
 * One per tab, because the render path reads it without waiting and the send
 * path waits for the same thing. `channel-memory.ts`.
 */
export function channelMemory(): ChannelMemory {
  if (!memory) memory = new ChannelMemory(new IndexedDbChannelMemory());
  return memory;
}

/**
 * The files a message's body lists, kept only where the server also holds a
 * locked copy under that id on this message: a body naming a file from some
 * other message shows nothing, not somebody else's upload.
 */
function withFiles(message: Message, files: readonly ChannelFileRef[]): Message {
  const held = new Set(message.attachments.filter((attachment) => attachment.sealed).map((attachment) => attachment.id));
  const kept = files.filter((file) => held.has(file.id));
  const signedIds = new Set(kept.map((file) => file.id));
  return {
    ...message,
    attachments: message.attachments.filter((attachment) => attachment.sealed && signedIds.has(attachment.id)),
    sealedFiles: kept,
  };
}

/**
 * Everything the sender's signature covers, as one string. What an opened
 * message is remembered by. The signature alone is not enough: the server can
 * re-send a message under the same id and signature with a different author,
 * and a cache that only compared signatures would hand back the cached words
 * under the new name, still marked verified.
 */
function frameOf(message: Message): string {
  return [
    message.channelId,
    String(message.keyEpoch ?? ''),
    message.authorId,
    message.senderDeviceId ?? '',
    message.replyToId ?? '',
    (message.mentions ?? []).join(','),
    message.mentionsEveryone ? '1' : '0',
    message.nonce ?? '',
    message.ciphertext ?? '',
    message.signature ?? '',
  ].join('\u0000');
}

/** Whether a message is at or after a moment. An unreadable moment counts as at or after it: shown as made up. */
function atOrAfter(createdAt: string, since: string): boolean {
  const at = Date.parse(createdAt);
  const from = Date.parse(since);
  if (Number.isNaN(at) || Number.isNaN(from)) return true;
  return at >= from;
}

export class ChannelKeys {
  private readonly pins = new IndexedDbIdentityStore();
  /** Devices a person on this device let in. Keys follow this, not the pins. */
  private readonly accepted = new IndexedDbAcceptedStore();
  private readonly memory = channelMemory();
  private readonly entries = new Map<string, Entry>();
  /**
   * Opened messages, by id, with the whole frame they were opened from. Not
   * the signature alone: the server can re-send the same id and signature with
   * a different author, and the cached text would then be shown under a name
   * that never said it.
   */
  private readonly opened = new Map<string, { frame: string; text: string | null; files: ChannelFileRef[]; status: SealStatus }>();

  /**
   * Readable messages that passed `checksPlaintext` as history from before the
   * switch, by id: with `opened`, the only text a reply's quote may show.
   */
  private readonly plainBefore = new Map<string, string>();

  /**
   * The lowest id of a sealed message seen in each channel. A plain message
   * after it is not history from before the switch (`checksPlaintext`).
   */
  private readonly firstSealed = new Map<string, string>();

  /** When this device last asked for a channel's keys. */
  private readonly asked = new Map<string, number>();

  constructor(readonly userId: string) {}

  private device(): Promise<DmDevice> {
    return deviceFor(this.userId, this.pins);
  }

  /** This device's own id and fingerprint, for the "your number" line in the lock panel. */
  async self(): Promise<{ userId: string; deviceId: string; fingerprint: string }> {
    const self = await this.device();
    return { userId: this.userId, deviceId: self.identity.deviceId, fingerprint: self.identity.fingerprint };
  }

  /**
   * What this device makes of one person's devices: the pin verdicts, and which
   * of them a person here let in. `acceptance.ts`.
   */
  private async assessed(userId: string, list: readonly DeviceKey[]): Promise<AdmittedDevice[]> {
    const self = await this.self();
    return admit(this.accepted, self, await assessDevices(this.pins, userId, [...list]));
  }

  private entry(channelId: string): Entry {
    let entry = this.entries.get(channelId);
    if (!entry) {
      entry = { state: null, loading: null, keys: new Map(), devices: new Map(), readers: new Set(), devicesLoaded: false };
      this.entries.set(channelId, entry);
    }
    return entry;
  }

  /* ------------------------------ what the server says ----------------------------- */

  private async state(channelId: string, fresh = false): Promise<ChannelKeyState> {
    const entry = this.entry(channelId);
    if (entry.state && !fresh) return entry.state;
    if (entry.loading && !fresh) return entry.loading;
    const loading = (async () => {
      const self = await this.device();
      const state = await api.channelKeys.state(channelId, self.identity.deviceId);
      entry.state = state;
      return state;
    })();
    entry.loading = loading;
    try {
      return await loading;
    } finally {
      if (entry.loading === loading) entry.loading = null;
    }
  }

  private readonly refreshing = new Map<string, Promise<Entry>>();

  /** One request at a time per channel: a page of messages from strangers asks once, not fifty times. */
  private refreshDevices(channelId: string): Promise<Entry> {
    const pending = this.refreshing.get(channelId);
    if (pending) return pending;
    const made = this.loadDevices(channelId).finally(() => this.refreshing.delete(channelId));
    this.refreshing.set(channelId, made);
    return made;
  }

  private async loadDevices(channelId: string): Promise<Entry> {
    const entry = this.entry(channelId);
    const { devices, readers } = await api.channelKeys.devices(channelId);
    const byUser = new Map<string, DeviceKey[]>();
    for (const device of devices) byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);
    const next = new Map<string, AdmittedDevice>();
    for (const [userId, list] of byUser) {
      for (const assessed of await this.assessed(userId, list)) {
        next.set(at(userId, assessed.device.deviceId), assessed);
      }
    }
    // This device is never taken from the server's list. A server that lists
    // it with another key would otherwise get keys "made by this device"
    // believed, and sent under without anyone saying yes.
    const self = await this.device();
    next.set(at(this.userId, self.identity.deviceId), {
      device: await describeDevice(self),
      fingerprint: self.identity.fingerprint,
      verdict: 'known',
      accepted: true,
    });
    entry.devices = next;
    entry.readers = new Set(readers);
    entry.devicesLoaded = true;
    return entry;
  }

  /** A device by name, fetching the list again once if it is not in it. */
  private async deviceAt(channelId: string, userId: string, deviceId: string): Promise<AdmittedDevice | null> {
    let entry = this.entry(channelId);
    if (!entry.devicesLoaded || !entry.devices.has(at(userId, deviceId))) entry = await this.refreshDevices(channelId);
    return entry.devices.get(at(userId, deviceId)) ?? null;
  }

  /* ---------------------------------- the keys ---------------------------------- */

  /**
   * The key for one epoch, opened from this device's copy (or its recovery
   * phrase's) and checked against what its maker signed. Null when there is no
   * copy that opens and checks out.
   */
  private async keyFor(channelId: string, epoch: number): Promise<Uint8Array | null> {
    const entry = this.entry(channelId);
    const known = entry.keys.get(epoch);
    if (known) return known;

    // The state is dropped whenever the gateway says the keys changed, so the
    // cached copy is as fresh as it needs to be.
    const state = await this.state(channelId);
    const record = state.epochs.find((entryEpoch) => entryEpoch.epoch === epoch);
    if (!record) return null;
    const key = await this.openCopies(channelId, state, record);
    if (key) entry.keys.set(epoch, key);
    return key;
  }

  private async openCopies(channelId: string, state: ChannelKeyState, record: ChannelEpoch): Promise<Uint8Array | null> {
    const self = await this.device();
    const phrase = recoveryOpenerFor(this.userId);
    const maker = await this.deviceAt(channelId, record.creatorId, record.creatorDeviceId);
    if (!maker || maker.verdict === 'invalid') return null;

    for (const copy of state.keys.filter((entry) => entry.epoch === record.epoch)) {
      const opener =
        copy.deviceId === self.identity.deviceId ? self : phrase && copy.deviceId === phrase.identity.deviceId ? phrase : null;
      if (!opener) continue;
      const from = await this.deviceAt(channelId, copy.wrapperId, copy.wrapperDeviceId);
      if (!from || from.verdict === 'invalid') continue;
      const key = await takeOver({ channelId, epoch: record.epoch, self: opener, from: from.device, copy });
      if (key && (await keyMatchesEpoch({ channelId, record, maker: maker.device, key }))) return key;
    }
    return null;
  }

  /**
   * The key new messages go under. Makes it if nobody has yet. Throws `KeyWait`
   * when this device has to wait: for a copy, or for its owner to accept the
   * device that made the current key. A key made by a device nobody here has
   * accepted is never used to send: that is how a server that invents a member
   * would get messages locked to a key it holds, whether by inventing the
   * member or by claiming they made the key.
   */
  private async sendKey(channelId: string): Promise<{ epoch: number; key: Uint8Array }> {
    const self = await this.device();
    // The forward-only check below reads the stored memory, so wait for it: a
    // fresh tab has not read the database yet, and an unread memory says 0.
    // If it cannot be read, nothing is sent: this device's own keys live in
    // the same database, so a device in that state could not send here anyway.
    await this.memory.load();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = await this.state(channelId, attempt > 0);
      // Forward only. A server that says the channel is on an older key again
      // is trying to put new messages under a key it, or someone it removed,
      // still holds.
      if (state.current < this.memory.highestEpoch(channelId)) throw new KeyWait('rolled-back');
      const record = state.epochs.find((entry) => entry.epoch === state.current);
      if (!record) {
        try {
          const made = await this.makeEpoch(channelId, state.current);
          await this.memory.raise(channelId, made.epoch);
          return made;
        } catch (problem) {
          if (problem instanceof ApiError && STALE.has(problem.code)) continue;
          throw problem;
        }
      }
      const key = await this.keyFor(channelId, state.current);
      if (!key) {
        void api.channelKeys.request(channelId).catch(() => undefined);
        throw new KeyWait('no-key');
      }
      // No shortcut for "made by this device": the name on the record is the
      // server's to write. This device's own entry is its real key
      // (`loadDevices`), so a key it really made passes here, and one the
      // server made under its name does not.
      const maker = await this.deviceAt(channelId, record.creatorId, record.creatorDeviceId);
      if (!maker || !maker.accepted) throw new KeyWait('untrusted-maker', maker && maker.verdict !== 'invalid' ? maker : undefined);
      await this.memory.raise(channelId, state.current);
      return { epoch: state.current, key };
    }
    throw new KeyWait('no-key');
  }

  /** A new key, locked for every accepted device of everyone who can read the channel. */
  private async makeEpoch(channelId: string, epoch: number): Promise<{ epoch: number; key: Uint8Array }> {
    const self = await this.device();
    const entry = await this.refreshDevices(channelId);
    const key = createEpochKey();
    const record = await describeEpoch({ channelId, epoch, key, maker: self });

    const recipients = [...entry.devices.values()]
      .filter((assessed) => entry.readers.has(assessed.device.userId) && assessed.accepted)
      .map((assessed) => assessed.device);
    if (!recipients.some((device) => device.userId === self.userId && device.deviceId === self.identity.deviceId)) {
      throw new Error('This device is not on the list of devices that can read this channel.');
    }
    // A key only this person's devices could open, in a channel where other
    // people have devices, would lock them all out: nobody else can make the
    // key for this epoch once it exists, and this device hands it only to
    // devices someone here let in. A newcomer who has let nobody in waits for
    // somebody who has, or lets someone in first.
    const others = [...entry.devices.values()].filter(
      (assessed) => entry.readers.has(assessed.device.userId) && assessed.device.userId !== self.userId && assessed.verdict !== 'invalid',
    );
    if (others.length > 0 && !recipients.some((device) => device.userId !== self.userId)) {
      throw new KeyWait('nobody-else');
    }
    const keys = await Promise.all(recipients.map((to) => handOver({ channelId, epoch, key, from: self, to })));
    await api.channelKeys.makeEpoch(channelId, {
      epoch,
      deviceId: self.identity.deviceId,
      commitment: record.commitment,
      signature: record.signature,
      keys,
    });
    entry.keys.set(epoch, key);
    entry.state = null;
    return { epoch, key };
  }

  /**
   * Hand every key this device holds to every accepted reader's device that is
   * missing it. Anyone online does this when asked, so a newcomer is let in by
   * whoever is around. Devices nobody here has accepted are skipped, and stay
   * waiting until someone does: being listed by the server, or pinned on first
   * sight, has never been somebody saying yes.
   */
  async handOut(channelId: string): Promise<number> {
    const self = await this.device();
    const { wanted, devices } = await api.channelKeys.wanted(channelId, self.identity.deviceId);
    if (wanted.length === 0) return 0;

    const byUser = new Map<string, DeviceKey[]>();
    for (const device of devices) byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);
    const accepted = new Map<string, DeviceKey>();
    for (const [userId, list] of byUser) {
      for (const assessed of await this.assessed(userId, list)) {
        if (assessed.accepted) accepted.set(at(userId, assessed.device.deviceId), assessed.device);
      }
    }

    const copies: { epoch: number; userId: string; deviceId: string; iv: string; key: string }[] = [];
    for (const want of wanted) {
      const to = accepted.get(at(want.userId, want.deviceId));
      if (!to) continue;
      const key = await this.keyFor(channelId, want.epoch);
      if (!key) continue;
      copies.push({ epoch: want.epoch, ...(await handOver({ channelId, epoch: want.epoch, key, from: self, to })) });
    }
    let added = 0;
    for (let start = 0; start < copies.length; start += 500) {
      added += (await api.channelKeys.handOver(channelId, { deviceId: self.identity.deviceId, keys: copies.slice(start, start + 500) })).added;
    }
    return added;
  }

  /** The keys changed: a new epoch, a retired one, or someone waiting for a copy. */
  keysChanged(channelId: string, wanted: boolean): void {
    const entry = this.entry(channelId);
    entry.state = null;
    entry.devicesLoaded = false;
    // Everyone online hears this. A moment's jitter keeps them from all doing the same work at once.
    if (wanted) setTimeout(() => void this.handOut(channelId).catch(() => 0), 200 + Math.random() * 1500);
  }

  /* ---------------------------------- messages ---------------------------------- */

  /**
   * Open whatever in this list is sealed and fill in its text. Plaintext
   * messages pass through untouched. Never throws: a message that will not
   * open is a message with a status, not an error.
   */
  async open(messages: Message[], options: { live?: boolean } = {}): Promise<Message[]> {
    for (const message of messages) {
      if (!message.ciphertext) continue;
      const first = this.firstSealed.get(message.channelId);
      if (first === undefined || message.id < first) this.firstSealed.set(message.channelId, message.id);
    }
    const opened = await Promise.all(messages.map((message) => this.openOne(message, options.live === true)));
    // Locked messages on screen: ask whoever is online and has the key to hand
    // it over. Once a minute per channel is plenty; the server limits it too.
    for (const channelId of new Set(opened.filter((message) => message.sealed === 'no-key').map((message) => message.channelId))) {
      const last = this.asked.get(channelId) ?? 0;
      if (Date.now() - last < 60_000) continue;
      this.asked.set(channelId, Date.now());
      void api.channelKeys.request(channelId).catch(() => undefined);
    }
    // A reply's quote is read from the parent, which the server could not read
    // either. It is only ever what this device opened, or plaintext that passed
    // as history from before the switch: text the server attaches to the reply
    // itself is ignored, or it could quote anyone saying anything.
    return opened.map((message) => {
      const parent = message.replyTo;
      if (!parent || parent.deleted) return message;
      const text = this.textOf(parent.id) ?? this.plainBefore.get(parent.id) ?? null;
      return { ...message, replyTo: { ...parent, content: text === null ? null : text.slice(0, 140) } };
    });
  }

  /** Forget what was opened in one channel, so the next `open` tries again with fresh keys. */
  forgetUnopened(channelId: string, messages: readonly Message[]): void {
    for (const message of messages) {
      if (message.channelId !== channelId) continue;
      const entry = this.opened.get(message.id);
      if (entry && entry.status !== 'ok') this.opened.delete(message.id);
    }
  }

  private async openOne(message: Message, live: boolean): Promise<Message> {
    if (message.deleted) return message;

    if (!message.ciphertext) {
      return this.checksPlaintext(message, live);
    }
    const { nonce, signature, senderDeviceId, keyEpoch } = message;
    if (!nonce || !signature || !senderDeviceId || keyEpoch === null) return withFiles({ ...message, content: null, sealed: 'failed' }, []);

    const frame = frameOf(message);
    const cached = this.opened.get(message.id);
    if (cached && cached.frame === frame && cached.status !== 'no-key') {
      return withFiles({ ...message, content: cached.text, sealed: cached.status }, cached.files);
    }

    let status: SealStatus;
    let text: string | null = null;
    let files: ChannelFileRef[] = [];
    try {
      const key = await this.keyFor(message.channelId, keyEpoch);
      const sender = key ? await this.deviceAt(message.channelId, message.authorId, senderDeviceId) : null;
      if (!key) status = 'no-key';
      else if (!sender || sender.verdict === 'invalid') status = 'failed';
      else {
        const result = await openChannelMessage({
          frame: {
            channelId: message.channelId,
            epoch: keyEpoch,
            authorId: message.authorId,
            senderDeviceId,
            replyToId: message.replyToId,
            mentionIds: message.mentions,
            mentionsEveryone: message.mentionsEveryone,
          },
          senderDevice: sender.device,
          key,
          nonce,
          ciphertext: message.ciphertext,
          signature,
        });
        if (result.ok) {
          text = result.body.text;
          files = result.body.files ?? [];
          // Readable, and signed by somebody: but a person on this device has
          // to have let that device in before this device calls it verified.
          status = sender.accepted ? 'ok' : 'unverified';
        } else status = result.reason;
      }
    } catch {
      status = 'failed';
    }
    this.opened.set(message.id, { frame, text, files, status });
    return withFiles({ ...message, content: text, sealed: status }, files);
  }

  /**
   * A message with no sealed bytes in a channel this device has seen
   * encrypted. The honest server stores no plaintext there at all, so one that
   * arrives is something the server made up, whatever name is on it: it is
   * shown as forged rather than as text. Plain messages from before the switch
   * are the channel's real history and pass straight through.
   *
   * The date on a message is the server's to write, so the date alone is not
   * enough. Two more things give a made-up one away:
   *  - it arrived live. Nothing plain is written in an encrypted channel, so
   *    a new plain message is made up whatever date it carries. The one
   *    exception is an update to plain history this tab already read, with
   *    the same words (a pin, say);
   *  - it sits after a sealed message. Message ids are the server's too, but
   *    they set the order on screen, and a plain message placed among sealed
   *    ones is not from before the switch.
   * What is left is a server inventing a message deep in the readable past,
   * which it could always do: that history was never sealed.
   */
  private async checksPlaintext(message: Message, live: boolean): Promise<Message> {
    // Rendering must not wait on the database, so a load that fails lets the
    // message through: the gate that matters is the one before sending.
    await this.memory.load().catch(() => undefined);
    const since = this.memory.since(message.channelId);
    const first = this.firstSealed.get(message.channelId);
    const madeUp =
      since !== undefined &&
      (since === null ||
        atOrAfter(message.createdAt, since) ||
        (live && this.plainBefore.get(message.id) !== message.content) ||
        (first !== undefined && message.id > first));
    if (madeUp) {
      return { ...message, content: null, sealed: 'forged', attachments: [], sealedFiles: [] };
    }
    if (message.content !== null) this.plainBefore.set(message.id, message.content);
    return message;
  }

  /** The text of a message this device has opened, for reply previews and jumps. */
  textOf(messageId: string): string | null {
    return this.opened.get(messageId)?.text ?? null;
  }

  /**
   * Seal a message for sending. `members` is who can be pinged; mentions are
   * found here, as the server would find them in a readable channel, and the
   * author of the message replied to is pinged too.
   */
  async seal(input: {
    channelId: string;
    text: string;
    replyToId: string | null;
    replyAuthorId: string | null;
    memberIds: ReadonlySet<string>;
    canMentionEveryone: boolean;
    /** Locked and uploaded already (`sealChannelFile`, `api.uploadSealed`). An edit carries the message's own. */
    files?: readonly ChannelFileRef[];
  }): Promise<SealedChannelMessage> {
    const self = await this.device();
    const parsed = parseMentions(input.text);
    const mentionIds = parsed.userIds.filter((id) => input.memberIds.has(id));
    if (input.replyAuthorId && input.memberIds.has(input.replyAuthorId)) mentionIds.push(input.replyAuthorId);
    const { epoch, key } = await this.sendKey(input.channelId);
    return sealChannelMessage({
      channelId: input.channelId,
      epoch,
      key,
      sender: self,
      body: { v: 1, text: input.text, ...(input.files && input.files.length > 0 ? { files: [...input.files] } : {}) },
      replyToId: input.replyToId,
      mentionIds,
      mentionsEveryone: parsed.everyone && input.canMentionEveryone,
    });
  }

  /** Seal and post, once more if the channel moved to a new key in between. */
  async send(input: Parameters<ChannelKeys['seal']>[0]): Promise<Message> {
    for (let attempt = 0; ; attempt += 1) {
      const sealed = await this.seal(input);
      try {
        const { message } = await api.messages.send(input.channelId, {
          ...sealed,
          ...(input.replyToId ? { replyToId: input.replyToId } : {}),
          ...(input.files && input.files.length > 0 ? { attachmentIds: input.files.map((file) => file.id) } : {}),
        });
        return message;
      } catch (problem) {
        if (attempt === 0 && problem instanceof ApiError && STALE.has(problem.code)) {
          this.entry(input.channelId).state = null;
          continue;
        }
        throw problem;
      }
    }
  }

  async edit(messageId: string, input: Parameters<ChannelKeys['seal']>[0]): Promise<Message> {
    for (let attempt = 0; ; attempt += 1) {
      const sealed = await this.seal(input);
      try {
        return (await api.messages.edit(messageId, sealed)).message;
      } catch (problem) {
        if (attempt === 0 && problem instanceof ApiError && STALE.has(problem.code)) {
          this.entry(input.channelId).state = null;
          continue;
        }
        throw problem;
      }
    }
  }

  /* ---------------------------------- people ---------------------------------- */

  /**
   * Who the server says holds the current key, and every reader's device that
   * has not been let in on this device. What the channel's "who can read this"
   * panel draws. Each entry says whether a person here accepted it, because
   * the holder list itself comes from the server and proves nothing.
   */
  async holders(channelId: string): Promise<{ epoch: number; holders: AdmittedDevice[]; waiting: AdmittedDevice[] }> {
    const state = await this.state(channelId, true);
    const entry = await this.refreshDevices(channelId);
    const holding = new Set(state.holders.map((holder) => at(holder.userId, holder.deviceId)));
    const holders: AdmittedDevice[] = [];
    const waiting: AdmittedDevice[] = [];
    for (const [id, assessed] of entry.devices) {
      if (!entry.readers.has(assessed.device.userId)) continue;
      if (holding.has(id)) holders.push(assessed);
      // Whether or not the server lists it as a holder: a device nobody here
      // has let in gets no key from this one, and no message of its own is
      // shown as verified here. `invalid` is a signature that does not hold,
      // and is never offered for acceptance.
      if (!assessed.accepted && assessed.verdict !== 'invalid') waiting.push(assessed);
    }
    return { epoch: state.current, holders, waiting };
  }

  /** Apply a local acceptance decision to every channel already open here. */
  async refreshAccepted(): Promise<void> {
    const self = await this.self();
    for (const entry of this.entries.values()) {
      const devices = await admit(this.accepted, self, [...entry.devices.values()]);
      entry.devices = new Map(devices.map((device) => [at(device.device.userId, device.device.deviceId), device]));
    }
    for (const [id, entry] of this.opened) if (entry.status === 'unverified') this.opened.delete(id);
  }

  /** Let a device in from now on, then give it what this device can. */
  async accept(channelId: string, assessed: AssessedDevice): Promise<void> {
    if (assessed.verdict === 'invalid') return;
    await acceptIdentityChange(this.pins, assessed.device.userId, assessed.device.deviceId, assessed.fingerprint);
    // Two memories: the pin catches this device's key changing later; this one
    // is what keys are allowed to follow. A pin made on its own is not a yes.
    await this.accepted.set(assessed.device.userId, assessed.device.deviceId, assessed.fingerprint);
    emit(DEVICE_ACCEPTED);
    await this.refreshDevices(channelId);
    // Messages from it were marked unverified; they are opened again.
    for (const [id, entry] of this.opened) if (entry.status === 'unverified') this.opened.delete(id);
    await this.handOut(channelId).catch(() => 0);
  }
}

let current: ChannelKeys | null = null;

/** The one for whoever is signed in. */
export function channelKeysFor(userId: string): ChannelKeys {
  if (!current || current.userId !== userId) current = new ChannelKeys(userId);
  return current;
}
