/**
 * Which devices a person on this device has let in.
 *
 * Two memories, deliberately kept apart. The pin store (`voice-identity.ts`)
 * remembers every device key this device has *seen*, so a key that changes
 * later is caught. It is filled in on first sight, which makes it useless as a
 * permission: a server that invents a device gets it pinned, and from then on
 * it looks like anybody else. So a second store holds the devices a *person*
 * here accepted, and channels hand keys only to those. First sight never
 * writes to it, and neither does anything else automatic.
 *
 * A device is accepted when any of these holds:
 *  - it is this device (same person, same device id, same fingerprint);
 *  - its fingerprint is in the accepted store for that person and device;
 *  - it carries a valid vouch from a device of the same person that is itself
 *    accepted. Vouching chains, so the pass repeats until nothing changes. A
 *    key that has *changed* is never rescued this way, the same rule
 *    `assessDevices` follows.
 *
 * `docs/channel-e2ee.md`.
 */

import { type AssessedDevice, verifyEndorsement } from './dm-crypto';

/** The devices a person on this device has let in, keyed by person and device. */
export interface AcceptanceStore {
  get(userId: string, deviceId: string): Promise<string | null>;
  set(userId: string, deviceId: string, fingerprint: string): Promise<void>;
}

/** This device, in the terms `admit` needs to recognise its own seat. */
export interface OwnDevice {
  userId: string;
  deviceId: string;
  fingerprint: string;
}

export interface AdmittedDevice extends AssessedDevice {
  /**
   * A person on this device let this device in. What keys follow. Deliberately
   * not the same as `isTrusted`: pinned on first sight is seen, not accepted.
   */
  accepted: boolean;
}

/** The store, this device, or the store plus a vouch: anything else is not acceptance. */
async function letIn(store: AcceptanceStore, self: OwnDevice, entry: AssessedDevice): Promise<boolean> {
  if (entry.verdict === 'invalid') return false;
  const { userId, deviceId } = entry.device;
  if (userId === self.userId && deviceId === self.deviceId && entry.fingerprint === self.fingerprint) return true;
  // A changed key presents a fingerprint the store does not hold, so it fails
  // here whatever the store says about the old one.
  return (await store.get(userId, deviceId)) === entry.fingerprint;
}

/**
 * Mark which of a person's devices were let in by someone here, writing down
 * any that a vouch let in. The verdicts themselves are left alone: this
 * decides what may be given a key, not what to warn about.
 */
export async function admit(
  store: AcceptanceStore,
  self: OwnDevice,
  assessed: readonly AssessedDevice[],
): Promise<AdmittedDevice[]> {
  const out: AdmittedDevice[] = [];
  for (const entry of assessed) {
    out.push({ ...entry, accepted: await letIn(store, self, entry) });
  }

  // A vouch chains: the laptop vouches for the recovery phrase, the phrase for
  // the next laptop. The list is in no particular order, so go round until a
  // pass changes nothing. `assessDevices` does the same for its own verdicts.
  for (let changed = true; changed; ) {
    changed = false;
    for (const entry of out) {
      // A changed or unreadable key is never rescued by a vouch.
      if (entry.accepted || entry.verdict === 'changed' || entry.verdict === 'invalid') continue;
      const claim = entry.device.endorsedBy;
      if (!claim) continue;
      const endorser = out.find(
        (other) => other.accepted && other.device.userId === entry.device.userId && other.device.deviceId === claim.deviceId,
      );
      if (!endorser || !(await verifyEndorsement(entry.device, endorser.device))) continue;
      await store.set(entry.device.userId, entry.device.deviceId, entry.fingerprint);
      entry.accepted = true;
      changed = true;
    }
  }
  return out;
}
