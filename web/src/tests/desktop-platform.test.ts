/**
 * The page knowing it is on a Mac: which download it offers, what it says about
 * modifier keys and the two macOS permissions, and the update bar's words.
 *
 * `lib/desktop.ts` reads the shell's bridge once, when it loads, so each case
 * that needs a bridge loads a fresh copy of the module with that bridge in
 * place (the query on the path makes the loader treat it as a new module).
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Desktop = typeof import('../lib/desktop');

let loads = 0;

/** The module as a page would see it: `bridge` is what the shell put on window, or nothing. */
async function pageWith(bridge: object | null): Promise<{ desktop: Desktop; window: EventTarget }> {
  const window = new EventTarget();
  Object.assign(window, { location: { origin: 'https://browser.test' } }, bridge ? { scryproofDesktop: bridge } : {});
  (globalThis as { window?: unknown }).window = window;
  loads += 1;
  const desktop: Desktop = await import(`../lib/desktop.ts?load=${loads}`);
  return { desktop, window };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const server = 'https://scryproof.test';
const bridge = { server, gateway: 'wss://scryproof.test/ws' };

describe('which download a computer is offered', () => {
  it('knows a Mac from what a browser calls its platform', async () => {
    const { desktop } = await pageWith(null);
    assert.equal(desktop.isMacPlatform('MacIntel', 0), true);
    assert.equal(desktop.isMacPlatform('macOS', 0), true, 'userAgentData says macOS');
    assert.equal(desktop.isMacPlatform('Win32', 0), false);
    assert.equal(desktop.isMacPlatform('Linux x86_64', 0), false);
    assert.equal(desktop.isMacPlatform('', 0), false);
    assert.equal(desktop.isMacPlatform('MacIntel', 5), false, 'an iPad asking for the desktop site has no Mac app to get');
  });

  it('offers the disk image on a Mac and the Windows installer to everyone else', async () => {
    const { desktop } = await pageWith(bridge);
    assert.deepEqual(desktop.desktopDownload(true), { href: `${server}/download/Scryproof.dmg`, system: 'Mac (Apple silicon)' });
    assert.deepEqual(desktop.desktopDownload(false), { href: `${server}/download/Scryproof-Setup.exe`, system: 'Windows' });
  });

  it('uses the Mac download in the Mac app without being told', async () => {
    const mac = await pageWith({ ...bridge, platform: 'darwin' });
    assert.match(mac.desktop.desktopDownload().href, /Scryproof\.dmg$/);
    const windows = await pageWith({ ...bridge, platform: 'win32' });
    assert.match(windows.desktop.desktopDownload().href, /Scryproof-Setup\.exe$/);
  });
});

describe('the Mac disk image, before and after it is published', () => {
  const answering = (status: number | 'fails') => {
    const asked: { url: string; method: string | undefined }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      asked.push({ url, method: init?.method });
      if (status === 'fails') throw new Error('offline');
      return { status } as Response;
    }) as unknown as typeof fetch;
    return { asked, fetcher };
  };

  it('is there when a HEAD answers 200 and not otherwise', async () => {
    const { desktop } = await pageWith(bridge);
    const ok = answering(200);
    assert.equal(await desktop.dmgPublished(ok.fetcher), true);
    assert.deepEqual(ok.asked, [{ url: `${server}/download/Scryproof.dmg`, method: 'HEAD' }]);
    assert.equal(await desktop.dmgPublished(answering(404).fetcher), false);
    assert.equal(await desktop.dmgPublished(answering(403).fetcher), false);
    assert.equal(await desktop.dmgPublished(answering('fails').fetcher), false);
  });

  it('shows a Mac the link only once it is there, and asks once however often it is shown', async () => {
    const { desktop } = await pageWith(bridge);
    for (const [status, link] of [
      [200, { href: `${server}/download/Scryproof.dmg`, system: 'Mac (Apple silicon)' }],
      [404, null],
    ] as const) {
      const { asked, fetcher } = answering(status);
      const store = desktop.downloadLink(true, fetcher);
      assert.equal(store.get(), null, 'nothing is offered before the answer');
      store.subscribe(() => {});
      store.subscribe(() => {})();
      await settle();
      assert.deepEqual(store.get(), link);
      store.subscribe(() => {});
      await settle();
      assert.equal(asked.length, 1);
    }
  });

  it('does not ask anyone else, who keeps the Windows installer', async () => {
    const { desktop } = await pageWith(bridge);
    const { asked, fetcher } = answering(404);
    const store = desktop.downloadLink(false, fetcher);
    store.subscribe(() => {});
    await settle();
    assert.deepEqual(store.get(), { href: `${server}/download/Scryproof-Setup.exe`, system: 'Windows' });
    assert.equal(asked.length, 0);
  });
});

describe('a modifier as the push-to-talk key', () => {
  it('warns on a Mac about Cmd-Tab, for either side of any modifier', async () => {
    await pageWith(null);
    const { pushKeyWarning } = await import('../components/PushToTalkKey');
    for (const code of ['MetaLeft', 'AltRight', 'ControlLeft', 'ShiftRight']) {
      assert.match(pushKeyWarning(code, true) ?? '', /Cmd-Tab/, `${code} should be warned about`);
    }
  });

  it('says nothing about an ordinary key, or off a Mac', async () => {
    await pageWith(null);
    const { pushKeyWarning } = await import('../components/PushToTalkKey');
    assert.equal(pushKeyWarning('Slash', true), null);
    assert.equal(pushKeyWarning('KeyV', true), null);
    assert.equal(pushKeyWarning('MetaLeft', false), null);
  });

  it('shows the sentence in the row, only for a modifier', async () => {
    await pageWith(null);
    const { PushToTalkKeyRow } = await import('../components/PushToTalkKey');
    const row = (code: string) =>
      renderToStaticMarkup(
        createElement(PushToTalkKeyRow, { code, capturing: false, onCapture: () => {}, mac: true, needsAccessibility: false }),
      );
    assert.match(row('MetaLeft'), /Cmd-Tab and other system shortcuts will fight this key/);
    assert.match(row('AltRight'), /Cmd-Tab/);
    assert.doesNotMatch(row('Slash'), /Cmd-Tab/);
  });
});

describe('the Accessibility explanation', () => {
  const row = async (needsAccessibility: boolean) => {
    const { PushToTalkKeyRow } = await import('../components/PushToTalkKey');
    return renderToStaticMarkup(
      createElement(PushToTalkKeyRow, { code: 'Slash', capturing: false, onCapture: () => {}, mac: true, needsAccessibility }),
    );
  };

  it('is there when the shell says Accessibility is not granted, and not when it is', async () => {
    for (const [accessibility, shown] of [
      [false, true],
      [true, false],
    ] as const) {
      const { desktop } = await pageWith({
        ...bridge,
        platform: 'darwin',
        permissionState: async () => ({ accessibility, screen: 'granted' }),
      });
      const state = await desktop.permissionState();
      assert.equal(desktop.accessibilityMissing(state), shown);
      const html = await row(desktop.accessibilityMissing(state));
      assert.equal(/Accessibility switch/.test(html), shown);
      assert.equal(/Open System Settings/.test(html), shown);
    }
  });

  it('clears when the window comes back to the front after the switch is turned on', async () => {
    let granted = false;
    const { desktop, window } = await pageWith({
      ...bridge,
      platform: 'darwin',
      permissionState: async () => ({ accessibility: granted, screen: 'granted' }),
    });
    const seen: boolean[] = [];
    const stop = desktop.watchPermissions((state) => seen.push(state.accessibility));
    await settle();
    assert.deepEqual(seen, [false]);
    granted = true;
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.deepEqual(seen, [false, true]);
    stop();
    window.dispatchEvent(new Event('focus'));
    await settle();
    assert.deepEqual(seen, [false, true], 'nothing after it is stopped');
  });

  it('opens the right System Settings pane', async () => {
    const opened: string[] = [];
    const { desktop } = await pageWith({
      ...bridge,
      platform: 'darwin',
      openPermissionSettings: async (which: string) => void opened.push(which),
    });
    desktop.openPermissionSettings('accessibility');
    desktop.openPermissionSettings('screen');
    assert.deepEqual(opened, ['accessibility', 'screen']);
  });
});

describe('the Screen Recording explanation', () => {
  it('says to quit and reopen, and has the button, only when it is missing', async () => {
    await pageWith(null);
    const { ScreenRecordingNoteView } = await import('../components/ShareMacNotes');
    const html = renderToStaticMarkup(createElement(ScreenRecordingNoteView, { missing: true }));
    assert.match(html, /needs Screen Recording turned on for Scryproof/);
    assert.match(html, /quit\s+and reopen Scryproof/);
    assert.match(html, /Open System Settings/);
    assert.equal(renderToStaticMarkup(createElement(ScreenRecordingNoteView, { missing: false })), '');
  });

  it('is for denied and not-determined, not for granted or unknown', async () => {
    const { desktop } = await pageWith(null);
    const { screenRecordingMissing } = desktop;
    const state = (screen: 'granted' | 'denied' | 'not-determined' | 'unknown') => ({ accessibility: true, screen });
    assert.equal(screenRecordingMissing(state('denied')), true);
    assert.equal(screenRecordingMissing(state('not-determined')), true);
    assert.equal(screenRecordingMissing(state('granted')), false);
    assert.equal(screenRecordingMissing(state('unknown')), false);
    assert.equal(screenRecordingMissing(null), false);
  });
});

describe('sound in a screen share', () => {
  it('never goes out from a Mac, whatever was offered or switched on', async () => {
    await pageWith(null);
    const { soundToShare } = await import('../components/ShareMacNotes');
    assert.equal(soundToShare(true, true, true), false);
    assert.equal(soundToShare(false, true, true), true, 'Windows keeps its switch');
    assert.equal(soundToShare(false, true, false), false);
    assert.equal(soundToShare(false, false, true), false);
  });

  it('shows a Mac the reason in place of the switch, and Windows its switch', async () => {
    await pageWith(null);
    const { ShareSound } = await import('../components/ShareMacNotes');
    const render = (mac: boolean, offered: boolean) =>
      renderToStaticMarkup(
        createElement(ShareSound, { mac, offered, label: 'Share sound', checked: false, onChange: () => {} }),
      );
    const mac = render(true, true);
    assert.match(mac, /No sound with a Mac screen share yet/);
    assert.match(mac, /disabled/);
    assert.doesNotMatch(mac, /Share sound/);
    assert.match(render(false, true), /Share sound/);
    assert.doesNotMatch(render(false, true), /disabled/);
    assert.equal(render(false, false), '');
  });
});

describe('no desktop copy where there is no Mac app', () => {
  it('a browser asks the shell nothing and hears nothing', async () => {
    const { desktop, window } = await pageWith(null);
    assert.equal(desktop.onMacApp, false);
    assert.equal(await desktop.permissionState(), null);
    let heard = 0;
    const stop = desktop.watchPermissions(() => (heard += 1));
    window.dispatchEvent(new Event('focus'));
    await settle();
    stop();
    assert.equal(heard, 0);
    desktop.openPermissionSettings('screen');
    assert.equal(await desktop.shellUpdateHow(), 'restart');
  });

  it('a 0.5.x shell, which knows none of this, is not thrown at', async () => {
    const { desktop } = await pageWith({ ...bridge, shell: '0.5.1' });
    assert.equal(desktop.onMacApp, false);
    assert.equal(await desktop.permissionState(), null);
    assert.equal(await desktop.shellUpdateHow(), 'restart');
    assert.doesNotThrow(() => desktop.openPermissionSettings('accessibility'));
    assert.doesNotThrow(() => desktop.watchPermissions(() => {})());
  });

  it('Windows gets no Mac permission questions even from a shell that could answer', async () => {
    const { desktop } = await pageWith({
      ...bridge,
      platform: 'win32',
      permissionState: async () => ({ accessibility: false, screen: 'denied' }),
    });
    assert.equal(await desktop.permissionState(), null);
  });

  it('a shell that fails when asked is the same as one that does not answer', async () => {
    const { desktop } = await pageWith({
      ...bridge,
      platform: 'darwin',
      permissionState: async () => {
        throw new Error('no');
      },
      shellUpdateHow: async () => {
        throw new Error('no');
      },
    });
    assert.equal(await desktop.permissionState(), null);
    assert.equal(await desktop.shellUpdateHow(), 'restart');
  });
});

describe('the update bar', () => {
  const bar = async (how: 'restart' | 'download', inVoice: boolean) => {
    await pageWith(null);
    const { ShellUpdateBanner } = await import('../components/UpdateBanner');
    return renderToStaticMarkup(createElement(ShellUpdateBanner, { how, inVoice, onApply: () => {} }));
  };

  it('asks for a restart when the app can replace itself', async () => {
    const html = await bar('restart', false);
    assert.match(html, /A new version of the app is ready\./);
    assert.match(html, /<button[^>]*>Restart to install<\/button>/);
    assert.doesNotMatch(html, /Download/);
  });

  it('asks for a download when it cannot', async () => {
    const html = await bar('download', false);
    assert.match(html, /A new version of the app is ready\./);
    assert.match(html, /<button[^>]*>Download it to update<\/button>/);
    assert.doesNotMatch(html, /Restart/);
  });

  it('holds a restart until the call is over, but not a download, which leaves the call alone', async () => {
    assert.doesNotMatch(await bar('restart', true), /<button/);
    assert.match(await bar('restart', true), /when your call is over/);
    assert.match(await bar('download', true), /<button[^>]*>Download it to update<\/button>/);
  });

  it('is asked about by the shell: download when it says so, restart otherwise', async () => {
    const download = await pageWith({ ...bridge, platform: 'darwin', shellUpdateHow: async () => 'download' });
    assert.equal(await download.desktop.shellUpdateHow(), 'download');
    const restart = await pageWith({ ...bridge, platform: 'darwin', shellUpdateHow: async () => 'restart' });
    assert.equal(await restart.desktop.shellUpdateHow(), 'restart');
    const odd = await pageWith({ ...bridge, platform: 'darwin', shellUpdateHow: async () => 'nonsense' });
    assert.equal(await odd.desktop.shellUpdateHow(), 'restart');
  });
});
