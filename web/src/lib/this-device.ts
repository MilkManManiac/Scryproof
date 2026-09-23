/**
 * This browser's keys, shared by DMs and encrypted channels: the identity key
 * voice made, the DM key beside it, and, on a device a recovery phrase has
 * been typed into, the phrase's key. Made once and published once.
 */

import { api } from './api';
import { type DmDevice, type DmOpener, createDmKeypair, describeDevice, describeDmKeypair } from './dm-crypto';
import { createDeviceIdentity } from './voice-crypto';
import { type IndexedDbIdentityStore, loadDeviceIdentity, loadDmKeypair } from './voice-identity';

/**
 * One device per browser, made once. React's development mode runs effects
 * twice, and two set-ups racing each other made two identities, published both,
 * and left IndexedDB holding half of each. The promise is shared so the second
 * caller waits for the first instead of starting again.
 */
const devices = new Map<string, Promise<DmDevice>>();

export function deviceFor(userId: string, pins: IndexedDbIdentityStore): Promise<DmDevice> {
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

/** The device for whoever is signed in, once `deviceFor` has been asked. */
export const deviceIfMade = (userId: string): Promise<DmDevice> | null => devices.get(userId) ?? null;

let recoveryOpener: DmOpener | null = null;

/** Set by the DM screens when a phrase's words are typed in here, or cleared. */
export const setRecoveryOpener = (opener: DmOpener | null): void => {
  recoveryOpener = opener;
};

export const recoveryOpenerFor = (userId: string): DmOpener | null =>
  recoveryOpener && recoveryOpener.userId === userId ? recoveryOpener : null;
