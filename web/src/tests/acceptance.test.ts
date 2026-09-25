/**
 * "Seen before" against "let in". The pin store and the accepted store look
 * alike from here on purpose: the difference is who writes to them, and this
 * file is the rule that keeps them apart. Real keys, real vouches, a fake
 * store.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import type { DeviceKey } from '@scryproof/shared';

import { type AcceptanceStore, admit } from '../lib/acceptance';
import { type DmDevice, createDmKeypair, describeDevice, endorse } from '../lib/dm-crypto';
import { carriedOverPins } from '../lib/voice-identity';
import { createDeviceIdentity } from '../lib/voice-crypto';

class MemoryAccepted implements AcceptanceStore {
  private readonly held = new Map<string, string>();
  get(userId: string, deviceId: string): Promise<string | null> {
    return Promise.resolve(this.held.get(`${userId}:${deviceId}`) ?? null);
  }
  set(userId: string, deviceId: string, fingerprint: string): Promise<void> {
    this.held.set(`${userId}:${deviceId}`, fingerprint);
    return Promise.resolve();
  }
  /** For the test's own reading of what was written. */
  fingerprintOf(userId: string, deviceId: string): string | null {
    return this.held.get(`${userId}:${deviceId}`) ?? null;
  }
}

async function makeDevice(userId: string, label: string): Promise<{ device: DmDevice; published: DeviceKey }> {
  const device: DmDevice = { userId, identity: await createDeviceIdentity(label), dm: await createDmKeypair() };
  return { device, published: await describeDevice(device) };
}

const [alice, charlie, dana] = await Promise.all([
  makeDevice('alice', 'alice-laptop'),
  makeDevice('charlie', 'charlie-laptop'),
  makeDevice('dana', 'dana-laptop'),
]);
const [charliePhone, danaPhone, charlieTablet] = await Promise.all([
  makeDevice('charlie', 'charlie-phone'),
  makeDevice('dana', 'dana-phone'),
  makeDevice('charlie', 'charlie-tablet'),
]);

/** What this device is, as `admit` needs it. */
const self = {
  userId: 'alice',
  deviceId: alice.published.deviceId,
  fingerprint: alice.device.identity.fingerprint,
};

/** A device as `assessDevices` would hand it over. */
const assessedAs = (published: DeviceKey, verdict: 'known' | 'first-seen' | 'new-device' | 'changed') => ({
  device: published,
  fingerprint: verdict === 'changed' ? 'a-different-key' : '',
  verdict,
});

let store: MemoryAccepted;

beforeEach(() => {
  store = new MemoryAccepted();
});

describe('acceptance', () => {
  test('a device pinned on first sight is not accepted by it', async () => {
    const [charlie1] = await admit(store, self, [
      { device: charlie.published, fingerprint: charlie.device.identity.fingerprint, verdict: 'first-seen' },
    ]);
    assert.equal(charlie1?.accepted, false, 'the server inventing a person is enough to be accepted');
    assert.equal(store.fingerprintOf('charlie', charlie.published.deviceId), null, 'first sight wrote an acceptance');
  });

  test('this device is accepted without anybody saying so', async () => {
    const [mine] = await admit(store, self, [
      { device: alice.published, fingerprint: alice.device.identity.fingerprint, verdict: 'new-device' },
    ]);
    assert.equal(mine?.accepted, true);
  });

  test('a fingerprint somebody accepted is accepted, and a changed one is not', async () => {
    store.set('charlie', charlie.published.deviceId, charlie.device.identity.fingerprint);
    const [same, changed] = await admit(store, self, [
      { device: charlie.published, fingerprint: charlie.device.identity.fingerprint, verdict: 'known' },
      assessedAs(charlie.published, 'changed'),
    ]);
    assert.equal(same?.accepted, true);
    assert.equal(changed?.accepted, false);
  });

  test('a vouch from an accepted device is acceptance, and is written down', async () => {
    store.set('charlie', charlie.published.deviceId, charlie.device.identity.fingerprint);
    const phone: DeviceKey = {
      ...charliePhone.published,
      endorsedBy: await endorse('charlie', charlie.device.identity, charliePhone.published),
    };
    const [laptop, held] = await admit(store, self, [
      { device: charlie.published, fingerprint: charlie.device.identity.fingerprint, verdict: 'known' },
      { device: phone, fingerprint: charliePhone.device.identity.fingerprint, verdict: 'new-device' },
    ]);
    assert.equal(laptop?.accepted, true);
    assert.equal(held?.accepted, true, 'a device vouched for by an accepted device was not let in');
    assert.equal(store.fingerprintOf('charlie', phone.deviceId), charliePhone.device.identity.fingerprint);
  });

  test('a vouch from a device that was only pinned is not acceptance', async () => {
    const phone: DeviceKey = {
      ...danaPhone.published,
      endorsedBy: await endorse('dana', dana.device.identity, danaPhone.published),
    };
    // Dana's laptop is in the list as a device this client has only seen.
    const [, held] = await admit(store, self, [
      { device: dana.published, fingerprint: dana.device.identity.fingerprint, verdict: 'known' },
      { device: phone, fingerprint: danaPhone.device.identity.fingerprint, verdict: 'new-device' },
    ]);
    assert.equal(held?.accepted, false, 'a vouch from a pinned device was treated as somebody saying yes');
    assert.equal(store.fingerprintOf('dana', phone.deviceId), null);
  });

  test('a vouch chains through other vouched devices', async () => {
    store.set('charlie', charlie.published.deviceId, charlie.device.identity.fingerprint);
    const phone: DeviceKey = {
      ...charliePhone.published,
      endorsedBy: await endorse('charlie', charlie.device.identity, charliePhone.published),
    };
    const tablet: DeviceKey = {
      ...charlieTablet.published,
      endorsedBy: await endorse('charlie', charliePhone.device.identity, charlieTablet.published),
    };
    const [, , chain] = await admit(store, self, [
      { device: charlie.published, fingerprint: charlie.device.identity.fingerprint, verdict: 'known' },
      { device: phone, fingerprint: charliePhone.device.identity.fingerprint, verdict: 'new-device' },
      { device: tablet, fingerprint: charlieTablet.device.identity.fingerprint, verdict: 'new-device' },
    ]);
    assert.equal(chain?.accepted, true, 'a device vouched for by a vouched device was not let in');
  });

  test('a vouch cannot rescue a changed key', async () => {
    store.set('charlie', charlie.published.deviceId, charlie.device.identity.fingerprint);
    const phone: DeviceKey = {
      ...charliePhone.published,
      endorsedBy: await endorse('charlie', charlie.device.identity, charliePhone.published),
    };
    const [, held] = await admit(store, self, [
      { device: charlie.published, fingerprint: charlie.device.identity.fingerprint, verdict: 'known' },
      { device: phone, fingerprint: 'a-different-key', verdict: 'changed' },
    ]);
    assert.equal(held?.accepted, false, 'a changed key was rescued by a vouch');
  });
});

/**
 * The one-time copy of existing pins into the accepted store, as the part of
 * the upgrade that can be tested without a browser. The IndexedDB wiring itself
 * (the versionchange transaction) has no test environment here.
 */
describe('the upgrade carries pins over', () => {
  const pins = [
    { key: 'bob:bob-phone', fingerprint: 'aaaa' },
    { key: 'bob:bob-laptop', fingerprint: 'bbbb' },
  ];

  test('everything pinned before carries over', () => {
    assert.deepEqual(carriedOverPins(3, pins), pins);
  });

  test('a fresh database has nothing to carry', () => {
    assert.deepEqual(carriedOverPins(0, []), []);
  });

  test('a row that is not a person and a device is left behind', () => {
    assert.deepEqual(carriedOverPins(3, [{ key: 'nonsense', fingerprint: 'cccc' }]), []);
  });
});
