// Chain probe: the real preload + the main process's helper code + the real app-sound.ts.
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { existsSync, appendFileSync } = require('fs');
const { join } = require('path');
const out = join(__dirname, 'out.txt');
const log = (m) => appendFileSync(out, m + '\n');
const APP_SOUND_EXE = 'C:/Users/weshu/CodeProjects/GoOffline/desktop/app-sound/app-sound.exe';
let win, appSound = null;
const ours = () => true;
// ---- copied from desktop/src/main.js ----
function sendAppSound(channel, chunk) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, chunk);
}
function stopAppSound() {
  const child = appSound;
  appSound = null;
  if (!child) return;
  child.stdin.end();
  child.kill();
}
function startAppSound(hwnd) {
  stopAppSound();
  if (process.platform !== 'win32' || !existsSync(APP_SOUND_EXE)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(APP_SOUND_EXE, [hwnd], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    appSound = child;
    child.stdin.on('error', () => undefined);
    let started = false;
    let said = '';
    const timer = setTimeout(() => settle(false), 3000);
    const settle = (ok) => {
      clearTimeout(timer);
      if (ok && !started && appSound === child) {
        started = true;
        sendAppSound('scryproof:app-sound-start');
      }
      if (!ok && appSound === child) stopAppSound();
      resolve(ok);
    };
    child.stderr.on('data', (text) => {
      said += text;
      if (said.startsWith('ok ')) settle(true);
      else if (said.includes('\n')) {
        log(`app sound: ${said.trim()}`);
        settle(false);
      }
    });
    child.stdout.on('data', (chunk) => {
      if (started && appSound === child) sendAppSound('scryproof:app-sound-data', chunk);
    });
    child.on('error', () => settle(false));
    child.on('exit', (code) => {
      log('helper exit ' + code);
      if (started) sendAppSound('scryproof:app-sound-end');
      if (appSound === child) appSound = null;
      settle(false);
    });
  });
}
// ----
ipcMain.on('scryproof:app-sound-stop', () => { log('page asked stop'); stopAppSound(); });
ipcMain.on('chain-log', (_e, m) => log(m));
ipcMain.on('chain-done', () => setTimeout(() => app.quit(), 1000));
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 300, height: 200, webPreferences: { preload: 'C:/Users/weshu/CodeProjects/GoOffline/desktop/src/preload.cjs', sandbox: true, contextIsolation: true } });
  win.webContents.on('preload-error', (_e, p, err) => log('preload error ' + err.message));
  win.webContents.on('console-message', (e) => log('console: ' + (e.message ?? '')));
  // the page reports through a tiny extra bridge
  win.webContents.on('did-finish-load', async () => {
    await win.webContents.executeJavaScript(`window.chainLog = (m) => console.log('LOG ' + m); window.chainDone = () => console.log('DONE');`);
  });
  win.webContents.on('console-message', (e) => { const m = e.message ?? ''; if (m === 'DONE') setTimeout(() => app.quit(), 1000); });
  await win.loadFile(join(__dirname, 'page.html'));
  const hwnd = process.argv.find((a) => a.startsWith('--hwnd='))?.slice(7);
  log('hwnd ' + hwnd + ' exe ' + existsSync(APP_SOUND_EXE) + ' bridge ' + await win.webContents.executeJavaScript('typeof window.scryproofDesktop'));
  log('start ' + await startAppSound(hwnd));
  setTimeout(() => app.quit(), 20000);
});
