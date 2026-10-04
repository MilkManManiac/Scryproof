/**
 * The components as a page on Mac, with the Mac app draws them, wired to the bridge the
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
for (const [name, value] of [['platform', 'MacIntel'], ['maxTouchPoints', 0]] as const) {
  Object.defineProperty(globalThis.navigator, name, { value, configurable: true });
}

const server = 'https://scryproof.test';
// What the Mac says about Accessibility; one test below grants it and puts it back.
let granted = false;
const window = new EventTarget();
Object.assign(window, {
  scryproofDesktop: {
    server,
    gateway: 'wss://scryproof.test/ws',
    platform: 'darwin',
    permissionState: async () => ({ accessibility: granted, screen: 'denied' }),
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
const { DesktopInstallerLink } = await import('../components/DesktopInstallerLink');

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

  it('offers no download link and asks the server about none: it is installed, and not on the server\'s origin', () => {
    assert.deepEqual(heads, []);
    assert.equal(linkText(), '');
  });
});

describe('the Windows installer fallback, on a Mac shell', () => {
  it('never reads the Windows installer manifest, even from a shell with no applyShellUpdate', () => {
    const before = heads.length;
    const requests: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      requests.push(String(url));
      return { ok: true, json: async () => ({ version: '9.9.9' }) } as Response;
    }) as unknown as typeof fetch;
    try {
      const stop = desktop.onDesktopRelease(() => assert.fail('a Mac must not be offered the Windows installer'));
      stop();
    } finally {
      globalThis.fetch = original;
    }
    assert.deepEqual(requests, []);
    assert.equal(heads.length, before);
  });

  it('tells a Mac there is no share sound and to replace the app, not run an installer', () => {
    assert.match(desktop.activityShareHint(), /no sound/);
    assert.doesNotMatch(desktop.activityShareHint(), /Enable sound/);
    assert.match(desktop.updateDownloadFollowUp(), /replace the old app/);
  });

  it('links the disk image, not the Windows installer, from the fallback link', () => {
    const html = render(createElement(DesktopInstallerLink, { prominent: true }));
    assert.match(html, /Scryproof\.dmg/);
    assert.doesNotMatch(html, /\.exe/);
  });
});

describe('where the Mac pieces are placed', () => {
  // The share picker, the voice settings and the app shell cannot be drawn
  // without the whole store behind them, so these read them: each piece is
  // tested above, and this is what ties it in.
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  it('the share picker gives sound, the Screen Recording note and the Mac switch the Mac flag', () => {
    const share = source('../components/SharePicker.tsx');
    assert.match(share, /soundToShare\(onMacApp,/);
    assert.match(share, /mac=\{onMacApp\}/);
    assert.match(share, /<ScreenRecordingNote \/>/);
  });
  it('the voice settings show the real key in the push-to-talk row', () => {
    assert.match(source('../components/VoiceSettings.tsx'), /<PushToTalkKey code=\{prefs\.pushKey\}/);
  });
  it('the app shell draws the update bar with the call state', () => {
    assert.match(source('../App.tsx'), /<UpdateBanner inVoice=\{inVoice\} \/>/);
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

  it('the themes dialog looks the link up only where it shows one', () => {
    const source = readFileSync(new URL('../components/ThemePicker.tsx', import.meta.url), 'utf8');
    assert.equal(source.match(/useDesktopDownload\(\)/g)?.length, 1);
    assert.match(source, /function NeedsNewerApp\(\) \{\s*const download = useDesktopDownload\(\);/);
  });
});

describe('push-to-talk asks the shell again once Accessibility is granted', () => {
  // The shell starts no key hook without the grant, so a call that asked
  // before the trip to System Settings has to ask again when the person is
  // back. The way back is the window coming to the front.
  it('calls back once on refused then granted, not for a grant already there', async () => {
    let calls = 0;
    const stop = desktop.onAccessibilityGranted(() => calls++);
    await settle();
    assert.equal(calls, 0, 'still refused');
    granted = true;
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.equal(calls, 1, 'granted after a refusal');
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.equal(calls, 1, 'still granted is not news');
    stop();

    let already = 0;
    const stopAlready = desktop.onAccessibilityGranted(() => already++);
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.equal(already, 0, 'granted from the start');
    stopAlready();

    granted = false;
    window.dispatchEvent(new Event('focus'));
    await settle();
  });

  it('the voice session re-arms the shell key on that callback', () => {
    const source = readFileSync(new URL('../lib/voice-session.ts', import.meta.url), 'utf8');
    assert.match(source, /onAccessibilityGranted\(\(\) => \{\s*if \(!this\.globalHold\) void this\.armGlobalHold\(\);/);
    assert.match(source, /stopRearm\(\);/);
  });
});
