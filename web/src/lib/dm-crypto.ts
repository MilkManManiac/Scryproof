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

import type { DeviceEndorsement, DeviceKey, DmWrappedKey } from '@scryproof/shared';

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
/** Must match `ENDORSE_CONTEXT` in server/src/routes/dms.ts. */
const ENDORSE_CONTEXT = 'scryproof/dm/endorse/v1';
const WRAP_CONTEXT = 'scryproof/dm/wrap/v1';
/**
 * Since 2026-09-23 a copy of a message key is also bound to a hash of the
 * sealed body. Before, in a group, anyone handed the key could lock different
 * words under it and a server could pass them off with the sender's own
 * copies, which open fine: a forgery in the sender's name. A copy now opens
 * only for the exact bytes the sender sealed.
 */
const WRAP_CONTEXT_V2 = 'scryproof/dm/wrap/v2';
const BODY_CONTEXT = 'scryproof/dm/body/v1';
const FILE_CONTEXT = 'scryproof/dm/file/v1';

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
 * One device vouching for another.
 * ------------------------------------------------------------------ */

const endorsementBytes = (userId: string, endorserDeviceId: string, deviceId: string, identityKey: Uint8Array): Uint8Array =>
  concatLabelled(ENDORSE_CONTEXT, userId, endorserDeviceId, deviceId, identityKey);

/**
 * "This other device is mine too", signed. What is signed is the other
 * device's identity key, so the vouching cannot be moved onto a different key
 * later, and the person's id, so it cannot be moved onto a different person.
 */
export async function endorse(
  userId: string,
  endorser: Pick<DeviceIdentity, 'deviceId' | 'privateKey'>,
  target: Pick<DeviceKey, 'deviceId' | 'identityKey'>,
): Promise<DeviceEndorsement> {
  const signature = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    endorser.privateKey,
    endorsementBytes(userId, endorser.deviceId, target.deviceId, fromBase64(target.identityKey)) as BufferSource,
  );
  return { deviceId: endorser.deviceId, signature: toBase64(new Uint8Array(signature)) };
}

export async function verifyEndorsement(device: DeviceKey, endorser: DeviceKey): Promise<boolean> {
  const claim = device.endorsedBy;
  if (!claim || claim.deviceId !== endorser.deviceId || endorser.userId !== device.userId) return false;
  try {
    const key = await importIdentityKey(fromBase64(endorser.identityKey));
    return await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(claim.signature) as BufferSource,
      endorsementBytes(device.userId, endorser.deviceId, device.deviceId, fromBase64(device.identityKey)) as BufferSource,
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
 * After that first meeting, anything unfamiliar waits for a person to accept it,
 * with one exception: a device vouched for by one already believed. That is
 * what a recovery phrase buys. The laptop vouches for the phrase, the phrase
 * vouches for the next laptop, and nobody's friends are asked anything. A key
 * that has *changed* is never rescued this way.
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

  // Vouching can chain, and the list is in no particular order, so go round
  // until a pass changes nothing.
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of out) {
      if (entry.verdict !== 'new-device' || !entry.device.endorsedBy) continue;
      const endorser = out.find(
        (other) => other.device.deviceId === entry.device.endorsedBy?.deviceId && isTrusted(other.verdict),
      );
      if (!endorser || !(await verifyEndorsement(entry.device, endorser.device))) continue;
      await store.set(userId, entry.device.deviceId, entry.fingerprint);
      entry.verdict = 'first-seen';
      changed = true;
    }
  }
  return out;
}

/**
 * Who gets a copy of a message key: the trusted devices of the people in the
 * conversation, this person's own other devices among them.
 *
 * A device whose owner is not a member gets nothing, however trusted it is and
 * however long it has been on the server's list. That is the whole point: the
 * server both stores the device list and decides who is in the conversation,
 * and today it hands a device of somebody outside the conversation a copy of
 * every message. The ones it left out are answered separately so the
 * conversation can say so out loud: a device listed for a non-member is
 * exactly what that attack looks like from here.
 *
 * What this does not stop: a server that lies about the member list too. Then
 * the stranger appears in the conversation as a member, which everyone can
 * see, and the fix is a person reading that list rather than code.
 */
export function recipientsFor(
  known: AssessedDevice[],
  memberIds: ReadonlySet<string>,
): { recipients: DeviceKey[]; outsiders: AssessedDevice[] } {
  const recipients: DeviceKey[] = [];
  const outsiders: AssessedDevice[] = [];
  for (const entry of known) {
    // A device whose signature does not hold is not a device at all; it is
    // never offered for acceptance either, so it is not reported here.
    if (entry.verdict === 'invalid') continue;
    if (!memberIds.has(entry.device.userId)) {
      outsiders.push(entry);
    } else if (isTrusted(entry.verdict)) {
      recipients.push(entry.device);
    }
  }
  return { recipients, outsiders };
}

/**
 * The device a row says it came from, when nothing needs accepting first.
 *
 * Messages from a device nobody here has accepted are still drawn, with a mark
 * and the warning above the conversation. A reaction is not drawn at all: a
 * thumbs-up from a device that might not be the person's is not their
 * thumbs-up, and counting it puts words in their mouth.
 */
export function believedDevice(
  known: AssessedDevice[],
  userId: string,
  deviceId: string,
): AssessedDevice | null {
  const entry = known.find((other) => other.device.userId === userId && other.device.deviceId === deviceId);
  return entry && isTrusted(entry.verdict) ? entry : null;
}

/* ------------------------------------------------------------------ *
 * Sealing and opening.
 * ------------------------------------------------------------------ */

/**
 * What is inside a sealed message. Everything a person would call content is
 * in here, including which message a reply answers and which emoji a reaction
 * is: the server is told only that a row is a reaction, and to what.
 *
 * `at` is the sender's own clock at the moment they wrote it, in milliseconds
 * since the epoch. The seal binds the conversation, the author and the device
 * but no time, so a server could show an old message as new; the sender's own
 * stamp is the one time it cannot change. It is optional because the version
 * never changed: an older client reads a body and takes the fields it knows,
 * ignoring anything else (see `parseBody`), so a message from a newer one
 * carries the time and still opens on the old one.
 */
export type DmBody =
  | { v: 1; kind?: undefined; text: string; replyTo?: string; files?: DmFileRef[]; at?: number }
  | { v: 1; kind: 'reaction'; target: string; emoji: string; at?: number };

/**
 * A file, as the message that carries it describes it. The server holds the
 * locked bytes under `id` and nothing else: the name, the type and the key
 * that opens it are all in here, inside the seal.
 */
export interface DmFileRef {
  id: string;
  name: string;
  type: string;
  /** Of the file itself, not of the locked copy. */
  size: number;
  /** base64. A key used for this one file and never again. */
  key: string;
  iv: string;
}

function parseFiles(raw: unknown): DmFileRef[] | null {
  if (!Array.isArray(raw) || raw.length > 10) return null;
  const files: DmFileRef[] = [];
  for (const entry of raw as Record<string, unknown>[]) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { id, name, type, size, key, iv } = entry;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof type !== 'string') return null;
    if (typeof size !== 'number' || typeof key !== 'string' || typeof iv !== 'string') return null;
    files.push({ id, name: name.slice(0, 200), type: type.slice(0, 100), size, key, iv });
  }
  return files;
}

/** Only the shapes above come out. Anything else is treated as a message that did not open. */
function parseBody(raw: unknown): DmBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (body.v !== 1) return null;
  // The sender's clock, or nothing. A time that is not a number is dropped
  // rather than refused: the rest of the body is still theirs, and a message
  // from a future client should not stop opening here.
  const at = typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : null;
  if (body.kind === 'reaction') {
    if (typeof body.target !== 'string' || typeof body.emoji !== 'string') return null;
    if (body.emoji.length === 0 || body.emoji.length > 32) return null;
    const reaction: DmBody = { v: 1, kind: 'reaction', target: body.target, emoji: body.emoji };
    if (at !== null) reaction.at = at;
    return reaction;
  }
  if (body.kind !== undefined || typeof body.text !== 'string') return null;
  const out: DmBody = { v: 1, text: body.text };
  if (at !== null) out.at = at;
  if (typeof body.replyTo === 'string') out.replyTo = body.replyTo;
  if (body.files !== undefined) {
    const files = parseFiles(body.files);
    if (!files) return null;
    if (files.length > 0) out.files = files;
  }
  return out;
}

/** As much of a stored message as the two rules below need. Both are null on a message that was deleted or never had a body. */
export interface SealedRow {
  id: string;
  iv: string | null;
  ciphertext: string | null;
}

/**
 * The ids of messages that repeat sealed bytes an earlier message in the same
 * conversation already used: the same body again, or the same one-time IV
 * again.
 *
 * The seal binds the conversation, the author and the device but no order,
 * so a server can serve an old message again under a new id, or put "no"
 * before "yes". It cannot change the sealed bytes without leaving something
 * that does not open, so matching bytes are how a repeat is recognised.
 *
 * What this catches is narrow: a repeat whose original is also in `rows`,
 * which is only what this tab has been handed for this conversation since it
 * loaded. It does not catch a repeat whose original the server leaves out,
 * never sends, or sends to a tab that has since reloaded; to a device that
 * never saw the first copy, the repeat is simply a message. Nor does it put
 * messages in order: ids come from the server, so "the earliest copy" is the
 * server's say. The signed time inside the seal (`timeLooksMoved`) is what
 * shows a reader a message that is older than where it sits.
 */
export function replayedIds(rows: SealedRow[]): string[] {
  const firstIv = new Map<string, string>();
  const firstBody = new Map<string, string>();
  const replayed: string[] = [];
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    // A row with no sealed bytes is a message that never opened, and there is
    // nothing for it to be a repeat of.
    if (!row.iv || !row.ciphertext) continue;
    if (firstIv.has(row.iv) || firstBody.has(row.ciphertext)) {
      replayed.push(row.id);
      continue;
    }
    firstIv.set(row.iv, row.id);
    firstBody.set(row.ciphertext, row.id);
  }
  return replayed;
}

/** Past this, the sender's clock and the server's timestamp are worth telling apart. */
export const CLOCK_SLACK_MS = 5 * 60_000;

/**
 * Whether a message's own time is far enough from the time the server gave it
 * that the reader should be told. `sealedAt` is the sender's clock from inside
 * the seal, null on messages sealed before it existed.
 */
export function timeLooksMoved(sealedAt: number | null, createdAt: string): boolean {
  if (sealedAt === null) return false;
  const stamped = Date.parse(createdAt);
  return Number.isFinite(stamped) && Math.abs(sealedAt - stamped) > CLOCK_SLACK_MS;
}

/* ------------------------------------------------------------------ *
 * Files.
 * ------------------------------------------------------------------ */

const fileAad = (dmId: string): Uint8Array => concatLabelled(FILE_CONTEXT, dmId);

/**
 * Lock a file under a key of its own. The key goes into the message body, so
 * whoever can open the message can open the file and nobody else can. The
 * locked bytes are what gets uploaded.
 */
export async function sealFile(
  dmId: string,
  bytes: Uint8Array,
): Promise<{ sealed: Uint8Array; key: string; iv: string }> {
  const keyBytes = randomBytes(32);
  const iv = randomBytes(12);
  const key = await subtle().importKey('raw', keyBytes as BufferSource, 'AES-GCM', false, ['encrypt']);
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: fileAad(dmId) as BufferSource },
    key,
    bytes as BufferSource,
  );
  return { sealed: new Uint8Array(sealed), key: toBase64(keyBytes), iv: toBase64(iv) };
}

/** Null when the bytes are not what the message said they would be. */
export async function openFile(dmId: string, ref: Pick<DmFileRef, 'key' | 'iv'>, sealed: Uint8Array): Promise<Uint8Array | null> {
  try {
    const key = await subtle().importKey('raw', fromBase64(ref.key) as BufferSource, 'AES-GCM', false, ['decrypt']);
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(ref.iv) as BufferSource, additionalData: fileAad(dmId) as BufferSource },
      key,
      sealed as BufferSource,
    );
    return new Uint8Array(opened);
  } catch {
    return null;
  }
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

/** Binds a wrapped key to one body, so it cannot be moved onto another message. The first format: see WRAP_CONTEXT_V2. */
const wrapAadV1 = (d: Direction, bodyIv: Uint8Array): Uint8Array =>
  concatLabelled(WRAP_CONTEXT, d.dmId, d.senderId, d.senderDeviceId, d.recipientId, d.recipientDeviceId, bodyIv);

/** Binds a wrapped key to one body and its exact sealed bytes. */
const wrapAadV2 = (d: Direction, bodyIv: Uint8Array, bodyHash: Uint8Array): Uint8Array =>
  concatLabelled(WRAP_CONTEXT_V2, d.dmId, d.senderId, d.senderDeviceId, d.recipientId, d.recipientDeviceId, bodyIv, bodyHash);

const hashOf = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await subtle().digest('SHA-256', bytes as BufferSource));

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

  const bodyHash = await hashOf(new Uint8Array(sealed));
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
      { name: 'AES-GCM', iv: wrapIv as BufferSource, additionalData: wrapAadV2(direction, iv, bodyHash) as BufferSource },
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
  /**
   * `legacy`: the copy was made in the first format, which does not bind it
   * to these exact bytes. Fine between two people; in a group it means the
   * words cannot be proven to be the sender's.
   */
  | { ok: true; body: DmBody; legacy: boolean }
  /** No copy of the key was made for this device: it is newer than the message, or was not accepted. */
  | { ok: false; reason: 'no-key' }
  /** A copy exists and does not open. Tampering, or a key that is not the one claimed. */
  | { ok: false; reason: 'failed' };

/** Whatever can open a copy: a real device, or the one a recovery phrase stands for. */
export interface DmOpener {
  userId: string;
  identity: Pick<DeviceIdentity, 'deviceId'>;
  dm: Pick<DmKeypair, 'privateKey'>;
}

interface Sealed {
  dmId: string;
  self: DmOpener;
  authorId: string;
  senderDevice: DeviceKey;
  iv: string;
  /** The sealed body, base64. Its hash is what a copy of the key is bound to. */
  ciphertext: string;
  keys: DmWrappedKey[];
  /**
   * This person's own devices that are believed. A copy passed on by one of
   * them counts; a copy that says it was passed on by anything else does not.
   */
  ownDevices?: DeviceKey[];
}

/**
 * The message key, from this opener's copy of it. Throws when the copy does
 * not open. A copy is normally made by the device that sent the message. One
 * made later by the reader's own device names that device in `wrappedBy`, and
 * is opened against that device's key instead.
 */
async function messageKeyFor(options: Sealed, mine: DmWrappedKey): Promise<{ bytes: ArrayBuffer; legacy: boolean }> {
  const { dmId, self, senderDevice } = options;
  let wrapper = { userId: options.authorId, device: senderDevice };
  if (mine.wrappedBy) {
    const own = options.ownDevices?.find((entry) => entry.userId === self.userId && entry.deviceId === mine.wrappedBy);
    if (!own) throw new Error('Passed on by a device that is not believed.');
    wrapper = { userId: self.userId, device: own };
  }
  const direction: Direction = {
    dmId,
    senderId: wrapper.userId,
    senderDeviceId: wrapper.device.deviceId,
    recipientId: self.userId,
    recipientDeviceId: self.identity.deviceId,
  };
  const key = await wrappingKey(direction, self.dm.privateKey, fromBase64(wrapper.device.dmKey));
  const bodyIv = fromBase64(options.iv);
  const unwrap = (additionalData: Uint8Array) =>
    subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(mine.iv) as BufferSource, additionalData: additionalData as BufferSource },
      key,
      fromBase64(mine.key) as BufferSource,
    );
  try {
    return { bytes: await unwrap(wrapAadV2(direction, bodyIv, await hashOf(fromBase64(options.ciphertext)))), legacy: false };
  } catch {
    // Made before copies were bound to the body. Throws in turn if it is not that either.
    return { bytes: await unwrap(wrapAadV1(direction, bodyIv)), legacy: true };
  }
}

const copyFor = (options: Pick<Sealed, 'self' | 'keys'>): DmWrappedKey | undefined =>
  options.keys.find((key) => key.userId === options.self.userId && key.deviceId === options.self.identity.deviceId);

/**
 * Pass a message key on to another of this person's devices. Used for the
 * recovery phrase: messages from before it existed were never locked to it,
 * and only a device that can already open them can fix that. Null when this
 * device has no copy that opens.
 */
export async function rewrapKey(
  options: Sealed & { self: DmDevice; target: DeviceKey },
): Promise<{ iv: string; key: string } | null> {
  const { self, target } = options;
  const mine = copyFor(options);
  if (!mine || target.userId !== self.userId || options.senderDevice.userId !== options.authorId) return null;
  try {
    const { bytes: messageKeyBytes, legacy } = await messageKeyFor(options, mine);
    const direction: Direction = {
      dmId: options.dmId,
      senderId: self.userId,
      senderDeviceId: self.identity.deviceId,
      recipientId: target.userId,
      recipientDeviceId: target.deviceId,
    };
    const key = await wrappingKey(direction, self.dm.privateKey, fromBase64(target.dmKey));
    const wrapIv = randomBytes(12);
    // Passed on in the format it came in: a copy in the first format does not
    // become proof of the exact bytes by being passed on.
    const bodyIv = fromBase64(options.iv);
    const additionalData = legacy
      ? wrapAadV1(direction, bodyIv)
      : wrapAadV2(direction, bodyIv, await hashOf(fromBase64(options.ciphertext)));
    const wrapped = await subtle().encrypt(
      { name: 'AES-GCM', iv: wrapIv as BufferSource, additionalData: additionalData as BufferSource },
      key,
      messageKeyBytes,
    );
    return { iv: toBase64(wrapIv), key: toBase64(new Uint8Array(wrapped)) };
  } catch {
    return null;
  }
}

/**
 * Open a message. Never throws: a hostile server can send anything it likes,
 * and every one of those is a message that does not open, not a crash.
 */
export async function openMessage(options: Sealed): Promise<OpenResult> {
  const { dmId, senderDevice } = options;
  const mine = copyFor(options);
  if (!mine) return { ok: false, reason: 'no-key' };
  // The device has to belong to the person the server says wrote this.
  if (senderDevice.userId !== options.authorId) return { ok: false, reason: 'failed' };

  try {
    const bodyIv = fromBase64(options.iv);
    const { bytes: messageKeyBytes, legacy } = await messageKeyFor(options, mine);
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
    const body = parseBody(JSON.parse(new TextDecoder().decode(opened)));
    if (!body) return { ok: false, reason: 'failed' };
    return { ok: true, body, legacy };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
