/**
 * The components as a page on Windows, with the Windows app draws them, wired to the bridge the
 * shell put on window. The unit tests beside this one give the pieces their
 * inputs by hand; this file is what catches a piece being wired to the wrong
 * input. `lib/desktop.ts` reads the bridge once when it loads, so each
 * wiring file is its own process with one kind of shell.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The machine running the tests is not the page under test: Node on a Mac says
// MacIntel, which `lib/desktop.ts` reads when it loads.
for (const [name, value] of [['platform', 'Win32'], ['maxTouchPoints', 0]] as const) {
  Object.defineProperty(globalThis.navigator, name, { value, configurable: true });
}

const server = 'https://scryproof.test';
const window = new EventTarget();
Object.assign(window, {
  scryproofDesktop: {
    server,
    gateway: 'wss://scryproof.test/ws',
    platform: 'win32',
    permissionState: async () => ({ accessibility: false, screen: 'denied' }),
    shellUpdateState: async () => '0.6.1',
    onShellUpdateReady: () => {},
    shellUpdateHow: async () => 'restart',
  },
});
(globalThis as { window?: unknown }).window = window;
const heads: string[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  heads.push(`${init?.method} ${url}`);
  return { status: 200 } as Response;
}) as unknown as typeof fetch;

const desktop = await import('../lib/desktop');
const { PushToTalkKey } = await import('../components/PushToTalkKey');
const { ScreenRecordingNote } = await import('../components/ShareMacNotes');
const { DesktopAppLink } = await import('../components/DesktopAppLink');
const { UpdateBanner } = await import('../components/UpdateBanner');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// Somebody is looking at each of these, as on a screen, so the shell is asked.
for (const store of [desktop.permissionStore, desktop.shellUpdateStore, desktop.downloadStore]) store.subscribe(() => {});
await settle();

const render = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const keyRow = (code: string) => render(createElement(PushToTalkKey, { code, capturing: false, onCapture: () => {} }));
const linkText = () =>
  render(createElement(DesktopAppLink, { className: 'x', children: (system: string) => `Get the desktop app for ${system}` }));

describe('the Windows app, whatever the shell could say about a Mac', () => {
  it('shows no Mac permission explanation and no Mac key warning', () => {
    const html = keyRow('MetaLeft');
    assert.doesNotMatch(html, /Accessibility switch/);
    assert.doesNotMatch(html, /Cmd-Tab/);
    assert.equal(render(createElement(ScreenRecordingNote)), '');
  });

  it('asks for a restart in the update bar', () => {
    const html = render(createElement(UpdateBanner, { inVoice: false }));
    assert.match(html, /Restart to install/);
    assert.doesNotMatch(html, /Download it to update/);
  });

  it('links the Windows installer without asking the server about it', () => {
    assert.deepEqual(heads, []);
    const html = linkText();
    assert.match(html, /Scryproof-Setup\.exe/);
    assert.match(html, /for Windows/);
  });
});
