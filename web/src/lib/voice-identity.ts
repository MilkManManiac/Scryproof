/**
 * Where a device keeps its identity key and what it remembers about other
 * people's.
 *
 * The private half of the identity key is generated non-extractable and
 * stored as a `CryptoKey` object, not as bytes. IndexedDB can hold one because
 * `CryptoKey` is structured-cloneable, and the browser hands it back as the
 * same opaque handle: this page can sign with it and cannot read it out, which
 * is the whole point. Serialising it to bytes "so it can be backed up" would
 * undo that, so there is deliberately no export here.
 *
 * Losing this key means the device is treated as new — everyone sees a
 * first-contact notice for it. That is the correct outcome, and much better
 * than a key that can be copied off the machine.
 *
 * GAMEPLAN.md section 1b, finding 1.
 */

import type { AcceptanceStore } from './acceptance';
import { type ChannelMemoryStore, type Remembered, mergeRemembered } from './channel-memory';
import {
  type DeviceIdentity,
  type IdentityStore,
  fingerprintOf,
} from './voice-crypto';

const DB_NAME = 'scryproof';
/**
 * 2 added the DM key store, 3 the recovery key, 4 the accepted store and the
 * channel memory. Every store is created here, so any version can upgrade.
 */
const DB_VERSION = 4;
const IDENTITY_STORE = 'device-identity';
const PINS_STORE = 'identity-pins';
const DM_KEY_STORE = 'dm-key';
const RECOVERY_STORE = 'dm-recovery';
/**
 * The devices a person on this device has let in. Separate from the pins,
 * which are "seen before": a device pinned on first sight was never accepted
 * by anybody, and keys follow acceptance only. See `acceptance.ts`.
 */
const ACCEPTED_STORE = 'accepted-identities';
/** `channel-memory.ts`: which channels this device has seen encrypted. */
const CHANNEL_MEMORY_STORE = 'channel-memory';

interface StoredIdentity {
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (upgrade) => {
      const db = request.result;
      const fresh = !db.objectStoreNames.contains(ACCEPTED_STORE);
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE);
      if (!db.objectStoreNames.contains(PINS_STORE)) db.createObjectStore(PINS_STORE);
      if (!db.objectStoreNames.contains(DM_KEY_STORE)) db.createObjectStore(DM_KEY_STORE);
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) db.createObjectStore(RECOVERY_STORE);
      if (fresh) db.createObjectStore(ACCEPTED_STORE);
      if (!db.objectStoreNames.contains(CHANNEL_MEMORY_STORE)) db.createObjectStore(CHANNEL_MEMORY_STORE);
      // The one time this upgrade happens, everything already pinned carries
      // over as accepted. Everyone this device had ever met is somebody a
      // person here dealt with before, and channels must keep working for them
      // on the day this ships. From then on, only an acceptance writes here.
      const upgradeTransaction = request.transaction;
      if (fresh && upgrade.oldVersion >= 1 && upgradeTransaction) {
        carryOverPins(upgradeTransaction, upgrade.oldVersion);
      }
    };
    request.onblocked = () => {
      // Another tab is holding the old version open and the upgrade is waiting
      // for it. Say so rather than appear to hang; that tab closes its own
      // connection when it sees the version change (`onversionchange` below).
      console.warn('Scryproof is updating its local database. Close other tabs of the app if this takes a while.');
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer version is opened somewhere else (another tab, after an
      // update): let go of this connection so that upgrade can go through.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open.'));
  });
}

/**
 * Which pins are copied into the accepted store, as the pure part of the
 * upgrade above (`carriedOverPins` is exported for its test). A database made
 * before the pin store existed has nothing to carry, and neither has a fresh
 * one: from the first install on, a device is let in one at a time.
 */
export function carriedOverPins(
  fromVersion: number,
  pins: readonly { key: string; fingerprint: string }[],
): { key: string; fingerprint: string }[] {
  if (fromVersion < 1) return [];
  return pins.filter((pin) => pin.key.includes(':') && typeof pin.fingerprint === 'string' && pin.fingerprint.length > 0);
}

function carryOverPins(transaction: IDBTransaction, fromVersion: number): void {
  const pins = transaction.objectStore(PINS_STORE);
  const accepted = transaction.objectStore(ACCEPTED_STORE);
  const heldKeys = pins.getAllKeys();
  const heldValues = pins.getAll();
  let keys: IDBValidKey[] | null = null;
  let values: string[] | null = null;
  // Both reads finish inside the upgrade transaction, and the copy is written
  // from the second one's own task: an upgrade transaction commits as soon as
  // it is left idle, so nothing here may wait around before writing.
  const copy = (): void => {
    const allKeys = keys;
    const allValues = values;
    if (allKeys === null || allValues === null) return;
    const held = allKeys.map((key, index) => ({ key: String(key), fingerprint: allValues[index] ?? '' }));
    for (const pin of carriedOverPins(fromVersion, held)) accepted.put(pin.fingerprint, pin.key);
  };
  heldKeys.onsuccess = () => {
    keys = heldKeys.result;
    copy();
  };
  heldValues.onsuccess = () => {
    values = heldValues.result;
    copy();
  };
}

function run<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await open();
  try {
    return await work(db.transaction(name, mode).objectStore(name));
  } finally {
    db.close();
  }
}

/**
 * The identity key for this browser on this machine, created on first use.
 *
 * Takes the generator as an argument so the caller decides what an identity
 * is; in practice that is `createDeviceIdentity` from `voice-crypto.ts`.
 */
export async function loadDeviceIdentity(
  create: (deviceId?: string) => Promise<DeviceIdentity>,
): Promise<DeviceIdentity> {
  const existing = await withStore(IDENTITY_STORE, 'readonly', (store) =>
    run<StoredIdentity | undefined>(store.get('self')),
  );

  if (existing) {
    const publicKeyBytes = new Uint8Array(
      await globalThis.crypto.subtle.exportKey('spki', existing.publicKey),
    );
    return {
      deviceId: existing.deviceId,
      privateKey: existing.privateKey,
      publicKey: existing.publicKey,
      publicKeyBytes,
      fingerprint: await fingerprintOf(publicKeyBytes),
    };
  }

  const identity = await create();
  await withStore(IDENTITY_STORE, 'readwrite', (store) =>
    run(
      store.put(
        {
          deviceId: identity.deviceId,
          privateKey: identity.privateKey,
          publicKey: identity.publicKey,
        } satisfies StoredIdentity,
        'self',
      ),
    ),
  );
  return identity;
}

/**
 * This device's long-lived DM key, created on first use and kept the same way
 * as the identity key: as a non-extractable `CryptoKey`, never as bytes.
 *
 * Generic over the keypair for the same reason `loadDeviceIdentity` takes its
 * generator: what a DM key is belongs to `dm-crypto.ts`, not to storage.
 */
export async function loadDmKeypair<T extends { privateKey: CryptoKey; publicKey: CryptoKey }>(
  create: () => Promise<T>,
  describe: (privateKey: CryptoKey, publicKey: CryptoKey) => Promise<T>,
): Promise<T> {
  const existing = await withStore(DM_KEY_STORE, 'readonly', (store) =>
    run<{ privateKey: CryptoKey; publicKey: CryptoKey } | undefined>(store.get('self')),
  );
  if (existing) return describe(existing.privateKey, existing.publicKey);

  const pair = await create();
  await withStore(DM_KEY_STORE, 'readwrite', (store) =>
    run(store.put({ privateKey: pair.privateKey, publicKey: pair.publicKey }, 'self')),
  );
  return pair;
}

/**
 * The key a recovery phrase rebuilt, kept so the words are typed once per
 * device and not once per visit. Only the half that opens messages, and only
 * as a handle: the words themselves are never stored, and the phrase's signing
 * key is used once, at the moment the words are typed, and dropped.
 */
export interface StoredRecoveryKey {
  deviceId: string;
  privateKey: CryptoKey;
}

export const loadRecoveryKey = (userId: string): Promise<StoredRecoveryKey | null> =>
  withStore(RECOVERY_STORE, 'readonly', async (store) => (await run<StoredRecoveryKey | undefined>(store.get(userId))) ?? null);

export const saveRecoveryKey = (userId: string, key: StoredRecoveryKey): Promise<void> =>
  withStore(RECOVERY_STORE, 'readwrite', async (store) => {
    await run(store.put(key, userId));
  });

/**
 * What this device has seen of everyone else's identity keys.
 *
 * Writes only ever happen on first contact or after somebody has been shown a
 * warning and chosen to accept it. Nothing in here updates a key quietly.
 */
export class IndexedDbIdentityStore implements IdentityStore {
  async get(userId: string, deviceId: string): Promise<string | null> {
    const value = await withStore(PINS_STORE, 'readonly', (store) =>
      run<string | undefined>(store.get(`${userId}:${deviceId}`)),
    );
    return value ?? null;
  }

  async set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    await withStore(PINS_STORE, 'readwrite', (store) =>
      run(store.put(fingerprint, `${userId}:${deviceId}`)),
    );
  }

  async devices(userId: string): Promise<string[]> {
    // Keys are "userId:deviceId", so everything for one person is a contiguous range.
    const prefix = `${userId}:`;
    const keys = await withStore(PINS_STORE, 'readonly', (store) =>
      run<IDBValidKey[]>(store.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`))),
    );
    return keys.map((key) => String(key).slice(prefix.length));
  }
}

/**
 * The devices a person on this device has let in.
 *
 * Same shape as the pins, and deliberately a separate store: a pin means
 * "seen before", which happens on its own the first time a device is listed,
 * and acceptance means somebody here said yes. Keys only ever follow the
 * second. `acceptance.ts` decides which is which.
 */
export class IndexedDbAcceptedStore implements AcceptanceStore {
  async get(userId: string, deviceId: string): Promise<string | null> {
    const value = await withStore(ACCEPTED_STORE, 'readonly', (store) =>
      run<string | undefined>(store.get(`${userId}:${deviceId}`)),
    );
    return value ?? null;
  }

  async set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    await withStore(ACCEPTED_STORE, 'readwrite', (store) =>
      run(store.put(fingerprint, `${userId}:${deviceId}`)),
    );
  }
}

/**
 * A person on this device said yes to this exact key somewhere else, in a
 * conversation's device warning or a call's. That is the same decision as
 * "Let in" on a channel's lock panel, so channels count it too. Best effort:
 * if it is not stored, the device still shows as waiting in each channel and
 * one click there does the same.
 */
export function letInEverywhere(userId: string, deviceId: string, fingerprint: string): Promise<void> {
  return new IndexedDbAcceptedStore().set(userId, deviceId, fingerprint).catch(() => undefined);
}

/**
 * The channel memory in IndexedDB: one small record per channel, keyed by
 * channel id. Read all at once at sign-in, and merged rather than overwritten
 * on the way back in, so a copy that is older than what is held can never
 * turn encryption off or move an epoch back.
 */
export class IndexedDbChannelMemory implements ChannelMemoryStore {
  async all(): Promise<Record<string, Remembered>> {
    const db = await open();
    try {
      const store = db.transaction(CHANNEL_MEMORY_STORE, 'readonly').objectStore(CHANNEL_MEMORY_STORE);
      // Both reads are asked for before either answer is waited on: a
      // transaction finishes as soon as nothing is outstanding.
      const [keys, values] = await Promise.all([
        run<IDBValidKey[]>(store.getAllKeys()),
        run<Remembered[]>(store.getAll()),
      ]);
      const entries: [string, Remembered][] = [];
      keys.forEach((key, index) => {
        const entry = values[index];
        if (entry) entries.push([String(key), entry]);
      });
      return Object.fromEntries(entries);
    } finally {
      db.close();
    }
  }

  async remember(channelId: string, entry: Remembered): Promise<void> {
    await withStore(CHANNEL_MEMORY_STORE, 'readwrite', async (store) => {
      const held = await run<Remembered | undefined>(store.get(channelId));
      await run(store.put(mergeRemembered(held, entry), channelId));
    });
  }
}
