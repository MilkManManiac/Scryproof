/** Local integration check: real Godot export, touch events, saves and rotation.
 * Start the seeded API on 8797, Vite on 5179 with
 * VITE_ACTIVITIES_ORIGIN=http://localhost:5180, and dev-server.py on 5180.
 * Add MOBILE_CALL=1 with local LiveKit running to check call continuity too.
 * Chrome emulation is not a physical iPhone/Android acceptance test.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const shots = process.env.SHOTS ?? '/tmp/scryproof-mobile-shots';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: false,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('scryproof.walkthrough.v1', 'done');
    // Desktop Chrome emulation retains this API; real phone browsers lack it.
    navigator.mediaDevices.getDisplayMedia = undefined;
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const output = audio.createMediaStreamDestination();
      oscillator.connect(output);
      oscillator.start();
      return output.stream;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:5179');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'wes',
        password: 'seed-passphrase-for-local-dev',
      }),
    });
    if (!r.ok) throw Error('Local login failed');
  });
  await page.reload();
  await page.waitForSelector('.rail', { state: 'attached' });
  if (process.env.MOBILE_CALL) {
    await page.evaluate(() => {
      const channel = [
        ...document.querySelectorAll('button, [role=button], .channel'),
      ].find((el) => el.textContent.includes('♫'));
      if (!channel) throw Error('No local voice channel');
      channel.click();
    });
    await page.waitForFunction(
      () => window.__voice?.getSnapshot().phase === 'connected',
    );
  }
  await page.evaluate(async () => {
    const { activities, ACTIVITIES } = await import('/src/lib/activities.ts');
    activities.start(ACTIVITIES[0]);
  });
  await page.waitForSelector('.activity-player');
  await page.waitForSelector('.activity-loading', {
    state: 'hidden',
    timeout: 120000,
  });
  const game = page
    .frames()
    .find((frame) => frame.url().startsWith('http://localhost:5180/'));
  assert.ok(game, 'Uses the local export, not the production game');
  await game.evaluate(() => {
    window.mobileProof = 'same running game';
  });
  const player = page.locator('.activity-player');
  const frame = page.locator('.activity-stage iframe');
  const tap = async (x, y) => {
    const b = await frame.boundingBox();
    const scale = Math.min(b.width / 640, b.height / 360);
    await page.touchscreen.tap(
      b.x + (b.width - 640 * scale) / 2 + x * scale,
      b.y + (b.height - 360 * scale) / 2 + y * scale,
    );
    await page.waitForTimeout(1000);
  };
  const hold = async (points, duration) => {
    const b = await frame.boundingBox();
    const scale = Math.min(b.width / 640, b.height / 360);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points.map(([x, y], id) => ({
        id,
        x: b.x + (b.width - 640 * scale) / 2 + x * scale,
        y: b.y + (b.height - 360 * scale) / 2 + y * scale,
      })),
    });
    await page.waitForTimeout(duration);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  };
  async function layout(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    assert.ok((await player.getAttribute('class')).includes('compact'));
    assert.ok(
      await player.evaluate((el) => el.scrollWidth <= el.clientWidth),
      'No horizontal overflow',
    );
    const p = await player.boundingBox();
    assert.equal(p.height, height, 'Uses the available viewport height');
    const b = await frame.boundingBox();
    assert.ok(b.height > height * 0.6, 'Game keeps most of the screen');
    assert.equal(
      await game.evaluate(() => window.mobileProof),
      'same running game',
    );
    assert.equal(
      await page.locator('.activity-rotate-hint').isVisible(),
      height > width,
    );
  }
  await layout(390, 844);
  // Start using touch while still in portrait, then rotate in the character picker.
  await tap(230, 190);
  await layout(844, 390);
  await tap(552, 210); // Piggy: its persisted id proves the character picker accepted touch.
  await tap(405, 301);
  await page.screenshot({ path: `${shots}/touch-help.png` });
  await tap(320, 180);
  await hold([[80, 296]], 2300); // Walk to the first water hole.
  await hold([[602, 280]], 3500); // Scoop using the touch button, no keyboard.
  await page.screenshot({ path: `${shots}/landscape.png` });
  await tap(605, 338); // HUD menu uses normal Godot Button nodes.
  await page.screenshot({ path: `${shots}/game-menu.png` });
  await tap(320, 104); // Resume.
  await layout(390, 844);
  await page.screenshot({ path: `${shots}/portrait.png` });
  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [800, 1280],
    [1280, 800],
    [375, 667],
    [667, 375],
  ]) {
    await layout(width, height);
  }
  await layout(844, 390);
  await hold(
    [
      [80, 296],
      [602, 280],
    ],
    350,
  ); // Multi-touch remains usable.
  await page.getByRole('button', { name: 'Options', exact: true }).tap();
  assert.ok(
    await page
      .getByRole('button', { name: 'Share gameplay', exact: true })
      .isDisabled(),
  );
  assert.ok(
    await page
      .getByText('This browser does not support sharing your screen.', {
        exact: false,
      })
      .isVisible(),
  );
  await page.screenshot({ path: `${shots}/options.png` });
  // Android Back closes options first, then minimizes the game, without a reload.
  await page.evaluate(() => history.back());
  await page.waitForFunction(
    () =>
      document
        .querySelector('.activity-menu-toggle')
        ?.getAttribute('aria-expanded') === 'false',
  );
  assert.equal(await player.isVisible(), true);
  await page.evaluate(() => history.back());
  await page.waitForSelector('.activity-resume');
  await page.locator('.activity-resume').tap();
  assert.equal(
    await game.evaluate(() => window.mobileProof),
    'same running game',
  );
  await page.getByRole('button', { name: 'Options', exact: true }).tap();
  await page.getByRole('button', { name: 'End activity', exact: true }).tap();
  await page.getByRole('dialog', { name: 'End activity?' }).waitFor();
  await page.evaluate(() => history.back());
  await page
    .getByRole('dialog', { name: 'End activity?' })
    .waitFor({ state: 'hidden' });
  assert.equal(
    await game.evaluate(() => window.mobileProof),
    'same running game',
  );
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  if (process.env.MOBILE_CALL) {
    assert.ok(
      await page.locator('.activity-call .connection-panel').isVisible(),
    );
    assert.equal(
      await page.evaluate(() => window.__voice.getSnapshot().phase),
      'connected',
    );
    assert.equal(
      await page.evaluate(() => window.__voice.getSnapshot().encrypted),
      true,
    );
  }
  const readSave = (source = game) =>
    source.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('/userfs');
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const cursor = db
              .transaction('FILE_DATA')
              .objectStore('FILE_DATA')
              .openCursor();
            cursor.onsuccess = () => {
              const row = cursor.result;
              if (!row) {
                db.close();
                return resolve(null);
              }
              if (row.key.endsWith('save_data.json')) {
                const state = JSON.parse(
                  new TextDecoder().decode(row.value.contents),
                );
                db.close();
                return resolve(state);
              }
              row.continue();
            };
          };
        }),
    );
  let save;
  for (let i = 0; i < 40; i++) {
    save = await readSave();
    if (save?.water_carried > 0) break;
    await page.waitForTimeout(1000);
  }
  assert.equal(save?.character_id, 'piggy', 'Touch selection persisted');
  assert.ok(
    save?.water_carried > 0,
    'Touch movement and scooping produced saved progress',
  );
  console.log('Saved touch gameplay:', {
    character: save.character_id,
    water: save.water_carried,
  });
  assert.deepEqual(errors, [], 'No runtime errors');
  await page.reload();
  await page.waitForSelector('.rail', { state: 'attached' });
  await page.evaluate(async () => {
    const { activities, ACTIVITIES } = await import('/src/lib/activities.ts');
    activities.start(ACTIVITIES[0]);
  });
  await page.waitForSelector('.activity-player');
  await page.waitForSelector('.activity-loading', {
    state: 'hidden',
    timeout: 120000,
  });
  const reopened = page
    .frames()
    .find((frame) => frame.url().startsWith('http://localhost:5180/'));
  // Continue is at the first title-menu row when a save exists.
  await page.screenshot({ path: `${shots}/reopened.png` });
  assert.ok(reopened);
  const loaded = await readSave(reopened);
  assert.equal(loaded.character_id, save.character_id);
  assert.ok(
    loaded.water_carried >= save.water_carried,
    'Played progress survives reopening',
  );
  console.log(
    'PASS: touch gameplay, layout, rotation, Back, confirmation, persistence' +
      (process.env.MOBILE_CALL ? ', encrypted call continuity' : '') +
      `. Screenshots: ${shots}`,
  );
} finally {
  await browser.close();
}
