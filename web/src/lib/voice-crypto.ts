/**
 * Voice key agreement. The part the server is never allowed to see.
 *
 * The scaffolding this replaces had our own server generate the voice key and
 * hand it out over the gateway. A server that makes the key has the key, so
 * anyone who owns the box decrypts every call while the interface claims the
 * opposite. GAMEPLAN.md section 1b, finding 1, and non-negotiable 8.
 *
 * What happens instead, in one paragraph: every device holds a long-lived
 * identity key it generated itself. Joining a call, it makes a throwaway key
 * for that call only and signs it with the identity key. Each participant
 * invents their *own* media key and encrypts a copy of it separately for each
 * other participant, using a secret only those two devices can compute. The
 * server relays those copies without being able to open any of them. Anyone
 * joining or leaving forces everyone to invent a new media key, so a person
 * who leaves cannot hear what is said afterwards and a person who joins
 * cannot decrypt what was recorded before.
 *
 * Why not MLS: at twenty-five people its scaling advantage buys nothing, and
 * the browser options are an unaudited TypeScript library or a Rust build
 * compiled to WebAssembly. This is standard WebCrypto primitives and no new
 * dependencies, which means it can be read end to end in one sitting.
 * Discord's DAVE protocol is the reference for the parts that are borrowed:
 * per-sender keys, rotation on every membership change, verification codes.
 *
 * This file is deliberately in the web workspace and imports nothing from
 * `shared`. Key handling that the server cannot import is key handling the
 * server cannot accidentally acquire.
 *
 * Everything here is WebCrypto, which Node also has, so all of it is covered
 * by `npm test` — including a test that plays a server trying to cheat.
 */

/* ------------------------------------------------------------------ *
 * Domain separation.
 *
 * Every derivation and every signature is bound to a string naming exactly
 * what it is for. Without that, a value produced for one purpose can be
 * replayed into another.
 * ------------------------------------------------------------------ */

const SIGN_CONTEXT = 'scryproof/voice/announce/v1';
const WRAP_CONTEXT = 'scryproof/voice/wrap/v1';
const CODE_CONTEXT = 'scryproof/voice/code/v1';

/** How hard it is to grind a verification code. See `verificationCode`. */
const CODE_ITERATIONS = 600_000;

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const text = new TextEncoder();

/* ------------------------------------------------------------------ *
 * Bytes and base64. No Buffer in a browser, and the wire is JSON.
 * ------------------------------------------------------------------ */

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/* ------------------------------------------------------------------ *
 * Device identity.
 * ------------------------------------------------------------------ */

export interface DeviceIdentity {
  /** Random, per device. Two browsers on one account are two devices. */
  deviceId: string;
  /** Non-extractable. JavaScript can sign with it; nothing can read it out. */
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
  /** A short hash of the public key. This is what members compare. */
  fingerprint: string;
}

/**
 * Make a device identity. The private key is created non-extractable, so a
 * later bug — or a compromised page served by our own box — can use it but
 * cannot copy it out and send it anywhere.
 */
export async function createDeviceIdentity(
  deviceId: string = crypto.randomUUID(),
): Promise<DeviceIdentity> {
  const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
  return describeIdentity(deviceId, pair.privateKey, pair.publicKey);
}

async function describeIdentity(
  deviceId: string,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<DeviceIdentity> {
  const publicKeyBytes = new Uint8Array(await subtle().exportKey('spki', publicKey));
  return {
    deviceId,
    privateKey,
    publicKey,
    publicKeyBytes,
    fingerprint: await fingerprintOf(publicKeyBytes),
  };
}

/** Rebuild the public half of an identity as it arrives from the gateway. */
export function importIdentityKey(publicKeyBytes: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey(
    'spki',
    publicKeyBytes as BufferSource,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
}

/** Lowercase hex, sixteen bytes of SHA-256. Enough to name a key, short enough to show. */
export async function fingerprintOf(publicKeyBytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', publicKeyBytes as BufferSource));
  return Array.from(digest.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/* ------------------------------------------------------------------ *
 * Joining a call.
 * ------------------------------------------------------------------ */

/** What a device publishes when it joins. Relayed by the server, opaque to it. */
export interface Announcement {
  userId: string;
  deviceId: string;
  /** SPKI, base64. The long-lived identity key. */
  identityKey: string;
  /** SPKI, base64. Thrown away when the call ends. */
  callKey: string;
  /** The identity key's signature over everything above, base64. */
  signature: string;
}

export interface CallKeypair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
}

/** A throwaway ECDH keypair for one call. Never reused, never stored. */
export async function createCallKeypair(): Promise<CallKeypair> {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    publicKeyBytes: new Uint8Array(await subtle().exportKey('spki', pair.publicKey)),
  };
}

/**
 * The bytes an announcement signs over. Binding the call, the user and the
 * device is what stops a signed announcement being replayed into another call
 * or attributed to somebody else.
 */
function announcementBytes(callId: string, a: Omit<Announcement, 'signature'>): Uint8Array {
  return concatLabelled(
    SIGN_CONTEXT,
    callId,
    a.userId,
    a.deviceId,
    fromBase64(a.identityKey),
    fromBase64(a.callKey),
  );
}

export async function announce(
  callId: string,
  userId: string,
  identity: DeviceIdentity,
  call: CallKeypair,
): Promise<Announcement> {
  const unsigned = {
    userId,
    deviceId: identity.deviceId,
    identityKey: toBase64(identity.publicKeyBytes),
    callKey: toBase64(call.publicKeyBytes),
  };

  const signature = await subtle().sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    announcementBytes(callId, unsigned) as BufferSource,
  );

  return { ...unsigned, signature: toBase64(new Uint8Array(signature)) };
}

/**
 * Check that an announcement was signed by the identity key it carries.
 *
 * This alone does not prove who somebody is — a server that substitutes both
 * keys can produce a valid signature over its own pair. It proves that the
 * call key and the identity key belong together, which is what makes
 * substitution *visible*: to swap the call key the server must also swap the
 * identity key, and `pinIdentity` below has seen the real one before.
 */
export async function verifyAnnouncement(callId: string, a: Announcement): Promise<boolean> {
  try {
    const key = await importIdentityKey(fromBase64(a.identityKey));
    return await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(a.signature) as BufferSource,
      announcementBytes(callId, a) as BufferSource,
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Identity pinning.
 * ------------------------------------------------------------------ */

export type PinVerdict =
  /** Never seen this device before. Normal the first time, worth showing. */
  | 'first-seen'
  /** Same key as last time. Silence is correct here. */
  | 'known'
  /** The key changed. Either they reinstalled, or somebody is in the middle. */
  | 'changed'
  /**
   * Somebody we already know, on a device we have never seen. Usually a new
   * phone. It is also exactly what a relay would present to get round the
   * `changed` warning: pins are per device, so a made-up device id has no old
   * key to disagree with. Without this verdict an impostor arrives as a
   * harmless-looking `first-seen`. Held until a person accepts it, like
   * `changed`, and never pinned automatically.
   */
  | 'new-device';

/** Verdicts that stop keys moving until a person has looked. */
export const needsConsent = (verdict: PinVerdict): boolean =>
  verdict === 'changed' || verdict === 'new-device';

/** Storage for what this device has seen. IndexedDB in the browser, a map in tests. */
export interface IdentityStore {
  get(userId: string, deviceId: string): Promise<string | null>;
  set(userId: string, deviceId: string, fingerprint: string): Promise<void>;
  /** Every device id pinned for this person. */
  devices(userId: string): Promise<string[]>;
}

export class MemoryIdentityStore implements IdentityStore {
  private readonly seen = new Map<string, string>();

  async get(userId: string, deviceId: string): Promise<string | null> {
    return this.seen.get(`${userId}:${deviceId}`) ?? null;
  }

  async set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    this.seen.set(`${userId}:${deviceId}`, fingerprint);
  }

  async devices(userId: string): Promise<string[]> {
    const prefix = `${userId}:`;
    return [...this.seen.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  }
}

/**
 * Compare an identity key against what this device remembers.
 *
 * A changed key is never written over the old one here. That decision belongs
 * to the person, after a warning that names them, because silently accepting
 * a new key is precisely the move a server in the middle needs.
 */
export async function pinIdentity(
  store: IdentityStore,
  userId: string,
  deviceId: string,
  fingerprint: string,
): Promise<PinVerdict> {
  const known = await store.get(userId, deviceId);
  if (known !== null) return known === fingerprint ? 'known' : 'changed';

  // Never seen this device. Whether that is unremarkable depends on whether we
  // have seen this *person*.
  if ((await store.devices(userId)).length > 0) return 'new-device';

  await store.set(userId, deviceId, fingerprint);
  return 'first-seen';
}

/** Accept a changed key or a new device. Only ever called because somebody clicked through a warning. */
export async function acceptIdentityChange(
  store: IdentityStore,
  userId: string,
  deviceId: string,
  fingerprint: string,
): Promise<void> {
  await store.set(userId, deviceId, fingerprint);
}

/* ------------------------------------------------------------------ *
 * Sender keys.
 * ------------------------------------------------------------------ */

/** One participant's media key for one epoch, encrypted for exactly one other. */
export interface WrappedKey {
  epoch: number;
  senderId: string;
  senderDeviceId: string;
  recipientId: string;
  recipientDeviceId: string;
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
}

/**
 * The pairwise key that wraps a media key, from an ECDH agreement between the
 * two call keys.
 *
 * `info` names the direction, so the key A uses to send to B is not the key B
 * uses to send to A, and neither survives into another call or another epoch.
 */
async function wrappingKey(
  callId: string,
  epoch: number,
  senderId: string,
  recipientId: string,
  privateKey: CryptoKey,
  theirPublicKeyBytes: Uint8Array,
): Promise<CryptoKey> {
  const theirs = await subtle().importKey(
    'spki',
    theirPublicKeyBytes as BufferSource,
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
      salt: text.encode(callId) as BufferSource,
      info: concatLabelled(WRAP_CONTEXT, String(epoch), senderId, recipientId) as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * What the wrapped key is bound to. Authenticated but not encrypted, so a
 * copy meant for one person at one epoch cannot be replayed at another, or
 * handed to somebody else and still open.
 */
function wrapAad(callId: string, key: Omit<WrappedKey, 'iv' | 'ciphertext'>): Uint8Array {
  return concatLabelled(
    WRAP_CONTEXT,
    callId,
    String(key.epoch),
    key.senderId,
    key.senderDeviceId,
    key.recipientId,
    key.recipientDeviceId,
  );
}

/** A fresh media key: 32 random bytes, invented on this device and nowhere else. */
export const createMediaKey = (): Uint8Array => randomBytes(32);

export async function wrapMediaKey(options: {
  callId: string;
  epoch: number;
  mediaKey: Uint8Array;
  senderId: string;
  senderDeviceId: string;
  senderCallKey: CryptoKey;
  recipient: Announcement;
}): Promise<WrappedKey> {
  const header = {
    epoch: options.epoch,
    senderId: options.senderId,
    senderDeviceId: options.senderDeviceId,
    recipientId: options.recipient.userId,
    recipientDeviceId: options.recipient.deviceId,
  };

  const key = await wrappingKey(
    options.callId,
    options.epoch,
    header.senderId,
    header.recipientId,
    options.senderCallKey,
    fromBase64(options.recipient.callKey),
  );

  const iv = randomBytes(12);
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: wrapAad(options.callId, header) as BufferSource },
    key,
    options.mediaKey as BufferSource,
  );

  return { ...header, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(sealed)) };
}

/**
 * Open a wrapped key. Returns null rather than throwing on anything that does
 * not open: a call is a place where a hostile relay gets to send whatever it
 * likes, and every one of those is a normal event to be ignored, not an error
 * that tears the call down.
 */
export async function unwrapMediaKey(options: {
  callId: string;
  wrapped: WrappedKey;
  recipientId: string;
  recipientDeviceId: string;
  recipientCallKey: CryptoKey;
  sender: Announcement;
}): Promise<Uint8Array | null> {
  const { wrapped } = options;

  // Refuse anything addressed to somebody else, or claiming to be from a
  // device other than the one that signed this call's announcement.
  if (wrapped.recipientId !== options.recipientId) return null;
  if (wrapped.recipientDeviceId !== options.recipientDeviceId) return null;
  if (wrapped.senderId !== options.sender.userId) return null;
  if (wrapped.senderDeviceId !== options.sender.deviceId) return null;

  try {
    const key = await wrappingKey(
      options.callId,
      wrapped.epoch,
      wrapped.senderId,
      wrapped.recipientId,
      options.recipientCallKey,
      fromBase64(options.sender.callKey),
    );

    const opened = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(wrapped.iv) as BufferSource,
        additionalData: wrapAad(options.callId, wrapped) as BufferSource,
      },
      key,
      fromBase64(wrapped.ciphertext) as BufferSource,
    );

    const mediaKey = new Uint8Array(opened);
    return mediaKey.length === 32 ? mediaKey : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * The verification code.
 * ------------------------------------------------------------------ */

/**
 * The number everyone reads aloud once, in the connection panel.
 *
 * It is derived from the identity keys of everybody in the call, so a server
 * that substituted anyone's key produces a different number on their screen
 * than on everyone else's. Saying it out loud in a voice the others recognise
 * is the one check no server can forge.
 *
 * PBKDF2 with 600,000 iterations is doing real work here. Twenty digits is
 * about sixty-six bits, but an attacker does not need to match the digits by
 * luck — they can generate identity keys until one produces the digits their
 * victims expect. A slow derivation is what makes that search cost real time.
 * Discord's DAVE uses scrypt for the same reason; WebCrypto has no scrypt, so
 * this is the closest thing it does have. Roughly half a second, once per
 * membership change.
 */
export async function verificationCode(
  callId: string,
  members: { userId: string; fingerprint: string }[],
): Promise<string> {
  // Sorted, so every participant derives the same number from the same set.
  const ordered = [...members].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const material = concatLabelled(
    CODE_CONTEXT,
    ...ordered.flatMap((member) => [member.userId, member.fingerprint]),
  );

  const base = await subtle().importKey('raw', material as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: text.encode(`${CODE_CONTEXT}:${callId}`) as BufferSource,
      iterations: CODE_ITERATIONS,
    },
    base,
    128,
  );

  // Twenty digits, in four groups of five, because that is how people read a
  // number aloud without losing their place. Taking the whole 128 bits modulo
  // 10^20 rather than a digit per byte keeps every bit in play; the bias from
  // 2^128 not dividing evenly is far below anything that matters.
  let value = 0n;
  for (const byte of new Uint8Array(bits)) value = (value << 8n) | BigInt(byte);
  const digits = (value % 100_000_000_000_000_000_000n).toString().padStart(20, '0');

  return digits.replace(/(\d{5})(?=\d)/g, '$1 ');
}

/* ------------------------------------------------------------------ *
 * The call itself.
 * ------------------------------------------------------------------ */

export interface Participant {
  announcement: Announcement;
  fingerprint: string;
  verdict: PinVerdict;
  /** True once their announcement's signature has been checked. */
  signed: boolean;
}

export interface JoinResult {
  /** Rejected outright: the signature did not match the key it carried. */
  rejected: Announcement[];
  /** Accepted but worth showing: first contact, or a key that changed. */
  flagged: Participant[];
}

/**
 * One call's key state: who is in it, what epoch it is on, and which media
 * key belongs to whom.
 *
 * Every membership change increments the epoch and throws away the media key
 * from the previous one. That is what makes leaving mean something: a device
 * that has left holds a key for an epoch nobody encrypts with any more.
 */
export class VoiceCall {
  readonly callId: string;
  readonly userId: string;
  readonly identity: DeviceIdentity;
  readonly callKeys: CallKeypair;

  private readonly pins: IdentityStore;
  private readonly participants = new Map<string, Participant>();
  /** Signed correctly, but waiting for a person to say they expected this. */
  private readonly held = new Map<string, Participant>();
  private readonly receivedKeys = new Map<string, Uint8Array>();

  private currentEpoch = 0;
  private myKey: Uint8Array;

  constructor(options: {
    callId: string;
    userId: string;
    identity: DeviceIdentity;
    callKeys: CallKeypair;
    pins: IdentityStore;
  }) {
    this.callId = options.callId;
    this.userId = options.userId;
    this.identity = options.identity;
    this.callKeys = options.callKeys;
    this.pins = options.pins;
    this.myKey = createMediaKey();
  }

  get epoch(): number {
    return this.currentEpoch;
  }

  /** This device's media key for the current epoch. */
  get mediaKey(): Uint8Array {
    return this.myKey;
  }

  /** Everyone whose announcement has been accepted, this device included. */
  get members(): Participant[] {
    return [...this.participants.values()];
  }

  private static seat(userId: string, deviceId: string): string {
    return `${userId}:${deviceId}`;
  }

  /**
   * Take the announcements the gateway relayed. Anything whose signature does
   * not check is dropped; anything whose identity key is new or changed is
   * returned for the interface to say out loud.
   */
  async admit(announcements: Announcement[]): Promise<JoinResult> {
    const rejected: Announcement[] = [];
    const flagged: Participant[] = [];

    for (const announcement of announcements) {
      if (!(await verifyAnnouncement(this.callId, announcement))) {
        rejected.push(announcement);
        continue;
      }

      const fingerprint = await fingerprintOf(fromBase64(announcement.identityKey));
      const verdict =
        announcement.userId === this.userId && announcement.deviceId === this.identity.deviceId
          ? 'known' // our own device, not something to warn about
          : await pinIdentity(this.pins, announcement.userId, announcement.deviceId, fingerprint);

      const participant: Participant = { announcement, fingerprint, verdict, signed: true };
      const seat = VoiceCall.seat(announcement.userId, announcement.deviceId);
      if (verdict !== 'known') flagged.push(participant);

      // A changed key or an unexpected device gets no key from us and has none
      // of theirs used, until someone approves it. They are not a participant:
      // `distribute` skips them, `accept` refuses them, and the verification
      // code does not include them.
      if (needsConsent(verdict)) {
        this.participants.delete(seat);
        this.held.set(seat, participant);
        continue;
      }
      this.held.delete(seat);
      this.participants.set(seat, participant);
    }

    return { rejected, flagged };
  }

  /** Devices whose identity needs a person's say-so before any key moves. */
  get awaitingConsent(): Participant[] {
    return [...this.held.values()];
  }

  /**
   * Somebody looked at the warning and said yes. The new key is pinned and the
   * device becomes an ordinary participant. The caller then sends it a key.
   */
  async approve(userId: string, deviceId: string): Promise<Participant | null> {
    const seat = VoiceCall.seat(userId, deviceId);
    const participant = this.held.get(seat);
    if (!participant) return null;

    await acceptIdentityChange(this.pins, userId, deviceId, participant.fingerprint);
    this.held.delete(seat);
    const approved: Participant = { ...participant, verdict: 'known' };
    this.participants.set(seat, approved);
    return approved;
  }

  /** Drop someone who left. */
  remove(userId: string, deviceId: string): void {
    this.held.delete(VoiceCall.seat(userId, deviceId));
    this.participants.delete(VoiceCall.seat(userId, deviceId));
    this.receivedKeys.delete(VoiceCall.seat(userId, deviceId));
  }

  /**
   * Move to a new epoch with a brand new media key.
   *
   * Called whenever the membership changes, in either direction. Keys from
   * earlier epochs are dropped, so a recording made before this moment cannot
   * be decrypted with anything handed out after it.
   *
   * The epoch number itself comes from the gateway's membership event, because
   * everyone has to be counting the same thing: a device that joins halfway
   * through cannot know how many changes it missed, and a key labelled with
   * the wrong epoch does not open. That hands the server the ordering, which
   * it has anyway — it decides what to relay. What it does not get is any
   * influence on the key:
   *
   *   - The key is generated here and is new every time, whatever number
   *     arrives, so a replayed "nothing changed" cannot keep a departed
   *     member's key alive.
   *   - The epoch never goes backwards. A stale number still produces a
   *     rotation, one past where we already were.
   *
   * If the server does lie about the number, participants derive different
   * labels, the authenticated data disagrees, and keys stop opening. The call
   * fails closed and shows people as unheard rather than quietly continuing
   * on a key somebody else chose.
   */
  rotate(epoch = this.currentEpoch + 1): number {
    this.currentEpoch = Math.max(epoch, this.currentEpoch + 1);
    this.myKey = createMediaKey();
    this.receivedKeys.clear();
    return this.currentEpoch;
  }

  /**
   * A copy of this device's media key for every other participant, each one
   * openable by exactly one of them.
   */
  async distribute(): Promise<WrappedKey[]> {
    const wrapped: WrappedKey[] = [];
    for (const participant of this.participants.values()) {
      const { userId, deviceId } = participant.announcement;
      if (userId === this.userId && deviceId === this.identity.deviceId) continue;

      wrapped.push(
        await wrapMediaKey({
          callId: this.callId,
          epoch: this.currentEpoch,
          mediaKey: this.myKey,
          senderId: this.userId,
          senderDeviceId: this.identity.deviceId,
          senderCallKey: this.callKeys.privateKey,
          recipient: participant.announcement,
        }),
      );
    }
    return wrapped;
  }

  /**
   * Take a wrapped key off the wire. Returns the sender's media key when it
   * opens and null when it does not, which is the ordinary outcome for
   * anything the relay made up.
   */
  async accept(wrapped: WrappedKey): Promise<Uint8Array | null> {
    if (wrapped.epoch !== this.currentEpoch) return null;

    const sender = this.participants.get(VoiceCall.seat(wrapped.senderId, wrapped.senderDeviceId));
    if (!sender) return null;

    const mediaKey = await unwrapMediaKey({
      callId: this.callId,
      wrapped,
      recipientId: this.userId,
      recipientDeviceId: this.identity.deviceId,
      recipientCallKey: this.callKeys.privateKey,
      sender: sender.announcement,
    });
    if (!mediaKey) return null;

    const seat = VoiceCall.seat(wrapped.senderId, wrapped.senderDeviceId);
    const existing = this.receivedKeys.get(seat);
    // A second, different key for the same sender at the same epoch is a relay
    // trying its luck. The first one that opened is the one that counts.
    if (existing && !equalBytes(existing, mediaKey)) return null;

    this.receivedKeys.set(seat, mediaKey);
    return mediaKey;
  }

  /** The media key held for one participant, if any has arrived. */
  keyFor(userId: string, deviceId: string): Uint8Array | null {
    return this.receivedKeys.get(VoiceCall.seat(userId, deviceId)) ?? null;
  }

  /**
   * Participants with no media key yet. The interface shows these as unable
   * to be heard rather than pretending the call is complete — a listener the
   * members cannot see is a listener without a key.
   */
  get silent(): Participant[] {
    return this.members.filter(
      (member) =>
        !(
          member.announcement.userId === this.userId &&
          member.announcement.deviceId === this.identity.deviceId
        ) && !this.receivedKeys.has(VoiceCall.seat(member.announcement.userId, member.announcement.deviceId)),
    );
  }

  /** The number to read aloud. Derived from who is in the call, not from the epoch. */
  verificationCode(): Promise<string> {
    return verificationCode(
      this.callId,
      this.members.map((member) => ({
        userId: member.announcement.userId,
        fingerprint: member.fingerprint,
      })),
    );
  }
}
