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

import {
  type DeviceIdentity,
  type IdentityStore,
  fingerprintOf,
} from './voice-crypto';

const DB_NAME = 'scryproof';
/** 2 added the DM key store. Every store is created here, so any version can upgrade. */
const DB_VERSION = 2;
const IDENTITY_STORE = 'device-identity';
const PINS_STORE = 'identity-pins';
const DM_KEY_STORE = 'dm-key';

interface StoredIdentity {
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) db.createObjectStore(IDENTITY_STORE);
      if (!db.objectStoreNames.contains(PINS_STORE)) db.createObjectStore(PINS_STORE);
      if (!db.objectStoreNames.contains(DM_KEY_STORE)) db.createObjectStore(DM_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open.'));
  });
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
