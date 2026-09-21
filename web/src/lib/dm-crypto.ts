/**
 * Direct message encryption. Like `voice-crypto.ts`, the part the server is
 * never allowed to see, and for the same reason it lives in the web workspace
 * and imports nothing the server could also import.
 *
 * In one paragraph: every device has, next to the identity key voice already
 * uses, a second long-lived key for DMs, and publishes the public half signed
 * by the identity key. To send, a device invents a fresh random key for that
 * one message, seals the text with it, and then seals that small key once for
 * every device that should be able to read the message: the other person's,
 * and the sender's own, this one included, or the sender could not read their
 * own history. The server stores the sealed text and the sealed keys and can
 * open neither.
 *
 * Where voice and DMs differ is time. A call's keys are agreed live and thrown
 * away. A DM has to reach someone who is asleep, so the keys it is locked to
 * are long-lived and come from the server's table, which makes that table the
 * place an attacker would swap a key. Two things answer that: a DM key only
 * counts if the identity key signed it, and identity keys are pinned, in the
 * same store voice pins them in. A device nobody has accepted gets no copy of
 * anything.
 *
 * The honest limit: long-lived keys mean no forward secrecy. Somebody who
 * copies the database today and steals a device's private key next year can
 * open what they copied. The private keys are non-extractable, which makes
 * that theft hard, not impossible. Keys that roll forward with every message
 * are M7's job; nothing here blocks it. `docs/dm-plan.md`.
 */

import type { DeviceKey, DmWrappedKey } from '@scryproof/shared';

import {
  type DeviceIdentity,
  type IdentityStore,
  type PinVerdict,
  fingerprintOf,
  fromBase64,
  importIdentityKey,
  toBase64,
} from './voice-crypto';

/** Must match `DEVICE_CONTEXT` in server/src/routes/dms.ts. */
const DEVICE_CONTEXT = 'scryproof/dm/device/v1';
const WRAP_CONTEXT = 'scryproof/dm/wrap/v1';
const BODY_CONTEXT = 'scryproof/dm/body/v1';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const text = new TextEncoder();

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Join several pieces with their lengths, so no two inputs can be confused. */
function concatLabelled(...parts: (string | Uint8Array)[]): Uint8Array {
  const encoded = parts.map((part) => (typeof part === 'string' ? text.encode(part) : part));
  const total = encoded.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of encoded) {
    view.setUint32(at, part.length, false);
    out.set(part, at + 4);
    at += 4 + part.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The device's DM key.
 * ------------------------------------------------------------------ */

export interface DmKeypair {
  /** Non-extractable, like the identity key. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
}

export async function createDmKeypair(): Promise<DmKeypair> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyBytes: new Uint8Array(await subtle().exportKey('spki', pair.publicKey)),
  };
}

/** Rebuild the keypair from the handles IndexedDB gives back. */
export async function describeDmKeypair(privateKey: CryptoKey, publicKey: CryptoKey): Promise<DmKeypair> {
  return { privateKey, publicKey, publicKeyBytes: new Uint8Array(await subtle().exportKey('spki', publicKey)) };
}

/** Everything a device needs to send and read. */
export interface DmDevice {
  userId: string;
  identity: DeviceIdentity;
  dm: DmKeypair;
}

function deviceBytes(device: Omit<DeviceKey, 'signature'>): Uint8Array {
  return concatLabelled(
    DEVICE_CONTEXT,
    device.userId,
    device.deviceId,
    fromBase64(device.identityKey),
    fromBase64(device.dmKey),
  );
}

/** What this device publishes. The signature is what ties the DM key to the identity. */
export async function describeDevice(device: DmDevice): Promise<DeviceKey> {
  const unsigned = {
    userId: device.userId,
    deviceId: device.identity.deviceId,
    identityKey: toBase64(device.identity.publicKeyBytes),
    dmKey: toBase64(device.dm.publicKeyBytes),
  };
  const signature = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    device.identity.privateKey,
    deviceBytes(unsigned) as BufferSource,
  );
  return { ...unsigned, signature: toBase64(new Uint8Array(signature)) };
}

/**
 * Whether a published DM key was signed by the identity key beside it.
 *
 * As in voice, this proves the two keys belong together and nothing about whose
 * they are. It is what forces a server that wants to swap a DM key to swap the
 * identity key too, and that is the swap pinning catches.
 */
export async function verifyDevice(device: DeviceKey): Promise<boolean> {
  try {
    const key = await importIdentityKey(fromBase64(device.identityKey));
    return await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(device.signature) as BufferSource,
      deviceBytes(device) as BufferSource,
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Which devices to believe.
 * ------------------------------------------------------------------ */

export interface AssessedDevice {
  device: DeviceKey;
  fingerprint: string;
  /** 'invalid' is a signature that does not hold. It is never offered for acceptance. */
  verdict: PinVerdict | 'invalid';
}

/** Verdicts a message may be locked to, or believed from, without asking anyone. */
export const isTrusted = (verdict: AssessedDevice['verdict']): boolean =>
  verdict === 'known' || verdict === 'first-seen';

/**
 * Compare one person's published devices with what this device remembers.
 *
 * Voice pins one device at a time, because devices arrive in a call one at a
 * time. Here a person's whole list arrives at once, so meeting somebody for the
 * first time pins everything they have at that moment; otherwise their laptop
 * would be "first seen" and their phone, a line later, an alarming "new device".
 * After that first meeting, anything unfamiliar waits for a person to accept it.
 */
export async function assessDevices(
  store: IdentityStore,
  userId: string,
  devices: DeviceKey[],
): Promise<AssessedDevice[]> {
  const firstMeeting = (await store.devices(userId)).length === 0;
  const out: AssessedDevice[] = [];

  for (const device of devices) {
    if (device.userId !== userId || !(await verifyDevice(device))) {
      out.push({ device, fingerprint: '', verdict: 'invalid' });
      continue;
    }
    const fingerprint = await fingerprintOf(fromBase64(device.identityKey));
    const known = await store.get(userId, device.deviceId);

    let verdict: PinVerdict;
    if (known !== null) verdict = known === fingerprint ? 'known' : 'changed';
    else if (firstMeeting) {
      await store.set(userId, device.deviceId, fingerprint);
      verdict = 'first-seen';
    } else verdict = 'new-device';

    out.push({ device, fingerprint, verdict });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Sealing and opening.
 * ------------------------------------------------------------------ */

/** What is inside a sealed message. Versioned so replies and files can be added. */
export interface DmBody {
  v: 1;
  text: string;
}

export interface SealedMessage {
  senderDeviceId: string;
  iv: string;
  ciphertext: string;
  keys: DmWrappedKey[];
}

interface Direction {
  dmId: string;
  senderId: string;
  senderDeviceId: string;
  recipientId: string;
  recipientDeviceId: string;
}

/**
 * The key one device uses to lock a message key for another, from an ECDH
 * agreement between their two long-lived DM keys. `info` names the direction
 * and the conversation, so the key A uses towards B is not the one B uses
 * towards A, and neither is any use in a different conversation.
 *
 * Only the two devices can compute it. That is also what makes a message
 * authentic: a copy that opens under this key was made by somebody holding one
 * of the two private keys, and the recipient knows it was not them.
 */
async function wrappingKey(d: Direction, privateKey: CryptoKey, theirDmKey: Uint8Array): Promise<CryptoKey> {
  const theirs = await subtle().importKey(
    'spki',
    theirDmKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = await subtle().deriveBits({ name: 'ECDH', public: theirs }, privateKey, 256);
  const material = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: text.encode(d.dmId) as BufferSource,
      info: concatLabelled(WRAP_CONTEXT, d.senderId, d.senderDeviceId, d.recipientId, d.recipientDeviceId) as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Binds a wrapped key to one body, so it cannot be moved onto another message. */
const wrapAad = (d: Direction, bodyIv: Uint8Array): Uint8Array =>
  concatLabelled(WRAP_CONTEXT, d.dmId, d.senderId, d.senderDeviceId, d.recipientId, d.recipientDeviceId, bodyIv);

const bodyAad = (dmId: string, senderId: string, senderDeviceId: string): Uint8Array =>
  concatLabelled(BODY_CONTEXT, dmId, senderId, senderDeviceId);

/**
 * Seal a message for a list of devices. The caller decides the list, and must
 * only pass devices it trusts: this function locks to whatever it is given.
 */
export async function sealMessage(options: {
  dmId: string;
  sender: DmDevice;
  body: DmBody;
  recipients: DeviceKey[];
}): Promise<SealedMessage> {
  const { dmId, sender } = options;
  const senderDeviceId = sender.identity.deviceId;

  const messageKeyBytes = randomBytes(32);
  const messageKey = await subtle().importKey('raw', messageKeyBytes as BufferSource, 'AES-GCM', false, ['encrypt']);
  const iv = randomBytes(12);
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: bodyAad(dmId, sender.userId, senderDeviceId) as BufferSource },
    messageKey,
    text.encode(JSON.stringify(options.body)) as BufferSource,
  );

  const keys: DmWrappedKey[] = [];
  for (const recipient of options.recipients) {
    const direction: Direction = {
      dmId,
      senderId: sender.userId,
      senderDeviceId,
      recipientId: recipient.userId,
      recipientDeviceId: recipient.deviceId,
    };
    const key = await wrappingKey(direction, sender.dm.privateKey, fromBase64(recipient.dmKey));
    const wrapIv = randomBytes(12);
    const wrapped = await subtle().encrypt(
      { name: 'AES-GCM', iv: wrapIv as BufferSource, additionalData: wrapAad(direction, iv) as BufferSource },
      key,
      messageKeyBytes as BufferSource,
    );
    keys.push({
      userId: recipient.userId,
      deviceId: recipient.deviceId,
      iv: toBase64(wrapIv),
      key: toBase64(new Uint8Array(wrapped)),
    });
  }

  return { senderDeviceId, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(sealed)), keys };
}

export type OpenResult =
  | { ok: true; body: DmBody }
  /** No copy of the key was made for this device: it is newer than the message, or was not accepted. */
  | { ok: false; reason: 'no-key' }
  /** A copy exists and does not open. Tampering, or a key that is not the one claimed. */
  | { ok: false; reason: 'failed' };

/**
 * Open a message. Never throws: a hostile server can send anything it likes,
 * and every one of those is a message that does not open, not a crash.
 */
export async function openMessage(options: {
  dmId: string;
  self: DmDevice;
  authorId: string;
  senderDevice: DeviceKey;
  iv: string;
  ciphertext: string;
  keys: DmWrappedKey[];
}): Promise<OpenResult> {
  const { dmId, self, senderDevice } = options;
  const mine = options.keys.find(
    (key) => key.userId === self.userId && key.deviceId === self.identity.deviceId,
  );
  if (!mine) return { ok: false, reason: 'no-key' };
  // The device has to belong to the person the server says wrote this.
  if (senderDevice.userId !== options.authorId) return { ok: false, reason: 'failed' };

  try {
    const direction: Direction = {
      dmId,
      senderId: options.authorId,
      senderDeviceId: senderDevice.deviceId,
      recipientId: self.userId,
      recipientDeviceId: self.identity.deviceId,
    };
    const bodyIv = fromBase64(options.iv);
    const key = await wrappingKey(direction, self.dm.privateKey, fromBase64(senderDevice.dmKey));
    const messageKeyBytes = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(mine.iv) as BufferSource, additionalData: wrapAad(direction, bodyIv) as BufferSource },
      key,
      fromBase64(mine.key) as BufferSource,
    );
    const messageKey = await subtle().importKey('raw', messageKeyBytes, 'AES-GCM', false, ['decrypt']);
    const opened = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: bodyIv as BufferSource,
        additionalData: bodyAad(dmId, options.authorId, senderDevice.deviceId) as BufferSource,
      },
      messageKey,
      fromBase64(options.ciphertext) as BufferSource,
    );
    const body = JSON.parse(new TextDecoder().decode(opened)) as Partial<DmBody>;
    if (body.v !== 1 || typeof body.text !== 'string') return { ok: false, reason: 'failed' };
    return { ok: true, body: { v: 1, text: body.text } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
