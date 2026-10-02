import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const { _electron: electron } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const desktop = fileURLToPath(new URL('../../desktop/', import.meta.url));
const app = await electron.launch({
  executablePath:
    process.env.ELECTRON_EXECUTABLE ??
    desktop + 'node_modules/electron/dist/electron',
  args: [desktop, '--no-sandbox'],
  env: {
    ...process.env,
    SCRYPROOF_SERVER: 'http://localhost:5179',
    SCRYPROOF_DEV_MEDIA: 'ws://127.0.0.1:7880',
  },
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
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
  console.log(
    'Desktop activities capability:',
    await page.evaluate(() => window.scryproofDesktop.activities),
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
  const game = page
    .frames()
    .find((f) => f.url().startsWith('https://activities.scryproof.com'));
  console.log('Desktop hosted game:', game.url());
  const isolation = await game.evaluate(() => {
    let parentBlocked = false;
    try {
      parent.document;
    } catch {
      parentBlocked = true;
    }
    return {
      node: typeof require === 'undefined',
      bridge: typeof window.scryproofDesktop === 'undefined',
      parentBlocked,
    };
  });
  assert.ok(
    Object.values(isolation).every(Boolean),
    'Game has no Node/preload/parent access',
  );
  console.log('Desktop frame isolation:', isolation);
  await page.screenshot({ path: '/tmp/scryproof-activity-desktop.png' });
} finally {
  await app.close();
}
