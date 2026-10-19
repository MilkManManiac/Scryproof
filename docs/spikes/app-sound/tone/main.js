// A window that plays one steady tone. Launched on its own so it is a separate process tree.
const { app, BrowserWindow } = require('electron');
const freq = Number(process.argv.find((a) => a.startsWith('--freq='))?.slice(7) ?? 1000);
app.whenReady().then(() => {
  const w = new BrowserWindow({ width: 300, height: 120, title: `tone-${freq}`, webPreferences: { autoplayPolicy: 'no-user-gesture-required' } });
  w.loadURL(`data:text/html,<title>tone-${freq}</title><body>tone ${freq}<script>
    const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = ${freq}; g.gain.value = 0.0003; o.connect(g).connect(c.destination); o.start();
    document.title = 'tone-${freq}';
  </script>`);
  w.on('page-title-updated', (e) => e.preventDefault());
  setTimeout(() => app.quit(), 120000);
});
