/**
 * What this device remembers about channels: the rules are one-way, and the
 * database is only a copy of them. No keys here, so the fakes are enough.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { type ChannelMemoryStore, type Remembered, ChannelMemory, claimedSince, earlierSince, mergeRemembered } from '../lib/channel-memory';

class MemoryStore implements ChannelMemoryStore {
  readonly held = new Map<string, Remembered>();
  async all(): Promise<Record<string, Remembered>> {
    return Object.fromEntries(this.held);
  }
  async remember(channelId: string, entry: Remembered): Promise<void> {
    this.held.set(channelId, mergeRemembered(this.held.get(channelId), entry));
  }
}

describe('the early moment wins', () => {
  test('null is earliest, and two moments keep the earlier', () => {
    assert.equal(earlierSince(null, '2026-09-24T12:00:00.000Z'), null);
    assert.equal(earlierSince('2026-09-24T12:00:00.000Z', null), null);
    assert.equal(earlierSince('2026-09-24T12:00:00.000Z', '2026-09-23T12:00:00.000Z'), '2026-09-23T12:00:00.000Z');
    assert.equal(earlierSince('2026-09-23T12:00:00.000Z', '2026-09-24T12:00:00.000Z'), '2026-09-23T12:00:00.000Z');
  });

  test('a moment that cannot be read gives way to one that can', () => {
    assert.equal(earlierSince('not a time', '2026-09-24T12:00:00.000Z'), '2026-09-24T12:00:00.000Z');
    assert.equal(earlierSince('2026-09-24T12:00:00.000Z', 'not a time'), '2026-09-24T12:00:00.000Z');
  });
});

describe('what the server says about when encryption started', () => {
  const NOW = Date.parse('2026-09-24T12:00:00.000Z');
  test('a past moment is kept, and one from the future is brought back to now', () => {
    assert.equal(claimedSince('2026-09-01T00:00:00.000Z', NOW), '2026-09-01T00:00:00.000Z');
    assert.equal(claimedSince('2999-01-01T00:00:00.000Z', NOW), '2026-09-24T12:00:00.000Z');
  });
  test('a missing, unreadable or wrongly typed moment means from the beginning', () => {
    assert.equal(claimedSince(null, NOW), null);
    assert.equal(claimedSince(undefined, NOW), null);
    assert.equal(claimedSince('not a time', NOW), null);
    assert.equal(claimedSince(1790000000000, NOW), null);
  });
});

describe('channel memory', () => {
  const CHANNEL = 'channel-01H00000000000000000';
  const OTHER = 'channel-01H99999999999999999';

  test('a channel seen encrypted stays encrypted, and its start only moves earlier', async () => {
    const memory = new ChannelMemory(new MemoryStore());
    await memory.remember({ id: CHANNEL, encryptedAt: '2026-09-24T12:00:00.000Z' });
    assert.equal(memory.isEncrypted(CHANNEL), true);
    assert.equal(memory.since(CHANNEL), '2026-09-24T12:00:00.000Z');

    // The server says encryption started later, or that it was there all along.
    await memory.remember({ id: CHANNEL, encryptedAt: '2026-09-25T12:00:00.000Z' });
    assert.equal(memory.since(CHANNEL), '2026-09-24T12:00:00.000Z', 'the start of encryption moved later');
    await memory.remember({ id: CHANNEL, encryptedAt: null });
    assert.equal(memory.since(CHANNEL), null, 'a channel made encrypted should have no readable past');

    assert.equal(memory.isEncrypted(OTHER), false);
    assert.equal(memory.since(OTHER), undefined);
  });

  test('the epoch sent under only moves up, in the view and in the store', async () => {
    const store = new MemoryStore();
    const memory = new ChannelMemory(store);
    await memory.raise(CHANNEL, 3);
    await memory.raise(CHANNEL, 1);
    assert.equal(memory.highestEpoch(CHANNEL), 3, 'the epoch moved back');
    assert.equal(store.held.get(CHANNEL)?.highestEpoch, 3);
    assert.equal(memory.highestEpoch(OTHER), 0, 'a channel nothing was sent in starts at nothing');
  });

  test('sending in a channel not yet recorded does not erase its readable past', async () => {
    const memory = new ChannelMemory(new MemoryStore());
    const before = Date.now();
    await memory.raise(CHANNEL, 1);
    const since = memory.since(CHANNEL);
    assert.equal(typeof since, 'string', 'an unrecorded channel was taken as encrypted from the beginning');
    assert.ok(Date.parse(since as string) >= before, 'the assumed start is earlier than the send that raised it');

    // The channel's real start arrives afterwards and replaces the guess.
    await memory.remember({ id: CHANNEL, encryptedAt: '2026-09-01T00:00:00.000Z' });
    assert.equal(memory.since(CHANNEL), '2026-09-01T00:00:00.000Z');
    assert.equal(memory.highestEpoch(CHANNEL), 1);
  });

  test('a copy that is older than what is held cannot turn anything back', () => {
    const late: Remembered = { since: '2026-09-24T12:00:00.000Z', highestEpoch: 5 };
    const early: Remembered = { since: '2026-09-23T12:00:00.000Z', highestEpoch: 2 };
    assert.deepEqual(mergeRemembered(late, early), { since: '2026-09-23T12:00:00.000Z', highestEpoch: 5 });
  });

  test('what was held before the load finishes is kept when it lands', async () => {
    const store = new MemoryStore();
    store.held.set(CHANNEL, { since: null, highestEpoch: 7 });
    const memory = new ChannelMemory(store);
    await memory.remember({ id: CHANNEL, encryptedAt: '2026-09-24T12:00:00.000Z' });
    await memory.load();
    assert.equal(memory.since(CHANNEL), null, 'loading the store undid what this session had already seen');
    assert.equal(memory.highestEpoch(CHANNEL), 7);
  });

  test('the plaintext gate waits for the database, and a broken one falls back to this tab', async () => {
    const store = new MemoryStore();
    store.held.set(CHANNEL, { since: null, highestEpoch: 0 });
    const reloaded = new ChannelMemory(store);
    assert.equal(reloaded.isEncrypted(CHANNEL), false, 'precondition: nothing read yet');
    assert.equal(await reloaded.refusesPlaintext(CHANNEL), true, 'a stored encrypted channel was open to plaintext before the load');
    assert.equal(await reloaded.refusesPlaintext(OTHER), false);

    const broken: ChannelMemoryStore = {
      all: () => Promise.reject(new Error('storage is not available')),
      remember: () => Promise.reject(new Error('storage is not available')),
    };
    const unstored = new ChannelMemory(broken);
    await unstored.remember({ id: CHANNEL, encryptedAt: null });
    assert.equal(await unstored.refusesPlaintext(CHANNEL), true, 'a channel seen encrypted in this tab was let go');
    assert.equal(await unstored.refusesPlaintext(OTHER), false, 'a broken database stopped every plain channel');
  });

  test('forgetting clears the view but not the database', async () => {
    const store = new MemoryStore();
    const memory = new ChannelMemory(store);
    await memory.remember({ id: CHANNEL, encryptedAt: null });
    memory.forget();
    assert.equal(memory.isEncrypted(CHANNEL), false);
    await memory.load();
    assert.equal(memory.isEncrypted(CHANNEL), true, 'the memory was not read again after being dropped');
  });

  test('an epoch write failure blocks sending and retries the same epoch before a reload', async () => {
    const store = new MemoryStore();
    let failing = true;
    const memory = new ChannelMemory({
      all: () => store.all(),
      remember: (id, entry) => failing ? Promise.reject(new Error('disk full')) : store.remember(id, entry),
    });
    await memory.remember({ id: CHANNEL, encryptedAt: null });
    assert.equal(memory.persistenceFailed(CHANNEL), true);
    await assert.rejects(memory.raise(CHANNEL, 2));
    await assert.rejects(memory.raise(CHANNEL, 2));
    failing = false;
    await memory.raise(CHANNEL, 2);
    assert.equal(memory.persistenceFailed(CHANNEL), false);
    const reloaded = new ChannelMemory(store);
    await reloaded.load();
    assert.equal(reloaded.since(CHANNEL), null);
    assert.equal(reloaded.highestEpoch(CHANNEL), 2);
  });

  test('a channel the server says is no longer encrypted is remembered as denied', async () => {
    const memory = new ChannelMemory(new MemoryStore());
    await memory.remember({ id: CHANNEL, encryptedAt: null });
    assert.equal(memory.downgraded(CHANNEL), false);
    memory.noteDowngrade(CHANNEL);
    assert.equal(memory.downgraded(CHANNEL), true);
  });
});
