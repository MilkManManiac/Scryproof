/** Local, real encrypted call + real Chrome tab-audio capture. Never targets production. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const WEB = process.env.MIXER_WEB ?? 'http://localhost:5179';
if (!['localhost', '127.0.0.1'].includes(new URL(WEB).hostname)) throw Error('Local development only');
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: false,
  args: [
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--allow-loopback-in-peer-connection',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--auto-select-tab-capture-source-by-title=Scryproof mixer music proof',
  ],
});
const errors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const energy = (page, key) => page.evaluate((key) => window.__voice.mix?.energyOf(key) ?? 0, key);
const report = (text) => console.log(`PASS ${text}`);
async function login(username) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1400, height: 940 } });
  await context.addInitScript(() => {
    localStorage.setItem('scryproof.walkthrough.v1', 'done');
    localStorage.setItem(
      'scryproof.voice-prefs.v1',
      JSON.stringify({ noiseMode: 'off', loudnessGuard: false, sounds: false }),
    );
    navigator.mediaDevices.getUserMedia = async () => {
      const a = new AudioContext();
      const o = a.createOscillator();
      const g = a.createGain();
      const d = a.createMediaStreamDestination();
      g.gain.value = 0.02;
      o.connect(g).connect(d);
      o.start();
      await a.resume();
      return d.stream;
    };
    const capture = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await capture(options);
      window.__lastCapture = stream;
      return stream;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(WEB);
  await page.evaluate(async (username) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'seed-passphrase-for-local-dev' }),
    });
    if (!response.ok) throw Error(await response.text());
  }, username);
  await page.reload();
  await page.waitForSelector('.rail');
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.count()) await skip.click();
  return page;
}
async function join(page) {
  await page.evaluate(() => {
    const channel = [...document.querySelectorAll('button, [role=button], .channel')].find((el) =>
      el.textContent.includes('♫'),
    );
    if (!channel) throw Error('No seeded voice channel');
    channel.click();
  });
  await page.waitForFunction(() => window.__voice?.getSnapshot().phase === 'connected', null, { timeout: 45000 });
}
async function openMixer(page) {
  if (!(await page.locator('.call-mixer').count()))
    await page.getByRole('button', { name: 'Open call mixer', exact: true }).first().click();
}
async function setRange(locator, value) {
  await locator.evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
}
try {
  const owner = await login('wes');
  const listener = await login('alex');
  await join(owner);
  await join(listener);
  await listener.waitForFunction(() =>
    window.__voice.getSnapshot().people.some((person) => person.state === 'secured'),
  );
  const ownerId = await owner.evaluate(() => window.__ownVoice().userId);
  await openMixer(owner);
  await openMixer(listener);
  assert.equal(await listener.locator('.mixer-person').count(), 1);
  report('mixer shows the live call');
  // A real tab plays a quiet oscillator through its speakers; Chrome captures that tab's audio.
  const source = await owner.context().newPage();
  await source.route(`${WEB}/mixer-music-proof`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Scryproof mixer music proof</title><button id="play">Play local test tone</button><script>play.onclick=async()=>{const a=new AudioContext();const o=a.createOscillator();const g=a.createGain();g.gain.value=.035;o.frequency.value=220;o.connect(g).connect(a.destination);o.start();await a.resume();};</script>',
    }),
  );
  await source.goto(`${WEB}/mixer-music-proof`);
  await source.locator('#play').click();
  await owner.bringToFront();
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.waitForFunction(() => window.__voice.getSnapshot().musicSharing, null, { timeout: 20000 });
  await listener.waitForFunction(() =>
    window.__voice.getSnapshot().sharedAudio.some((share) => share.kind === 'music'),
  );
  const key = `${ownerId}:music`;
  assert.equal(await energy(listener, key), 0);
  assert.equal(
    await listener.evaluate((id) => window.__voice.debugSubscriptions()[`${id}:screen_share_audio`], ownerId),
    false,
  );
  assert.deepEqual(
    await owner.evaluate(() => ({
      video: window.__lastCapture.getVideoTracks().map((t) => t.readyState),
      outgoing: [...window.__voice.room.localParticipant.videoTrackPublications.values()].length,
    })),
    { video: ['ended'], outgoing: 0 },
  );
  report('real tab capture publishes audio only; listeners receive nothing before opting in');
  await listener.getByRole('button', { name: /^Listen to .* music$/ }).click();
  await listener.waitForFunction((key) => (window.__voice.mix?.energyOf(key) ?? 0) > 0.003, key);
  assert.equal(await listener.evaluate(() => window.__voice.getSnapshot().encrypted), true);
  report('opt-in receives and decodes real encrypted music');
  const listenerId = await listener.evaluate(() => window.__ownVoice().userId);
  const listenersOf = (page) =>
    page.evaluate(
      () => window.__voice.getSnapshot().sharedAudio.find((share) => share.kind === 'music')?.listeners ?? [],
    );
  const waitForListeners = (page, ids) =>
    page.waitForFunction((ids) => {
      const actual = window.__voice.getSnapshot().sharedAudio.find((share) => share.kind === 'music')?.listeners ?? [];
      return JSON.stringify([...actual].sort()) === JSON.stringify([...ids].sort());
    }, ids);
  await waitForListeners(owner, [listenerId]);
  await waitForListeners(listener, [listenerId]);
  assert.equal(await owner.locator(`.mixer-music .mixer-listeners [data-user-id="${listenerId}"]`).count(), 1);
  assert.equal(await listener.locator(`.mixer-source .mixer-listeners [data-user-id="${listenerId}"]`).count(), 1);
  const observer = await login('mara');
  await join(observer);
  await openMixer(observer);
  await waitForListeners(observer, [listenerId]);
  report('sharer, listener, and a late joiner see the listener avatar without opting the newcomer in');
  const observerId = await observer.evaluate(() => window.__ownVoice().userId);
  await observer.getByRole('button', { name: /^Listen to .* music$/ }).click();
  await waitForListeners(owner, [listenerId, observerId]);
  await waitForListeners(listener, [listenerId, observerId]);
  await waitForListeners(observer, [listenerId, observerId]);
  await mkdir('docs/shots', { recursive: true });
  await listener.screenshot({ path: 'docs/shots/music-listeners-desktop.png' });
  await owner.screenshot({ path: 'docs/shots/music-listeners-sharer.png' });
  await listener.setViewportSize({ width: 390, height: 844 });
  await listener.locator('.mixer-source .mixer-listeners').scrollIntoViewIfNeeded();
  await listener.screenshot({ path: 'docs/shots/music-listeners-mobile.png' });
  assert.equal(await listener.locator('.call-mixer').evaluate((el) => el.scrollWidth <= window.innerWidth), true);
  await listener.setViewportSize({ width: 1400, height: 940 });
  await observer.getByRole('button', { name: /^Stop listening to .* music$/ }).click();
  await waitForListeners(owner, [listenerId]);
  const musicSid = await owner.evaluate(
    () => window.__voice.getSnapshot().sharedAudio.find((share) => share.kind === 'music').sid,
  );
  // A payload cannot claim another person's identity: the room transport identifies its sender.
  await observer.evaluate(
    async ({ sid, impostor }) => {
      await window.__voice.room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ listening: [sid], userId: impostor })),
        {
          reliable: true,
          topic: 'scryproof.music-listeners.v1',
        },
      );
    },
    { sid: musicSid, impostor: ownerId },
  );
  await waitForListeners(owner, [listenerId, observerId]);
  assert.ok(!(await listenersOf(owner)).includes(ownerId));
  await observer.getByRole('button', { name: 'Close mixer' }).click();
  await observer.getByRole('button', { name: 'Leave the call', exact: true }).click();
  await waitForListeners(owner, [listenerId]);
  await observer.context().close();
  report(
    'multiple listeners appear under the right source; sender identity is not taken from payloads; leaving clears avatars',
  );
  // Let the departure's key rotation settle before comparing steady-state gain.
  await listener.waitForFunction(
    () =>
      window.__voice.getSnapshot().people.length === 1 &&
      window.__voice.getSnapshot().people.every((person) => person.state === 'secured'),
  );
  await pause(1200);
  const e0 = await energy(listener, key);
  await pause(1500);
  const base = (await energy(listener, key)) - e0;
  const musicRange = listener.getByRole('slider', { name: / music volume$/ });
  const musicMeter = listener.getByRole('meter', { name: / music level$/ });
  const baseDb = Number(await musicMeter.getAttribute('aria-valuenow'));
  assert.ok(baseDb > -60 && baseDb < -12, `measured music level ${baseDb} dB`);
  await setRange(musicRange, 400);
  await pause(250);
  const e1 = await energy(listener, key);
  await pause(1500);
  const boosted = (await energy(listener, key)) - e1;
  assert.ok(boosted / base > 10 && boosted / base < 23, `4x amplitude energy ratio ${boosted / base}`);
  report(`400% boost changes actual decoded signal (${(boosted / base).toFixed(1)}× energy)`);
  const boostedDb = Number(await musicMeter.getAttribute('aria-valuenow'));
  assert.ok(Math.abs(boostedDb - baseDb - 12) <= 2, `4x amplitude raises meter by 12 dB: ${baseDb} -> ${boostedDb}`);
  report('live music meter measures decoded signal and shows the 12 dB boost');
  await listener.getByRole('button', { name: /^Mute .* music$/ }).click();
  await pause(400);
  await waitForListeners(owner, []);
  const quiet = await energy(listener, key);
  await pause(800);
  assert.ok((await energy(listener, key)) - quiet < 0.00001);
  assert.equal(await musicMeter.getAttribute('aria-valuenow'), '-60');
  await listener.getByRole('button', { name: /^Unmute .* music$/ }).click();
  assert.equal(await musicRange.inputValue(), '400');
  await waitForListeners(owner, [listenerId]);
  report('mute is silent and unmute restores the chosen boost');
  const outputRange = listener.getByRole('slider', { name: 'Call output volume' });
  await setRange(outputRange, 50);
  await pause(250);
  assert.ok(Math.abs(Number(await musicMeter.getAttribute('aria-valuenow')) - boostedDb + 6) <= 2);
  await setRange(outputRange, 0);
  await waitForListeners(owner, []);
  await pause(150);
  assert.equal(await musicMeter.getAttribute('aria-valuenow'), '-60');
  assert.equal(await listener.getByRole('meter', { name: 'Call output level' }).getAttribute('aria-valuenow'), '-60');
  await setRange(outputRange, 100);
  await waitForListeners(owner, [listenerId]);
  report('zero call output clears the listener avatar and restoring output restores it');
  // Lose one presence message: the next refresh must repair the audience automatically.
  await listener.evaluate(() => {
    const local = window.__voice.room.localParticipant;
    const original = local.publishData.bind(local);
    local.publishData = async (...args) => {
      if (args[1]?.topic === 'scryproof.music-listeners.v1') {
        local.publishData = original;
        throw Error('test presence send failure');
      }
      return original(...args);
    };
  });
  await listener.getByRole('button', { name: /^Reset .* music to 100%$/ }).click();
  await listener.getByRole('button', { name: /^Stop listening to .* music$/ }).click();
  await listener.waitForFunction((id) => !window.__voice.debugSubscriptions()[`${id}:screen_share_audio`], ownerId);
  assert.equal(await listener.evaluate(() => window.__voice.getSnapshot().phase), 'connected');
  await waitForListeners(owner, []);
  report('Stop listening unsubscribes; heartbeat repairs a failed presence send without leaving the call');
  await listener.getByRole('button', { name: /^Listen to .* music$/ }).click();
  const sid = await listener.evaluate(() => window.__voice.getSnapshot().sharedAudio[0].sid);
  await owner.getByRole('button', { name: 'Stop sharing music', exact: true }).click();
  await listener.waitForFunction(() => window.__voice.getSnapshot().sharedAudio.length === 0);
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await listener.waitForFunction(
    (sid) => window.__voice.getSnapshot().sharedAudio.some((share) => share.sid !== sid),
    sid,
  );
  assert.equal(await listener.evaluate(() => window.__voice.getSnapshot().sharedAudio[0].listening), false);
  await waitForListeners(owner, []);
  report('restarting music requires fresh consent and never inherits the old audience');
  await listener.getByRole('button', { name: /^Listen to .* music$/ }).click();
  await listener.waitForFunction((key) => (window.__voice.mix?.energyOf(key) ?? 0) > 0.01, key);
  // Voices retain their independent settings while music is playing.
  const voiceRange = listener.getByRole('slider', { name: / voice volume$/ });
  await setRange(voiceRange, 250);
  assert.equal(await musicRange.inputValue(), '100');
  assert.equal(await listener.evaluate((id) => window.__voicePrefs.get().volumes[id], ownerId), 2.5);
  await listener.getByRole('button', { name: 'Close mixer' }).click();
  await listener.getByRole('button', { name: 'Deafen', exact: true }).first().click();
  await listener.waitForFunction(() => window.__voice.mix.master.gain.value === 0);
  await waitForListeners(owner, []);
  await openMixer(listener);
  await pause(150);
  assert.equal(await listener.getByRole('meter', { name: / music level$/ }).getAttribute('aria-valuenow'), '-60');
  await listener.getByText('Undeafen in the call controls to hear your mix.').waitFor();
  await listener.getByRole('button', { name: 'Close mixer' }).click();
  await listener.getByRole('button', { name: 'Undeafen', exact: true }).first().click();
  await listener.waitForFunction(() => window.__voice.mix.master.gain.value > 0);
  await waitForListeners(owner, [listenerId]);
  await openMixer(listener);
  assert.equal(await voiceRange.inputValue(), '250');
  report('voice settings are independent; deafen silences the entire output and preserves the mix');
  // Keyboard focus stays in the mixer and returns to its opener.
  await listener.getByRole('button', { name: 'Close mixer' }).focus();
  await listener.keyboard.press('Shift+Tab');
  assert.equal(await listener.evaluate(() => Boolean(document.activeElement.closest('.call-mixer'))), true);
  await listener.keyboard.press('Tab');
  assert.equal(
    await listener.getByRole('button', { name: 'Close mixer' }).evaluate((el) => el === document.activeElement),
    true,
  );
  report('keyboard focus wraps inside the mixer');
  // Prove E2EE on this new track, not merely a flag: wrong sender key stops decoded music.
  await listener.evaluate((id) => window.__voice.debugCorruptKeyFor(id), ownerId);
  await pause(1000);
  const musicPackets = () =>
    listener.evaluate(async (id) => {
      const track = window.__voice.room.remoteParticipants.get(id).getTrackPublication('screen_share_audio').track;
      const stats = await track.getRTCStatsReport();
      let packets = 0;
      stats.forEach((entry) => {
        if (entry.type === 'inbound-rtp') packets += entry.packetsReceived ?? 0;
      });
      return packets;
    }, ownerId);
  const packetsBefore = await musicPackets();
  const corrupt = await energy(listener, key);
  await pause(1000);
  assert.ok((await energy(listener, key)) - corrupt < 0.00001);
  assert.ok((await musicPackets()) > packetsBefore, 'encrypted packets continue arriving with the wrong key');
  assert.equal(await musicMeter.getAttribute('aria-valuenow'), '-60');
  report('wrong key stops decoded music and its level meter');
  await mkdir('docs/shots', { recursive: true });

  await listener.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await listener.evaluate(() => document.querySelector('.call-mixer').scrollWidth <= window.innerWidth),
    true,
  );

  await listener.setViewportSize({ width: 1400, height: 940 });
  // Stop through the capture track's own ending event, like closing the source.
  await owner.evaluate(() => {
    const t = window.__lastCapture.getAudioTracks()[0];
    t.stop();
    t.dispatchEvent(new Event('ended'));
  });
  await owner.waitForFunction(() => !window.__voice.getSnapshot().musicSharing);
  await listener.waitForFunction(() => window.__voice.getSnapshot().sharedAudio.length === 0);
  report('source ending removes its music from the mixer');
  // A fresh join rotates back to valid keys after the deliberate corruption.
  await listener.getByRole('button', { name: 'Close mixer' }).click();
  await listener.getByRole('button', { name: 'Leave the call', exact: true }).click();
  await listener.waitForFunction(() => window.__voice.getSnapshot().phase === 'ended');
  await join(listener);
  await listener.waitForFunction(() =>
    window.__voice.getSnapshot().people.some((person) => person.state === 'secured'),
  );
  await openMixer(listener);

  // Existing screen audio is offered in the mixer before fetching its picture.
  await owner.evaluate(() => window.__voice.setScreenShare(true));
  await owner.waitForFunction(() => window.__voice.getSnapshot().sharing);
  await listener.waitForFunction(() =>
    window.__voice.getSnapshot().sharedAudio.some((share) => share.kind === 'screen'),
  );
  await listener.getByRole('button', { name: /^Listen to .* stream$/ }).click();
  await listener.waitForFunction((id) => window.__voice.debugSubscriptions()[`${id}:screen_share_audio`], ownerId);
  assert.equal(
    await listener.evaluate((id) => window.__voice.debugSubscriptions()[`${id}:screen_share`], ownerId),
    false,
  );
  await listener.waitForFunction((id) => (window.__voice.mix?.energyOf(`${id}:screen`) ?? 0) > 0.005, ownerId);
  await listener.waitForFunction(
    () => Number(document.querySelector('[aria-label$="stream level"]').getAttribute('aria-valuenow')) > -60,
  );
  await setRange(listener.getByRole('slider', { name: / stream volume$/ }), 300);
  assert.equal(await voiceRange.inputValue(), '250');
  await owner
    .getByRole('button', { name: 'Share music', exact: true })
    .isDisabled()
    .then((disabled) => assert.equal(disabled, true));
  await owner.evaluate(() => window.__voice.setScreenShare(false));
  await listener.waitForFunction(() => window.__voice.getSnapshot().sharedAudio.length === 0);
  report('stream audio has its own mixer control without downloading video; sharing slots cannot overlap');
  // Real soundboard audio, both remote and local, reaches the aggregate clip meter.
  await owner.evaluate(() => window.__voice.debugPlayTone(2));
  await listener.waitForFunction(
    () => Number(document.querySelector('[aria-label="Soundboard level"]').getAttribute('aria-valuenow')) > -40,
  );
  await owner.evaluate(() => {
    const local = window.__voice.board.local;
    const context = local.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.2;
    oscillator.connect(gain).connect(local);
    oscillator.start();
    oscillator.stop(context.currentTime + 2);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
  await owner.waitForFunction(
    () => Number(document.querySelector('[aria-label="Soundboard level"]').getAttribute('aria-valuenow')) > -30,
  );
  await pause(2300);
  assert.equal(await owner.getByRole('meter', { name: 'Soundboard level' }).getAttribute('aria-valuenow'), '-60');
  report('screen audio and remote/local soundboard meters show actual audio and settle to silence');

  const third = await login('mara');
  await join(third);
  await listener.waitForFunction(() => document.querySelectorAll('.mixer-person').length === 2);
  await third.getByRole('button', { name: 'Leave the call', exact: true }).click();
  await listener.waitForFunction(() => document.querySelectorAll('.mixer-person').length === 1);
  report('people join and leave the open mixer automatically');
  // Failure paths use deterministic capture responses, after real capture proved the success path.
  await owner.evaluate(() => {
    window.__realCapture = navigator.mediaDevices.getDisplayMedia;
    navigator.mediaDevices.getDisplayMedia = async () => new MediaStream();
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.getByRole('alert').filter({ hasText: 'No audio was shared' }).waitFor();
  assert.equal(await owner.evaluate(() => window.__voice.getSnapshot().phase), 'connected');
  await owner.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      throw new DOMException('cancel', 'NotAllowedError');
    };
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.waitForFunction(() => !window.__voice.getSnapshot().musicBusy);
  assert.equal(await owner.evaluate(() => window.__voice.getSnapshot().musicError), null);
  report('missing audio is explained; canceled picker leaves call working');
  await owner.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = () =>
      new Promise((resolve) => {
        window.__finishCapture = resolve;
      });
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.getByRole('button', { name: 'Cancel audio share', exact: true }).click();
  assert.equal(await owner.evaluate(() => window.__voice.getSnapshot().musicBusy), false);
  const stopped = await owner.evaluate(async () => {
    const a = new AudioContext();
    const d = a.createMediaStreamDestination();
    const t = d.stream.getAudioTracks()[0];
    window.__finishCapture(d.stream);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await a.close();
    return t.readyState;
  });
  assert.equal(stopped, 'ended');
  report('canceling during pending capture stops late tracks');
  // A publish refusal stops capture, reports the failure and permits another attempt.
  await owner.evaluate(() => {
    const local = window.__voice.room.localParticipant;
    window.__publish = local.publishTrack.bind(local);
    local.publishTrack = async () => {
      throw new Error('test publish refusal');
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      const a = new AudioContext();
      const d = a.createMediaStreamDestination();
      window.__failedCapture = d.stream;
      window.__testAudio = a;
      return d.stream;
    };
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.getByRole('alert').filter({ hasText: 'test publish refusal' }).waitFor();
  assert.equal(await owner.evaluate(() => window.__failedCapture.getAudioTracks()[0].readyState), 'ended');
  await owner.evaluate(() => {
    window.__voice.room.localParticipant.publishTrack = window.__publish;
    window.__testAudio.close();
  });
  // Leaving with the capture picker pending must not publish into a later call.
  await owner.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = () =>
      new Promise((resolve) => {
        window.__finishCapture = resolve;
      });
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.getByRole('button', { name: 'Close mixer' }).click();
  await owner.getByRole('button', { name: 'Leave the call', exact: true }).click();
  await owner.waitForFunction(() => window.__voice.getSnapshot().phase === 'ended');
  const late = await owner.evaluate(async () => {
    const a = new AudioContext();
    const d = a.createMediaStreamDestination();
    const t = d.stream.getAudioTracks()[0];
    window.__finishCapture(d.stream);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await a.close();
    return t.readyState;
  });
  assert.equal(late, 'ended');
  await listener.waitForFunction(() => document.querySelectorAll('.mixer-person').length === 0);
  report('publish refusal and leaving during capture stop all late audio tracks');
  // A server/SDK unpublish must stop capture even without a native ended event.
  await join(owner);
  await openMixer(owner);
  await owner.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = window.__realCapture;
  });
  await owner.getByRole('button', { name: 'Share music', exact: true }).click();
  await owner.waitForFunction(() => window.__voice.getSnapshot().musicSharing);
  await owner.evaluate(() => window.__voice.room.localParticipant.unpublishTrack(window.__voice.musicTrack, false));
  await owner.waitForFunction(() => !window.__voice.getSnapshot().musicSharing);
  assert.equal(await owner.evaluate(() => window.__lastCapture.getAudioTracks()[0].readyState), 'ended');
  assert.equal(await owner.evaluate(() => window.__voice.musicTrack), null);
  report('SDK unpublication stops capture and releases the sharing slot');

  assert.deepEqual(errors, []);
  report('no browser runtime errors');
} finally {
  await browser.close();
}
