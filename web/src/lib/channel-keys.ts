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
import {
  type SealedChannelMessage,
  createEpochKey,
  describeEpoch,
  handOver,
  keyMatchesEpoch,
  openChannelMessage,
  sealChannelMessage,
  takeOver,
} from './channel-crypto';
import { type AssessedDevice, type DmDevice, assessDevices, isTrusted } from './dm-crypto';
import { deviceFor, recoveryOpenerFor } from './this-device';
import { acceptIdentityChange } from './voice-crypto';
import { IndexedDbIdentityStore } from './voice-identity';

/**
 * What became of one sealed message on this device.
 * - ok: opened, signed by a device this one believes.
 * - unverified: opened and signed, by a device nobody here has accepted yet.
 * - no-key: this device has no key for it (yet): newer than the message, or waiting for a hand-over.
 * - forged: the signature does not hold. Never drawn as text.
 * - failed: anything else that did not open. Never drawn as text.
 */
export type SealStatus = 'ok' | 'unverified' | 'no-key' | 'forged' | 'failed';

/** Why this device cannot send yet, in terms the composer can say. */
export class KeyWait extends Error {
  constructor(
    readonly reason: 'no-key' | 'untrusted-maker',
    /** For 'untrusted-maker': the device whose key the channel is on, for accepting. */
    readonly device?: AssessedDevice,
  ) {
    super(
      reason === 'no-key'
        ? "Waiting for someone who has this channel's key to come online and hand it to this device."
        : "This channel's key was made by a device you have not accepted yet. Open the lock at the top of the channel to see whose.",
    );
  }
}

interface Entry {
  state: ChannelKeyState | null;
  loading: Promise<ChannelKeyState> | null;
  /** Epoch keys this device has opened and checked against their commitments. */
  keys: Map<number, Uint8Array>;
  /** "user/device" to what this device makes of it. */
  devices: Map<string, AssessedDevice>;
  readers: Set<string>;
  devicesLoaded: boolean;
}

const at = (userId: string, deviceId: string): string => `${userId}/${deviceId}`;

/** Retried once on these: the channel moved to a new key between asking and sending. */
const STALE = new Set(['key_rotated', 'no_epoch', 'epoch_exists']);

export class ChannelKeys {
  private readonly pins = new IndexedDbIdentityStore();
  private readonly entries = new Map<string, Entry>();
  /** Opened messages, by id, with the signature they were opened under. */
  private readonly opened = new Map<string, { signature: string; text: string | null; status: SealStatus }>();

  /** When this device last asked for a channel's keys. */
  private readonly asked = new Map<string, number>();

  constructor(readonly userId: string) {}

  private device(): Promise<DmDevice> {
    return deviceFor(this.userId, this.pins);
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
    const next = new Map<string, AssessedDevice>();
    for (const [userId, list] of byUser) {
      for (const assessed of await assessDevices(this.pins, userId, list)) {
        next.set(at(userId, assessed.device.deviceId), assessed);
      }
    }
    entry.devices = next;
    entry.readers = new Set(readers);
    entry.devicesLoaded = true;
    return entry;
  }

  /** A device by name, fetching the list again once if it is not in it. */
  private async deviceAt(channelId: string, userId: string, deviceId: string): Promise<AssessedDevice | null> {
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
   * device that made the current key. A key made by a device this one does not
   * believe is never used to send: that is how a server that invents a device
   * would get messages locked to a key it holds.
   */
  private async sendKey(channelId: string): Promise<{ epoch: number; key: Uint8Array }> {
    const self = await this.device();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = await this.state(channelId, attempt > 0);
      const record = state.epochs.find((entry) => entry.epoch === state.current);
      if (!record) {
        try {
          return await this.makeEpoch(channelId, state.current);
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
      const mine = record.creatorId === self.userId && record.creatorDeviceId === self.identity.deviceId;
      const maker = mine ? null : await this.deviceAt(channelId, record.creatorId, record.creatorDeviceId);
      if (!mine && (!maker || !isTrusted(maker.verdict))) throw new KeyWait('untrusted-maker', maker ?? undefined);
      return { epoch: state.current, key };
    }
    throw new KeyWait('no-key');
  }

  /** A new key, locked for every believed device of everyone who can read the channel. */
  private async makeEpoch(channelId: string, epoch: number): Promise<{ epoch: number; key: Uint8Array }> {
    const self = await this.device();
    const entry = await this.refreshDevices(channelId);
    const key = createEpochKey();
    const record = await describeEpoch({ channelId, epoch, key, maker: self });

    const recipients = [...entry.devices.values()]
      .filter((assessed) => entry.readers.has(assessed.device.userId) && isTrusted(assessed.verdict))
      .map((assessed) => assessed.device);
    if (!recipients.some((device) => device.userId === self.userId && device.deviceId === self.identity.deviceId)) {
      throw new Error('This device is not on the list of devices that can read this channel.');
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
   * Hand every key this device holds to every believed reader's device that is
   * missing it. Anyone online does this when asked, so a newcomer is let in by
   * whoever is around. Devices nobody here has accepted are skipped, and stay
   * waiting until someone does.
   */
  async handOut(channelId: string): Promise<number> {
    const self = await this.device();
    const { wanted, devices } = await api.channelKeys.wanted(channelId, self.identity.deviceId);
    if (wanted.length === 0) return 0;

    const byUser = new Map<string, DeviceKey[]>();
    for (const device of devices) byUser.set(device.userId, [...(byUser.get(device.userId) ?? []), device]);
    const believed = new Map<string, DeviceKey>();
    for (const [userId, list] of byUser) {
      for (const assessed of await assessDevices(this.pins, userId, list)) {
        if (isTrusted(assessed.verdict)) believed.set(at(userId, assessed.device.deviceId), assessed.device);
      }
    }

    const copies: { epoch: number; userId: string; deviceId: string; iv: string; key: string }[] = [];
    for (const want of wanted) {
      const to = believed.get(at(want.userId, want.deviceId));
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
  async open(messages: Message[]): Promise<Message[]> {
    const opened = await Promise.all(messages.map((message) => this.openOne(message)));
    // Locked messages on screen: ask whoever is online and has the key to hand
    // it over. Once a minute per channel is plenty; the server limits it too.
    for (const channelId of new Set(opened.filter((message) => message.sealed === 'no-key').map((message) => message.channelId))) {
      const last = this.asked.get(channelId) ?? 0;
      if (Date.now() - last < 60_000) continue;
      this.asked.set(channelId, Date.now());
      void api.channelKeys.request(channelId).catch(() => undefined);
    }
    // A reply's preview is read from the parent, which the server could not
    // read either. Filled in from whatever this device has opened.
    return opened.map((message) => {
      const parent = message.replyTo;
      if (!parent || parent.deleted || parent.content !== null) return message;
      const text = this.textOf(parent.id);
      return text === null ? message : { ...message, replyTo: { ...parent, content: text.slice(0, 140) } };
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

  private async openOne(message: Message): Promise<Message> {
    if (message.deleted || !message.ciphertext) return message;
    const { nonce, signature, senderDeviceId, keyEpoch } = message;
    if (!nonce || !signature || !senderDeviceId || keyEpoch === null) return { ...message, content: null, sealed: 'failed' };

    const cached = this.opened.get(message.id);
    if (cached && cached.signature === signature && cached.status !== 'no-key') {
      return { ...message, content: cached.text, sealed: cached.status };
    }

    let status: SealStatus;
    let text: string | null = null;
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
          status = isTrusted(sender.verdict) ? 'ok' : 'unverified';
        } else status = result.reason;
      }
    } catch {
      status = 'failed';
    }
    this.opened.set(message.id, { signature, text, status });
    return { ...message, content: text, sealed: status };
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
      body: { v: 1, text: input.text },
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
        const { message } = await api.messages.send(input.channelId, { ...sealed, ...(input.replyToId ? { replyToId: input.replyToId } : {}) });
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
   * Who holds the current key, and every reader's device that is waiting on
   * this one to accept it. What the channel's "who can read this" panel draws.
   */
  async holders(channelId: string): Promise<{ epoch: number; holders: AssessedDevice[]; waiting: AssessedDevice[] }> {
    const state = await this.state(channelId, true);
    const entry = await this.refreshDevices(channelId);
    const holding = new Set(state.holders.map((holder) => at(holder.userId, holder.deviceId)));
    const holders: AssessedDevice[] = [];
    const waiting: AssessedDevice[] = [];
    for (const [id, assessed] of entry.devices) {
      if (!entry.readers.has(assessed.device.userId)) continue;
      if (holding.has(id)) holders.push(assessed);
      // Holding a key already or not: a device this one has not accepted is
      // one it will not hand keys to, nor send under a key it made.
      if (assessed.verdict === 'new-device' || assessed.verdict === 'changed') waiting.push(assessed);
    }
    return { epoch: state.current, holders, waiting };
  }

  /** Believe a device from now on, then give it what this device can. */
  async accept(channelId: string, assessed: AssessedDevice): Promise<void> {
    if (assessed.verdict === 'invalid') return;
    await acceptIdentityChange(this.pins, assessed.device.userId, assessed.device.deviceId, assessed.fingerprint);
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
