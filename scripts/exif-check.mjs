/**
 * Prove in a real browser that uploaded images lose their metadata.
 *
 * The canvas round trip in `web/src/lib/scrub-image.ts` has no equivalent in
 * Node, so the part of that file with the security property on it cannot be
 * covered by `npm test`. This drives a headless Chromium at
 * `web/exif-check.html`, which builds a JPEG carrying real GPS coordinates,
 * runs it through the scrubber and searches the bytes that come out.
 *
 *   npm run test:exif        # the web dev server must be running on :5173
 *
 * Chromium is driven over the DevTools protocol rather than with
 * `--virtual-time-budget --dump-dom`, which returns before an off-thread image
 * decode has finished and reports a page that is still running as a pass.
 *
 * GAMEPLAN.md section 1b, finding 6.
 */

import { spawn } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebSocket } from 'ws';

const PAGE = process.env.EXIF_CHECK_URL ?? 'http://localhost:5173/exif-check.html';
const PORT = 9333;

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

const browser = CANDIDATES.find((path) => existsSync(path));
if (!browser) {
  console.error('No Chromium-based browser found. Set CHROME to one.');
  process.exit(2);
}

const profile = join(tmpdir(), `scryproof-exif-${process.pid}`);

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let socket;
const cleanup = () => {
  try {
    socket?.close();
  } catch {}
  child.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
};
process.on('exit', cleanup);

/** The debugging port takes a moment to open; retry rather than sleeping blind. */
async function debuggerTarget() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The browser never opened its debugging port.');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

let nextId = 1;
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.id !== id) return;
      socket.off('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    };
    socket.on('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
  }
  return result.result.value;
}

async function main() {
  socket = await connect(await debuggerTarget());
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });

  // Poll for the page to finish rather than guessing how long a decode takes.
  const deadline = Date.now() + 60_000;
  let report = null;
  while (Date.now() < deadline) {
    report = await evaluate(`(() => {
      const verdict = document.getElementById('verdict');
      if (!verdict || verdict.textContent.indexOf('RESULT') !== 0) return null;
      return {
        verdict: verdict.textContent,
        lines: Array.from(document.querySelectorAll('#results li'))
          .map((item) => (item.className === 'pass' ? 'PASS  ' : 'FAIL  ') + item.textContent),
      };
    })()`).catch(() => null);
    if (report) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (!report) {
    console.error(`The page at ${PAGE} never reported a result.`);
    console.error('Is the web dev server running? npm run dev:web --workspace web');
    process.exit(1);
  }

  // A screenshot for the handoff doc, taken only once the verdict is on screen.
  if (process.env.EXIF_CHECK_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(process.env.EXIF_CHECK_SHOT, Buffer.from(shot.data, 'base64'));
    console.log(`screenshot: ${process.env.EXIF_CHECK_SHOT}`);
  }

  for (const line of report.lines) console.log(line);
  console.log(report.verdict);
  process.exit(report.verdict === 'RESULT: ALL PASS' ? 0 : 1);
}

main().catch((problem) => {
  console.error(problem.message);
  process.exit(2);
});
