/**
 * The components as a page in a browser on a Mac draws them: no shell on window. The unit tests beside this one give the pieces their
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
for (const [name, value] of [['platform', 'MacIntel'], ['maxTouchPoints', 0]] as const) {
  Object.defineProperty(globalThis.navigator, name, { value, configurable: true });
}

const server = 'https://scryproof.test';
const window = new EventTarget();
Object.assign(window, { location: { origin: server } });
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

describe('a Mac in a browser, where there is no shell to ask', () => {
  it('warns about a modifier key, and explains no permission', () => {
    const html = keyRow('MetaLeft');
    assert.match(html, /Cmd-Tab/);
    assert.doesNotMatch(html, /Accessibility switch/);
    assert.equal(render(createElement(ScreenRecordingNote)), '');
  });

  it('shows no update bar of the app', () => {
    assert.equal(render(createElement(UpdateBanner, { inVoice: false })), '');
  });

  it('links the disk image once the server answered a HEAD for it', () => {
    assert.deepEqual(heads, [`HEAD ${server}/download/Scryproof.dmg`]);
    const html = linkText();
    assert.match(html, /href="https:\/\/scryproof\.test\/download\/Scryproof\.dmg"/);
    assert.match(html, /for Mac \(Apple silicon\)/);
  });
});
