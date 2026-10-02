const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
import assert from 'node:assert/strict';
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: false,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--auto-select-tab-capture-source-by-title=Drain The Swamp activity proof',
    '--allow-loopback-in-peer-connection',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = async (opts) => {
      const stream = await original(opts);
      window.__captureSettings = stream.getVideoTracks()[0].getSettings();
      return stream;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const a = new AudioContext();
      const o = a.createOscillator();
      const d = a.createMediaStreamDestination();
      o.connect(d);
      o.start();
      return d.stream;
    };
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error')
      console.log('console:', msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => console.log('pageerror:', err.message));
  await page.goto('http://localhost:5179');
  await page.evaluate(async () => {
    let r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'wes',
        password: 'seed-passphrase-for-local-dev',
      }),
    });
    if (!r.ok) throw Error(await r.text());
  });
  await page.reload();
  await page.waitForSelector('.rail');
  await page
    .getByRole('button', { name: 'Skip', exact: true })
    .click()
    .catch(() => {});
  const viewerContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await viewerContext.addInitScript(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = async (opts) => {
      const stream = await original(opts);
      window.__captureSettings = stream.getVideoTracks()[0].getSettings();
      return stream;
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const a = new AudioContext();
      const o = a.createOscillator();
      const d = a.createMediaStreamDestination();
      o.connect(d);
      o.start();
      return d.stream;
    };
  });
  const viewer = await viewerContext.newPage();
  await viewer.goto('http://localhost:5179');
  await viewer.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'alex',
        password: 'seed-passphrase-for-local-dev',
      }),
    });
  });
  await viewer.reload();
  await viewer.waitForSelector('.rail');
  await viewer
    .getByRole('button', { name: 'Skip', exact: true })
    .click()
    .catch(() => {});
  for (const person of [page, viewer]) {
    await person.evaluate(() => {
      const channel = [
        ...document.querySelectorAll('button, [role=button], .channel'),
      ].find((el) => el.textContent.includes('♫'));
      if (!channel) throw Error('no voice channel');
      channel.click();
    });
    await person.waitForFunction(
      () => window.__voice?.getSnapshot().phase === 'connected',
      {},
      { timeout: 45000 },
    );
  }
  await page.waitForFunction(() =>
    window.__voice.getSnapshot().people.some((p) => p.state === 'secured'),
  );
  await page
    .getByRole('button', { name: 'Activities', exact: true })
    .first()
    .click();
  await page.locator('.activity-choice').click();
  await page.waitForFunction(
    () => !document.querySelector('.activity-loading'),
    {},
    { timeout: 120000 },
  );
  page.on('console', (m) => {
    if (m.text().startsWith('ACTIVITY')) console.log(m.text());
  });
  await page.evaluate(() =>
    window.addEventListener('message', (e) =>
      console.log('ACTIVITY MESSAGE', e.origin, JSON.stringify(e.data)),
    ),
  );
  const frame = page.frames().find((f) => f.url().includes('5180'));
  console.log('Game ready:', frame.url());
  console.log(
    'Sandbox parent access blocked:',
    await frame.evaluate(() => {
      try {
        return !window.parent.document;
      } catch {
        return true;
      }
    }),
  );
  console.log(
    'Storage:',
    await frame.evaluate(() => ({
      indexedDB: !!indexedDB,
      secure: isSecureContext,
      canvas: {
        width: document.querySelector('canvas').width,
        height: document.querySelector('canvas').height,
      },
    })),
  );
  await page.screenshot({ path: '/tmp/scryproof-activity-title.png' });
  await page.evaluate(
    () => (document.title = 'Drain The Swamp activity proof'),
  );
  await page
    .getByRole('button', { name: 'Share gameplay', exact: true })
    .click();
  await page.waitForFunction(
    () => window.__voice.getSnapshot().sharing,
    {},
    { timeout: 30000 },
  );
  const uid = await page.evaluate(() =>
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((r) => r.user.id),
  );
  await viewer
    .getByRole('button', { name: 'Watch', exact: true })
    .first()
    .click();
  await viewer.waitForFunction(
    () => document.querySelector('video.voice-focus-video')?.videoWidth > 0,
    {},
    { timeout: 30000 },
  );
  await page.bringToFront();
  await viewer.waitForTimeout(5000);
  console.log(
    'Received picture colors:',
    await viewer.locator('video.voice-focus-video').evaluate((v) => {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const x = c.getContext('2d');
      x.drawImage(v, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data;
      return new Set(
        Array.from(
          { length: d.length / 4 },
          (_, i) => `${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]}`,
        ),
      ).size;
    }),
  );
  await viewer.screenshot({ path: '/tmp/scryproof-activity-watcher.png' });
  const stats = await viewer.evaluate(() => window.__voice.debugVideo());
  console.log(
    'Capture settings:',
    await page.evaluate(() => window.__captureSettings),
  );
  console.log('Watcher video stats:', JSON.stringify(stats));
  assert.equal(
    await page.evaluate(() => window.__voice.getSnapshot().encrypted),
    true,
  );
  assert.equal(
    await viewer.evaluate(() => window.__voice.getSnapshot().encrypted),
    true,
  );
  assert.equal(
    (await page.evaluate(() => window.__captureSettings)).displaySurface,
    'browser',
  );
  assert.ok(
    await viewer.locator('video.voice-focus-video').evaluate((v) => {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const x = c.getContext('2d');
      x.drawImage(v, 0, 0, 160, 90);
      return new Set(x.getImageData(0, 0, 160, 90).data).size > 30;
    }),
    'Watcher receives visible game pixels',
  );
  await page
    .getByRole('button', { name: 'Back to Scryproof', exact: true })
    .click();
  await page.waitForFunction(() => !window.__voice.getSnapshot().sharing);
  console.log(
    'Minimize stops gameplay share; voice remains:',
    await page.evaluate(() => window.__voice.getSnapshot().phase),
  );
  await page
    .getByRole('button', { name: 'Return to Drain The Swamp' })
    .last()
    .click();
  assert.equal(
    frame,
    page.frames().find((f) => f.url().includes('5180')),
  );
  assert.equal(
    await page.evaluate(() => window.__voice.getSnapshot().phase),
    'connected',
  );
  await page.screenshot({ path: '/tmp/scryproof-activity-player.png' });
  // A real engine failure, then recovery without ending the call.
  await page.getByRole('button', { name: 'End activity', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'End activity?' })
    .getByRole('button', { name: 'End activity', exact: true })
    .click();
  await page.route('**/index.wasm', (r) => r.abort());
  await page
    .getByRole('button', { name: 'Activities', exact: true })
    .first()
    .click();
  await page.locator('.activity-choice').click();
  await page.waitForTimeout(3000);
  console.log(
    'Failed loader:',
    await page
      .frames()
      .find((f) => f.url().includes('5180'))
      .evaluate(() => ({
        src: document.querySelector('script[src*=activity]').src,
        html: document.body.innerText,
      })),
  );
  await page
    .getByRole('button', { name: 'Try again', exact: true })
    .waitFor({ timeout: 90000 });
  console.log(
    'Game load failure reported; call:',
    await page.evaluate(() => window.__voice.getSnapshot().phase),
  );
  await page.unroute('**/index.wasm');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector('.activity-loading'),
    {},
    { timeout: 120000 },
  );
  console.log('Retry recovered the game');
  const nextGame = page.frames().find((f) => f.url().includes('5180'));
  const canvas = nextGame.locator('#canvas');
  const box = await canvas.boundingBox();
  const scale = Math.min(box.width / 640, box.height / 360),
    dx = (box.width - 640 * scale) / 2,
    dy = (box.height - 360 * scale) / 2;
  await canvas.click({
    position: { x: dx + 230 * scale, y: dy + 227 * scale },
  });
  await page.locator('.activity-loading button').waitFor({ timeout: 10000 });
  console.log(
    'Game quit offers recovery:',
    await page.locator('.activity-loading button').innerText(),
  );
  await page.locator('.activity-loading button').click();
  await page.waitForFunction(
    () => !document.querySelector('.activity-loading'),
    {},
    { timeout: 120000 },
  );
  console.log('Game reopens after quit');
} finally {
  await browser.close();
}
