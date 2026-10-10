// Pass-along loop store. Zero dependencies. One JSON file a loop, under --dir.
//   production: node store.mjs --sock /run/pass-along-store/store.sock --dir /var/lib/pass-along-store
//   dev:        node store.mjs --port 8766 --dir <tmp> --static docs/spikes   (serves the page too, with the real CSP)
// Wes: "an individual session that's like saved... I finish my part... someone else can jump in pick up that
// session do the instrument they want... over the course of the day people can jump back in and see how it's progressing."
//   GET  /pass-along/api/loops                 the loops, newest first
//   POST /pass-along/api/loops {name,by,bpm}   make one -> {id}
//   GET  /pass-along/api/loops/:id             the whole loop
//   PUT  /pass-along/api/loops/:id/:layer      {kind,by,bpm,kit,notes,parts}: save that layer; 409 if that id is taken
//   POST /pass-along/api/loops/:id/working     {by,kinds}: "I am on a melody" for a minute, shown to the others
//   DELETE /pass-along/api/loops/:id            with the creator's key in x-key
// Layer ids are <kind>-<6 chars>, made by the page, so any number of layers of a kind can live in one loop
// (Wes: "let people add as much as they want to the song"). Loops untouched for KEEP_DAYS go on the next list.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const DIR = arg('dir') || '/var/lib/pass-along-store', STATIC = arg('static') && path.resolve(arg('static'));
const KINDS = ['bass', 'kicks', 'hats', 'pads', 'melody', 'vocals'], MAX_BODY = 1800 * 1024, MAX_LOOPS = 200, MAX_LAYERS = 24, KEEP_DAYS = 14, WORKING_MS = 60e3;
const okLayer = (id) => /^[a-z]+-[a-z0-9]{6}$/.test(id) && KINDS.includes(id.split('-')[0]);
const MAX_CLIP = 1.2e6 * 4 / 3 + 8; // a vocals clip, base64; webm/opus at 64 kbit is well under this for one loop
const CSP = "sandbox allow-scripts allow-same-origin; default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'";
fs.mkdirSync(DIR, { recursive: true });

const file = (id) => path.join(DIR, id + '.json');
const okId = (id) => /^[a-z0-9]{10}$/.test(id);
const read = (id) => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } };
const write = (loop) => { const tmp = file(loop.id) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(loop)); fs.renameSync(tmp, file(loop.id)); };
const clean = (s, n) => String(s ?? '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, n);
const num = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);

function list() {
  const cutoff = Date.now() - KEEP_DAYS * 864e5, out = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue;
    const l = read(f.slice(0, -5)); if (!l) continue;
    if (l.updated < cutoff) { fs.rmSync(file(l.id), { force: true }); continue; }
    out.push({ id: l.id, name: l.name, by: l.by, bpm: l.bpm, updated: l.updated, working: busy(l), done: Object.fromEntries(Object.entries(l.layers).map(([k, v]) => [k, { by: v.by, kind: v.kind ?? k.split('-')[0] }])) });
  }
  return out.sort((a, b) => b.updated - a.updated).slice(0, 50);
}
const busy = (l) => Object.fromEntries(Object.entries(l.working ?? {}).filter(([, w]) => w.at > Date.now() - WORKING_MS));
const shown = (l) => { const { key, ...rest } = l; return { ...rest, working: busy(l) }; }; // the creator's key never leaves the box
// Only what the page needs comes through; anything else in the body is dropped.
function layerFrom(b, id) {
  const notes = (Array.isArray(b.notes) ? b.notes : []).slice(0, 512)
    .map((n) => ({ row: num(n.row, 0, 63, 0) | 0, start: num(n.start, 0, 63, 0) | 0, len: num(n.len, 1, 64, 2) | 0 }));
  const parts = (Array.isArray(b.parts) ? b.parts : []).slice(0, 4)
    .map((p) => ({ sound: clean(p.sound, 40), level: num(p.level, 0, 1.5, 1), fx: Object.fromEntries(Object.entries(p.fx ?? {}).slice(0, 8).map(([k, v]) => [clean(k, 12), num(v, 0, 1, 0)])),
      ...(p.clip && typeof p.clip.data === 'string' && p.clip.data.length <= MAX_CLIP && /^[A-Za-z0-9+/=]*$/.test(p.clip.data)
        ? { clip: { mime: clean(p.clip.mime, 40) || 'audio/webm', data: p.clip.data }, start: num(p.start, 0, 63, 0) | 0 } : {}) }));
  return { kind: id.split('-')[0], by: clean(b.by, 24) || 'someone', bpm: num(b.bpm, 60, 200, 120) | 0, kit: clean(b.kit, 20), notes, parts, at: Date.now() };
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
function body(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > MAX_BODY) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { no(new Error('json')); } });
    req.on('error', no);
  });
}
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(2); // after pass-along/api
  if (parts[0] !== 'loops') return json(res, 404, { error: 'no' });
  if (parts.length === 1 && req.method === 'GET') return json(res, 200, list());
  if (parts.length === 1 && req.method === 'POST') {
    if (list().length >= MAX_LOOPS) return json(res, 429, { error: 'full' });
    const b = await body(req);
    let id; do { id = crypto.randomBytes(10).toString('hex').replace(/[^a-z0-9]/g, '').slice(0, 10); } while (id.length < 10 || fs.existsSync(file(id)));
    const key = crypto.randomBytes(16).toString('hex');
    const loop = { id, key, name: clean(b.name, 40) || 'a loop', by: clean(b.by, 24) || 'someone', bpm: num(b.bpm, 60, 200, 120) | 0, made: Date.now(), updated: Date.now(), layers: {}, working: {} };
    write(loop); return json(res, 200, { id, key });
  }
  const id = parts[1]; if (!okId(id)) return json(res, 404, { error: 'no' });
  const loop = read(id); if (!loop) return json(res, 404, { error: 'gone' });
  if (parts.length === 2 && req.method === 'GET') return json(res, 200, shown(loop));
  if (parts.length === 2 && req.method === 'DELETE') {
    if (!loop.key || req.headers['x-key'] !== loop.key) return json(res, 403, { error: 'not yours' });
    fs.rmSync(file(id), { force: true }); return json(res, 200, { ok: true });
  }
  if (parts.length === 3 && parts[2] === 'working' && req.method === 'POST') {
    const b = await body(req), by = clean(b.by, 24) || 'someone', kinds = clean(b.kinds, 60);
    loop.working = busy(loop); if (kinds) loop.working[by] = { kinds, at: Date.now() }; else delete loop.working[by];
    write(loop); return json(res, 200, { ok: true });
  }
  if (parts.length === 3 && req.method === 'PUT' && okLayer(parts[2])) {
    if (loop.layers[parts[2]]) return json(res, 409, { error: 'taken', loop: shown(loop) });
    if (Object.keys(loop.layers).length >= MAX_LAYERS) return json(res, 429, { error: 'that loop is full' });
    const b = await body(req), layer = layerFrom(b, parts[2]);
    loop.layers[parts[2]] = layer; loop.bpm = layer.bpm; loop.updated = Date.now();
    write(loop); return json(res, 200, shown(loop));
  }
  return json(res, 405, { error: 'no' });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
function serve(req, res, url) { // dev only
  let p = url.pathname.replace(/^\/pass-along\/?/, '') || 'index.html';
  const f = path.join(STATIC, p === 'index.html' ? 'passalong.html' : p);
  if (!f.startsWith(STATIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-security-policy': CSP });
  fs.createReadStream(f).pipe(res);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const go = url.pathname.startsWith('/pass-along/api/') ? api(req, res, url) : STATIC ? serve(req, res, url) : json(res, 404, { error: 'no' });
  Promise.resolve(go).catch((e) => json(res, e.message === 'big' ? 413 : 400, { error: e.message }));
});
server.requestTimeout = 10000;
if (arg('sock')) { try { fs.unlinkSync(arg('sock')); } catch {} server.listen(arg('sock'), () => { fs.chmodSync(arg('sock'), 0o666); console.log('store on ' + arg('sock')); }); }
else server.listen(+(arg('port') || 8766), '127.0.0.1', () => console.log('store on http://127.0.0.1:' + (arg('port') || 8766) + '/pass-along/'));
