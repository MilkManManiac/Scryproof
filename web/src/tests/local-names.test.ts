/**
 * Names just for you: a per-device rename that never leaves this browser.
 *
 * The module keeps its map in a module-level variable, loaded once at
 * import, the same shape as `voice-prefs.ts`. Each test imports a fresh
 * copy (a unique query string defeats the module cache) so one test's
 * storage cannot leak into another's.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
}

function setStorage(storage: unknown): void {
  (globalThis as { localStorage?: unknown }).localStorage = storage;
}

async function fresh(tag: string) {
  return import(`../lib/local-names.ts?${tag}-${Math.random()}`) as Promise<typeof import('../lib/local-names')>;
}

describe('local names', () => {
  it('has no name for anyone until one is set', async () => {
    setStorage(fakeStorage());
    const { localNames } = await fresh('empty');
    assert.equal(localNames.get('alex'), undefined);
  });

  it('sets a name, reads it back, and saves it', async () => {
    const storage = fakeStorage();
    setStorage(storage);
    const { localNames } = await fresh('set');
    localNames.set('alex', '  Lampshade  ');
    assert.equal(localNames.get('alex'), 'Lampshade');
    assert.deepEqual(JSON.parse(storage.getItem('scryproof.local-names.v1') as string), { alex: 'Lampshade' });
  });

  it('clears a name when set to empty (or all spaces)', async () => {
    setStorage(fakeStorage());
    const { localNames } = await fresh('clear');
    localNames.set('alex', 'Lampshade');
    localNames.set('alex', '   ');
    assert.equal(localNames.get('alex'), undefined);
  });

  it('loads a name already in storage', async () => {
    setStorage(fakeStorage({ 'scryproof.local-names.v1': JSON.stringify({ alex: 'Lampshade' }) }));
    const { localNames, nameFor } = await fresh('load');
    assert.equal(localNames.get('alex'), 'Lampshade');
    assert.equal(nameFor('alex', 'Alex Real'), 'Lampshade');
    assert.equal(nameFor('bo', 'Bo Real'), 'Bo Real');
  });

  it('tells subscribers when a name changes, and stops once unsubscribed', async () => {
    setStorage(fakeStorage());
    const { localNames } = await fresh('subscribe');
    let calls = 0;
    const unsubscribe = localNames.subscribe(() => {
      calls += 1;
    });
    localNames.set('alex', 'Lampshade');
    assert.equal(calls, 1);
    unsubscribe();
    localNames.set('alex', 'Someone else');
    assert.equal(calls, 1);
  });

  it('still holds the name for this tab when storage refuses to be written to', async () => {
    setStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('storage refused');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    const { localNames } = await fresh('refuses');
    localNames.set('alex', 'Lampshade');
    assert.equal(localNames.get('alex'), 'Lampshade');
  });

  it('ignores junk left in storage rather than throwing', async () => {
    setStorage(fakeStorage({ 'scryproof.local-names.v1': 'not json' }));
    const { localNames } = await fresh('junk');
    assert.equal(localNames.get('alex'), undefined);
  });
});
