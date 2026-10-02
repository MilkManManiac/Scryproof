/**
 * The components as a page on Mac, with the Mac app draws them, wired to the bridge the
 * shell put on window. The unit tests beside this one give the pieces their
 * inputs by hand; this file is what catches a piece being wired to the wrong
 * input. `lib/desktop.ts` reads the bridge once when it loads, so each of the
 * two wiring files is its own process with one kind of shell.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = 'https://scryproof.test';
const window = new EventTarget();
Object.assign(window, {
  scryproofDesktop: {
    server,
    gateway: 'wss://scryproof.test/ws',
    platform: 'darwin',
    permissionState: async () => ({ accessibility: false, screen: 'denied' }),
    shellUpdateState: async () => '0.6.1',
    onShellUpdateReady: () => {},
    shellUpdateHow: async () => 'download',
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

describe('the Mac app, with nothing granted and an update waiting', () => {
  it('explains Accessibility under the push-to-talk key, and warns about a modifier', () => {
    const html = keyRow('MetaLeft');
    assert.match(html, /Accessibility switch/);
    assert.match(html, /Open System Settings/);
    assert.match(html, /Cmd-Tab/);
    assert.doesNotMatch(keyRow('Slash'), /Cmd-Tab/);
  });

  it('explains Screen Recording in the share picker', () => {
    assert.match(render(createElement(ScreenRecordingNote)), /needs Screen Recording/);
  });

  it('offers the download in the update bar, in a call or not', () => {
    for (const inVoice of [false, true]) {
      const html = render(createElement(UpdateBanner, { inVoice }));
      assert.match(html, /Download it to update/);
      assert.doesNotMatch(html, /Restart/);
    }
  });

  it('links the disk image once the server answered a HEAD for it', () => {
    assert.deepEqual(heads, [`HEAD ${server}/download/Scryproof.dmg`]);
    const html = linkText();
    assert.match(html, /href="https:\/\/scryproof\.test\/download\/Scryproof\.dmg"/);
    assert.match(html, /for Mac \(Apple silicon\)/);
  });
});

describe('the two places that link the app', () => {
  // The voice panel and the themes dialog cannot be drawn without the whole
  // store behind them, so this reads them: the address of an installer belongs
  // in `desktop.ts` and nowhere else, or a Mac is sent the Windows one again.
  for (const file of ['../components/VoicePanel.tsx', '../components/ThemePicker.tsx']) {
    it(`${file.slice(14)} does not name an installer itself`, () => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /Scryproof-Setup|Scryproof\.dmg|\.exe/);
      assert.match(source, /DesktopAppLink|useDesktopDownload/);
    });
  }
});
