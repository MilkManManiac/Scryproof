/**
 * The Activities hints as a page in an older Windows shell, wired to the bridge its shell put on
 * window. `lib/desktop.ts` reads the bridge once when it loads, so each wiring
 * file is its own process with one kind of shell.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

for (const [name, value] of [['platform', 'Win32'], ['maxTouchPoints', 0]] as const) {
  Object.defineProperty(globalThis.navigator, name, { value, configurable: true });
}

const window = new EventTarget();
Object.assign(window, {
  scryproofDesktop: { server: 'https://scryproof.test', gateway: 'wss://scryproof.test/ws' },
});
(globalThis as { window?: unknown }).window = window;

const desktop = await import('../lib/desktop');

describe('Activities hints in an older Windows shell', () => {
  it('sends no platform, and keeps the Windows sound hint', () => {
    assert.match(desktop.activityShareHint(), /Enable sound only if it will not capture your call/);
    assert.match(desktop.updateDownloadFollowUp(), /run the installer/);
  });
});
