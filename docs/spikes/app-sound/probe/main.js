// Probe: which share-audio routes in this Electron leave out (a) our own sound and (b) other programs.
// Our page plays 440 Hz. tone-1000 is "Spotify" (the window we share), tone-1500 is "the game".
const { app, BrowserWindow, desktopCapturer, session, ipcMain } = require('electron');
const _fs = require('fs'); const _out = require('path').join(__dirname, 'out.txt'); console.log = (...a) => _fs.appendFileSync(_out, a.join(' ') + '\n');
const extra = process.argv.find((a) => a.startsWith('--blink='));
if (extra) app.commandLine.appendSwitch('enable-blink-features', extra.slice(8));
let nextAudio = 'loopback';
let nextVideo = null;
app.whenReady().then(async () => {
  session.defaultSession.setDisplayMediaRequestHandler((req, done) => {
    console.log('handler request', JSON.stringify({ audioRequested: req.audioRequested, videoRequested: req.videoRequested }));
    try { done(nextAudio ? { video: nextVideo, audio: nextAudio } : { video: nextVideo }); } catch (e) { console.log('done threw', e.message); }
  });
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  const target = sources.find((s) => s.name === 'tone-1000');
  const screen = sources.find((s) => s.id.startsWith('screen:'));
  console.log('target', target?.id, 'screen', screen?.id);
  nextVideo = target ?? screen;
  const w = new BrowserWindow({ show: true, width: 400, height: 200, webPreferences: { nodeIntegration: true, contextIsolation: false, autoplayPolicy: 'no-user-gesture-required' } });
  ipcMain.on('log', (_e, m) => console.log(m));
  ipcMain.handle('set', (_e, audio, which) => { nextAudio = audio; nextVideo = which === 'screen' ? screen : target; });
  ipcMain.on('done', () => app.quit());
  ipcMain.handle('ids', () => ({ target: target.id, screen: screen.id }));
  console.log('os', process.getSystemVersion());
  _fs.writeFileSync(__dirname + "/page.html", `<title>probe</title><script>
const { ipcRenderer } = require('electron');
const log = (m) => ipcRenderer.send('log', m);
const ctx = new AudioContext();
const own = ctx.createOscillator(); const og = ctx.createGain(); own.frequency.value = 440; og.gain.value = 0.0003; own.connect(og).connect(ctx.destination); own.start();
async function measure(stream) {
  const t = stream.getAudioTracks()[0];
  if (!t) return 'no audio track';
  const c = new AudioContext(); const src = c.createMediaStreamSource(new MediaStream([t]));
  const an = c.createAnalyser(); an.fftSize = 8192; src.connect(an);
  await new Promise((r) => setTimeout(r, 2500));
  const bins = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(bins);
  const at = (f) => { const i = Math.round(f / (c.sampleRate / an.fftSize)); return Math.max(bins[i-1], bins[i], bins[i+1]).toFixed(0); };
  const r = 'own440=' + at(440) + 'dB  spotify1000=' + at(1000) + 'dB  game1500=' + at(1500) + 'dB  settings=' + JSON.stringify(t.getSettings());
  c.close(); stream.getTracks().forEach((x) => x.stop());
  return r;
}
async function tryOne(name, audio, which, constraints) {
  await ipcRenderer.invoke('set', audio, which);
  try { log(name + ': ' + await measure(await navigator.mediaDevices.getDisplayMedia(constraints))); }
  catch (e) { log(name + ': FAILED ' + e.name + ' ' + e.message); }
}
(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const ids = await ipcRenderer.invoke('ids');
  for (const [name, id] of [['G legacy desktop audio, window', ids.target], ['H legacy desktop audio, screen', ids.screen]]) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id } }, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id } } });
      log(name + ': ' + await measure(s));
    } catch (e) { log(name + ': FAILED ' + e.name + ' ' + e.message); }
  }
  await tryOne('A loopback, plain', 'loopback', 'window', { video: true, audio: true });
  await tryOne('B loopback + restrictOwnAudio', 'loopback', 'window', { video: true, audio: { restrictOwnAudio: true } });
  await tryOne('C loopback + suppressLocalAudioPlayback', 'loopback', 'window', { video: true, audio: { suppressLocalAudioPlayback: true } });
  await tryOne('D loopback + windowAudio:window', 'loopback', 'window', { video: true, audio: true, windowAudio: 'window' });
  await tryOne('E loopback + windowAudio:window + restrictOwnAudio', 'loopback', 'window', { video: true, audio: { restrictOwnAudio: true }, windowAudio: 'window' });
  await tryOne('F screen loopback + restrictOwnAudio', 'loopback', 'screen', { video: true, audio: { restrictOwnAudio: true } });
  ipcRenderer.send('done');
})();
</script>`); w.loadFile(__dirname + "/page.html");
});
