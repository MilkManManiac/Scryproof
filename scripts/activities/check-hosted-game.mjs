const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('https://scryproof.com/activities-proof', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Hosted activity proof</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><iframe title="Drain The Swamp" src="https://activities.scryproof.com/drain-the-swamp/" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay; fullscreen"></iframe><script>window.addEventListener('message',e=>{if(e.origin==='https://activities.scryproof.com'&&e.source===document.querySelector('iframe').contentWindow)window.gameStatus=e.data.status})</script>`,
    }),
  );
  await page.goto('https://scryproof.com/activities-proof');
  await page.waitForFunction(
    () => window.gameStatus === 'ready',
    {},
    { timeout: 120000 },
  );
  let game = page
    .frames()
    .find((f) => f.url().startsWith('https://activities.scryproof.com/'));
  console.log('Hosted game ready:', game.url());
  console.log(
    'Parent access denied:',
    await game.evaluate(() => {
      try {
        return !parent.document;
      } catch {
        return true;
      }
    }),
  );
  const blocks = await game.evaluate(async () => {
    let api = false;
    try {
      await fetch('https://scryproof.com/api/auth/me');
    } catch {
      api = true;
    }
    let mic = false;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      mic = true;
    }
    return {
      api,
      mic,
      node: typeof require === 'undefined',
      desktopBridge: typeof window.scryproofDesktop === 'undefined',
    };
  });
  console.log('Isolation:', JSON.stringify(blocks));
  if (Object.values(blocks).some((v) => !v)) throw Error('Isolation failure');
  const canvas = game.locator('#canvas');
  const box = await canvas.boundingBox();
  const scale = Math.min(box.width / 640, box.height / 360);
  const dx = (box.width - 640 * scale) / 2,
    dy = (box.height - 360 * scale) / 2;
  await canvas.click({
    position: { x: dx + 230 * scale, y: dy + 190 * scale },
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/scryproof-activity-character.png' });
  await canvas.click({
    position: { x: dx + 405 * scale, y: dy + 301 * scale },
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: '/tmp/scryproof-activity-gameplay.png' });
  await page.keyboard.press('Enter');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(2300);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');
  await page.waitForTimeout(3500);
  await page.keyboard.up('Space');
  await page.screenshot({ path: '/tmp/scryproof-activity-scooping.png' });
  await canvas.click({
    position: { x: dx + 320 * scale, y: dy + 321 * scale },
  });
  await page.waitForTimeout(35000);
  const readSave = async () =>
    game.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('/userfs');
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction('FILE_DATA');
            const store = tx.objectStore('FILE_DATA');
            const c = store.openCursor();
            c.onerror = () => reject(c.error);
            c.onsuccess = () => {
              const row = c.result;
              if (!row) return resolve(null);
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
  const save = await readSave();
  console.log('Saved gameplay:', {
    water: save?.water_carried,
    drained: save?.swamp_states?.[0]?.gallons_drained,
    keys: Object.keys(save ?? {}),
  });
  if (
    !(save?.water_carried > 0) &&
    !(save?.swamp_states?.[0]?.gallons_drained > 0)
  )
    throw Error('Played progress was not saved');
  await page.reload();
  await page.waitForFunction(
    () => window.gameStatus === 'ready',
    {},
    { timeout: 120000 },
  );
  const reloaded = page
    .frames()
    .find((f) => f.url().startsWith('https://activities.scryproof.com/'));
  game = reloaded;
  const reopened = await readSave();
  if (
    reopened?.water_carried !== save.water_carried ||
    reopened?.swamp_states?.[0]?.gallons_drained !==
      save.swamp_states[0].gallons_drained
  )
    throw Error('Progress changed after reopening');
  console.log(
    'Reopened save database:',
    await reloaded.evaluate(() => indexedDB.databases()),
  );
  await page.screenshot({ path: '/tmp/scryproof-activity-saved-title.png' });
  await page.screenshot({ path: '/tmp/scryproof-activity-hosted.png' });
  console.log(
    'Runtime errors before intentional CSP checks:',
    errors
      .filter(
        (e) =>
          !e.includes('Content Security Policy') &&
          !e.includes('Permissions policy') &&
          !e.includes('Refused to connect'),
      )
      .slice(0, 10),
  );
} finally {
  await browser.close();
}
