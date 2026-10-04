/**
 * The Activities hints as a page in a Linux shell, wired to the bridge its shell put on
 * window. `lib/desktop.ts` reads the bridge once when it loads, so each wiring
 * file is its own process with one kind of shell.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

for (const [name, value] of [['platform', 'Linux x86_64'], ['maxTouchPoints', 0]] as const) {
  Object.defineProperty(globalThis.navigator, name, { value, configurable: true });
}

const window = new EventTarget();
Object.assign(window, {
  scryproofDesktop: { server: 'https://scryproof.test', gateway: 'wss://scryproof.test/ws', platform: 'linux' },
});
(globalThis as { window?: unknown }).window = window;

const desktop = await import('../lib/desktop');

describe('Activities hints in a Linux shell', () => {
  it('does not offer share sound, which only Windows can capture', () => {
    assert.match(desktop.activityShareHint(), /no sound/);
    assert.doesNotMatch(desktop.activityShareHint(), /Enable sound/);
    assert.match(desktop.updateDownloadFollowUp(), /run the installer/);
  });
});
