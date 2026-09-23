/**
 * Encrypted channels: the part the server is never allowed to see. Read
 * `docs/channel-e2ee.md` first; this is the code for it.
 *
 * In one paragraph: a channel has one key per epoch, made on a member's device.
 * The maker signs a commitment to the key with their identity key, so every
 * holder can check that the key they were handed is the one the maker made
 * and nobody's substitute. Copies of the key travel device to device, locked
 * with the same long-lived DM keys direct messages use. A message is sealed
 * with a key derived from the epoch's key, and signed by the sender's device:
 * the channel key says "a member wrote this", the signature says which one.
 *
 * Everything here is pure: bytes in, bytes out, and every "open" returns a
 * verdict instead of throwing, because a hostile server can send anything.
 * Which devices to believe is decided elsewhere (`assessDevices` in
 * `dm-crypto.ts`) and passed in.
 */

import { concatLabelled, epochSignedBytes, messageSignedBytes } from '@scryproof/shared';
import type { ChannelEpoch, DeviceKey, SealedFileRef } from '@scryproof/shared';

import type { DmDevice, DmOpener } from './dm-crypto';
import { fromBase64, importIdentityKey, toBase64 } from './voice-crypto';

const COMMIT_CONTEXT = 'scryproof/channel/commit/v1';
const WRAP_CONTEXT = 'scryproof/channel/wrap/v1';
const BODY_CONTEXT = 'scryproof/channel/body/v1';
const FILE_CONTEXT = 'scryproof/channel/file/v1';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const text = new TextEncoder();

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/* ------------------------------------------------------------------ *
 * The epoch's key.
 * ------------------------------------------------------------------ */

export const createEpochKey = (): Uint8Array => randomBytes(32);

/**
 * A fingerprint of the key that only someone holding the key can make, and
 * that names the channel and epoch. Stored in the clear beside the maker's
 * signature. It reveals nothing about the key (HMAC with the key as the key).
 */
export async function commitmentOf(key: Uint8Array, channelId: string, epoch: number): Promise<Uint8Array> {
  const hmac = await subtle().importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(
    await subtle().sign('HMAC', hmac, concatLabelled(COMMIT_CONTEXT, channelId, String(epoch)) as BufferSource),
  );
}

/** The maker's half: the commitment and its signature, ready for the server. */
export async function describeEpoch(options: {
  channelId: string;
  epoch: number;
  key: Uint8Array;
  maker: DmDevice;
}): Promise<ChannelEpoch> {
  const { channelId, epoch, maker } = options;
  const commitment = await commitmentOf(options.key, channelId, epoch);
  const signature = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    maker.identity.privateKey,
    epochSignedBytes({
      channelId,
      epoch,
      creatorId: maker.userId,
      creatorDeviceId: maker.identity.deviceId,
      commitment,
    }) as BufferSource,
  );
  return {
    epoch,
    creatorId: maker.userId,
    creatorDeviceId: maker.identity.deviceId,
    commitment: toBase64(commitment),
    signature: toBase64(new Uint8Array(signature)),
  };
}

/**
 * Whether a key is the one the epoch's maker made: their signature holds over
 * the commitment, and the key produces that commitment. `maker` must be the
 * device the record names, from the server's table; whether to believe that
 * device is the caller's question.
 */
export async function keyMatchesEpoch(options: {
  channelId: string;
  record: ChannelEpoch;
  maker: DeviceKey;
  key: Uint8Array;
}): Promise<boolean> {
  const { channelId, record, maker } = options;
  if (maker.userId !== record.creatorId || maker.deviceId !== record.creatorDeviceId) return false;
  try {
    const commitment = fromBase64(record.commitment);
    const identity = await importIdentityKey(fromBase64(maker.identityKey));
    const signed = await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      identity,
      fromBase64(record.signature) as BufferSource,
      epochSignedBytes({
        channelId,
        epoch: record.epoch,
        creatorId: record.creatorId,
        creatorDeviceId: record.creatorDeviceId,
        commitment,
      }) as BufferSource,
    );
    if (!signed) return false;
    const actual = await commitmentOf(options.key, channelId, record.epoch);
    return equalBytes(actual, commitment);
  } catch {
    return false;
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Handing the key from device to device.
 * ------------------------------------------------------------------ */

interface Hand {
  channelId: string;
  epoch: number;
  fromUserId: string;
  fromDeviceId: string;
  toUserId: string;
  toDeviceId: string;
}

const handLabel = (h: Hand): Uint8Array =>
  concatLabelled(WRAP_CONTEXT, h.channelId, String(h.epoch), h.fromUserId, h.fromDeviceId, h.toUserId, h.toDeviceId);

/**
 * The key one device locks a channel key with for another: ECDH between their
 * long-lived DM keys, stretched with the channel, the epoch and both ends
 * named, so a copy made for one hand-over opens for no other.
 */
async function handKey(h: Hand, privateKey: CryptoKey, theirDmKey: Uint8Array): Promise<CryptoKey> {
  const theirs = await subtle().importKey('spki', theirDmKey as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: theirs }, privateKey, 256);
  const material = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: text.encode(h.channelId) as BufferSource, info: handLabel(h) as BufferSource },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Lock an epoch's key for one device. The caller must only pass devices it believes. */
export async function handOver(options: {
  channelId: string;
  epoch: number;
  key: Uint8Array;
  from: DmDevice;
  to: DeviceKey;
}): Promise<{ userId: string; deviceId: string; iv: string; key: string }> {
  const { from, to } = options;
  const hand: Hand = {
    channelId: options.channelId,
    epoch: options.epoch,
    fromUserId: from.userId,
    fromDeviceId: from.identity.deviceId,
    toUserId: to.userId,
    toDeviceId: to.deviceId,
  };
  const key = await handKey(hand, from.dm.privateKey, fromBase64(to.dmKey));
  const iv = randomBytes(12);
  const locked = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: handLabel(hand) as BufferSource },
    key,
    options.key as BufferSource,
  );
  return { userId: to.userId, deviceId: to.deviceId, iv: toBase64(iv), key: toBase64(new Uint8Array(locked)) };
}

/** Open a copy handed to this device (or to its recovery phrase). Null when it does not open. */
export async function takeOver(options: {
  channelId: string;
  epoch: number;
  self: DmOpener;
  from: DeviceKey;
  copy: { iv: string; key: string };
}): Promise<Uint8Array | null> {
  const { self, from } = options;
  const hand: Hand = {
    channelId: options.channelId,
    epoch: options.epoch,
    fromUserId: from.userId,
    fromDeviceId: from.deviceId,
    toUserId: self.userId,
    toDeviceId: self.identity.deviceId,
  };
  try {
    const key = await handKey(hand, self.dm.privateKey, fromBase64(from.dmKey));
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(options.copy.iv) as BufferSource, additionalData: handLabel(hand) as BufferSource },
      key,
      fromBase64(options.copy.key) as BufferSource,
    );
    const bytes = new Uint8Array(opened);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Messages.
 * ------------------------------------------------------------------ */

/** What is inside a sealed channel message: the words, and the files it carries. */
export interface ChannelBody {
  v: 1;
  text: string;
  files?: ChannelFileRef[];
}

/**
 * A file, as the message that carries it describes it. The server holds the
 * locked bytes under `id` (an ordinary attachment row, marked sealed, with no
 * name and no type) and nothing else: the name, the type and the key that
 * opens it are all in here, inside the seal, under the sender's signature.
 */
export type ChannelFileRef = SealedFileRef;

/** The most files one message carries; the server's own limit is the same or lower. */
const MAX_FILES = 10;

function parseFiles(raw: unknown): ChannelFileRef[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_FILES) return null;
  const files: ChannelFileRef[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { id, name, type, size, key, iv } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof type !== 'string') return null;
    if (typeof size !== 'number' || typeof key !== 'string' || typeof iv !== 'string') return null;
    files.push({ id, name: name.slice(0, 200), type: type.slice(0, 100), size, key, iv });
  }
  return files;
}

function parseBody(raw: unknown): ChannelBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (body.v !== 1 || typeof body.text !== 'string') return null;
  const out: ChannelBody = { v: 1, text: body.text };
  if (body.files !== undefined) {
    const files = parseFiles(body.files);
    if (!files) return null;
    if (files.length > 0) out.files = files;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Files.
 * ------------------------------------------------------------------ */

const fileAad = (channelId: string): Uint8Array => concatLabelled(FILE_CONTEXT, channelId);

/**
 * Lock a file under a key of its own. The key goes into the message body, so
 * whoever can open the message can open the file and nobody else can; the
 * channel is in the additional data, so the locked copy cannot be passed off
 * as a file from another channel. The locked bytes are what gets uploaded.
 */
export async function sealChannelFile(
  channelId: string,
  bytes: Uint8Array,
): Promise<{ sealed: Uint8Array; key: string; iv: string }> {
  const keyBytes = randomBytes(32);
  const iv = randomBytes(12);
  const key = await subtle().importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt']);
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: fileAad(channelId) as BufferSource },
    key,
    bytes as BufferSource,
  );
  return { sealed: new Uint8Array(sealed), key: toBase64(keyBytes), iv: toBase64(iv) };
}

/** Null when the bytes are not what the message said they would be. */
export async function openChannelFile(
  channelId: string,
  ref: Pick<ChannelFileRef, 'key' | 'iv'>,
  sealed: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const key = await subtle().importKey('raw', fromBase64(ref.key) as BufferSource, 'AES-GCM', false, ['decrypt']);
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(ref.iv) as BufferSource, additionalData: fileAad(channelId) as BufferSource },
      key,
      sealed as BufferSource,
    );
    return new Uint8Array(opened);
  } catch {
    return null;
  }
}

/** What the server stores in the clear about a message, all of it covered by the signature. */
export interface MessageFrame {
  channelId: string;
  epoch: number;
  authorId: string;
  senderDeviceId: string;
  replyToId: string | null;
  mentionIds: readonly string[];
  mentionsEveryone: boolean;
}

async function bodyKey(epochKey: Uint8Array, channelId: string, epoch: number, usage: KeyUsage): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', epochKey as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32) as BufferSource,
      info: concatLabelled(BODY_CONTEXT, channelId, String(epoch)) as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

const bodyAad = (f: MessageFrame): Uint8Array =>
  concatLabelled(BODY_CONTEXT, f.channelId, String(f.epoch), f.authorId, f.senderDeviceId, f.replyToId ?? '');

export interface SealedChannelMessage {
  nonce: string;
  ciphertext: string;
  signature: string;
  senderDeviceId: string;
  keyEpoch: number;
  mentionIds: string[];
  mentionsEveryone: boolean;
}

/**
 * Seal and sign. Mentions are named here, by the sender, because the server
 * cannot read the text to find them; the sender's own id is dropped, as the
 * server would drop it, so the list the server stores is the list signed.
 */
export async function sealChannelMessage(options: {
  channelId: string;
  epoch: number;
  key: Uint8Array;
  sender: DmDevice;
  body: ChannelBody;
  replyToId: string | null;
  mentionIds: readonly string[];
  mentionsEveryone: boolean;
}): Promise<SealedChannelMessage> {
  const { sender } = options;
  const mentionIds = [...new Set(options.mentionIds)].filter((id) => id !== sender.userId);
  const frame: MessageFrame = {
    channelId: options.channelId,
    epoch: options.epoch,
    authorId: sender.userId,
    senderDeviceId: sender.identity.deviceId,
    replyToId: options.replyToId,
    mentionIds,
    mentionsEveryone: options.mentionsEveryone,
  };
  const nonce = randomBytes(12);
  const key = await bodyKey(options.key, options.channelId, options.epoch, 'encrypt');
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: bodyAad(frame) as BufferSource },
      key,
      text.encode(JSON.stringify(options.body)) as BufferSource,
    ),
  );
  const signature = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    sender.identity.privateKey,
    messageSignedBytes({ ...frame, nonce, ciphertext }) as BufferSource,
  );
  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
    signature: toBase64(new Uint8Array(signature)),
    senderDeviceId: frame.senderDeviceId,
    keyEpoch: options.epoch,
    mentionIds,
    mentionsEveryone: options.mentionsEveryone,
  };
}

export type ChannelOpenResult =
  | { ok: true; body: ChannelBody }
  /** The signature does not hold: not written by the device the server says, or altered on the way. */
  | { ok: false; reason: 'forged' }
  /** Signed, but the body does not open under this key. */
  | { ok: false; reason: 'failed' };

/**
 * Check the signature, then open. `senderDevice` is the device the server
 * says sent it; it has to belong to the author. `key` is the epoch's key,
 * already checked against its commitment.
 */
export async function openChannelMessage(options: {
  frame: MessageFrame;
  senderDevice: DeviceKey;
  key: Uint8Array;
  nonce: string;
  ciphertext: string;
  signature: string;
}): Promise<ChannelOpenResult> {
  const { frame, senderDevice } = options;
  if (senderDevice.userId !== frame.authorId || senderDevice.deviceId !== frame.senderDeviceId) {
    return { ok: false, reason: 'forged' };
  }
  try {
    const nonce = fromBase64(options.nonce);
    const ciphertext = fromBase64(options.ciphertext);
    const identity = await importIdentityKey(fromBase64(senderDevice.identityKey));
    const signed = await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      identity,
      fromBase64(options.signature) as BufferSource,
      messageSignedBytes({ ...frame, nonce, ciphertext }) as BufferSource,
    );
    if (!signed) return { ok: false, reason: 'forged' };
    const key = await bodyKey(options.key, frame.channelId, frame.epoch, 'decrypt');
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: bodyAad(frame) as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    const body = parseBody(JSON.parse(new TextDecoder().decode(opened)));
    return body ? { ok: true, body } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
