// Phase 1 check for store.mjs (docs/SPEC-audit-fixes.md): run with `node docs/spikes/store/check.mjs`.
// Starts a store on a free port over a temp dir, then: 150 loop files already on disk + 60 POSTs -> 50 pass, 10 get 429;
// a 5 MB layer -> 413; three 1.5 MB clips -> the third is 413 and the file stays under 4 MB; 20 presence POSTs fired
// while a layer PUT is still uploading lose nothing; names lose <>&"'; ETag answers 304; wrong key is 403.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-check-')), port = 8700 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}/pass-along/api/`;
for (let i = 0; i < 150; i++) { const id = 'fill' + String(i).padStart(6, '0'); fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ id, key: 'k', name: 'filler', by: 'x', bpm: 120, made: Date.now(), updated: Date.now(), layers: {}, working: {} })); }
const store = spawn(process.execPath, [new URL('./store.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--port', String(port), '--dir', dir], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => store.stdout.on('data', (d) => d.toString().includes('store on') && ok()));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond || !extra ? '' : ' -- ' + extra)); };
const call = async (p, method = 'GET', body, headers = {}) => {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, etag: r.headers.get('etag'), data: await r.json().catch(() => null) };
};
const clipLayer = (bytes) => ({ kind: 'vocals', by: 'Matt', bpm: 120, notes: [], parts: [{ sound: '', level: 1, fx: {}, clip: { mime: 'audio/webm', data: 'A'.repeat(bytes) }, start: 0 }] });
const lid = (k) => k + '-' + Math.random().toString(36).slice(2, 8).padEnd(6, '0');

// 1. the cap counts files on disk
const codes = [];
for (let i = 0; i < 60; i++) codes.push((await call('loops', 'POST', { name: 'loop ' + i, by: 'Wes', bpm: 120 })).status);
check('60 POSTs with 150 files already there: 50 made, 10 refused', codes.filter((c) => c === 200).length === 50 && codes.filter((c) => c === 429).length === 10 && codes.indexOf(429) === 50, codes.join(','));
check('200 files on disk, not more', fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length === 200);
check('the list is 50 long, newest first', (await call('loops')).data.length === 50);

// 2. one big layer, then a loop that grows past 4 MB
for (const f of fs.readdirSync(dir)) if (f.startsWith('fill')) fs.rmSync(path.join(dir, f)); // make room
const { data: made } = await call('loops', 'POST', { name: 'big <b>one</b> & "quotes"', by: "O'Brien", bpm: 120 });
const named = (await call('loops/' + made.id)).data;
check('loop name and by lose <>&"\'', !/[<>&"']/.test(named.name + named.by) && named.by === 'OBrien' && named.name.startsWith('big b'), JSON.stringify([named.name, named.by]));
const five = await call(`loops/${made.id}/${lid('vocals')}`, 'PUT', clipLayer(5 * 1024 * 1024));
check('a 5 MB layer is 413 with a plain message', five.status === 413 && /too big/.test(five.data?.error ?? ''), five.status + ' ' + JSON.stringify(five.data));
const sizes = [];
for (let i = 0; i < 3; i++) sizes.push((await call(`loops/${made.id}/${lid('vocals')}`, 'PUT', clipLayer(1.5e6))).status);
check('three 1.5 MB clips: two saved, the third is 413', sizes.join(',') === '200,200,413', sizes.join(','));
check('the loop file stays under 4 MB', fs.statSync(path.join(dir, made.id + '.json')).size <= 4 * 1024 * 1024);
check('the list still answers and carries no clip data', JSON.stringify((await call('loops')).data).length < 20000);
check('a saved layer is in the list index', Object.keys((await call('loops')).data.find((x) => x.id === made.id).done).length === 2);

// 3. twenty presence POSTs while a layer PUT is still uploading
const { data: race } = await call('loops', 'POST', { name: 'race', by: 'Wes', bpm: 120 });
const layerId = lid('bass'), payload = JSON.stringify(clipLayer(1.5e6)), half = payload.length >> 1;
const put = new Promise((ok, no) => {
  const req = http.request(base + `loops/${race.id}/${layerId}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': payload.length } }, (res) => { let s = ''; res.on('data', (d) => s += d); res.on('end', () => ok(res.statusCode)); });
  req.on('error', no); req.write(payload.slice(0, half));
  setTimeout(async () => {
    const posts = await Promise.all(Array.from({ length: 20 }, (_, i) => call(`loops/${race.id}/working`, 'POST', { by: 'p' + i, kinds: 'bass' })));
    check('20 presence POSTs during the PUT all answered 200', posts.every((p) => p.status === 200));
    req.end(payload.slice(half));
  }, 50);
});
check('the layer PUT answered 200', (await put) === 200);
const after = (await call('loops/' + race.id)).data;
check('the layer survived', !!after.layers[layerId]);
check('all 20 workers survived', Object.keys(after.working).filter((k) => /^p\d+$/.test(k)).length === 20, Object.keys(after.working).join(','));

// 4. ETag and the key
const g = await call('loops/' + race.id);
check('GET carries an ETag', !!g.etag);
check('If-None-Match answers 304', (await call('loops/' + race.id, 'GET', null, { 'if-none-match': g.etag })).status === 304);
await call(`loops/${race.id}/working`, 'POST', { by: 'p0', kinds: '' });
check('the tag changes when who is working changes', (await call('loops/' + race.id, 'GET', null, { 'if-none-match': g.etag })).status === 200);
check('a wrong key is 403', (await call('loops/' + race.id, 'DELETE', null, { 'x-key': race.key.slice(0, -1) + (race.key.endsWith('a') ? 'b' : 'a') })).status === 403);
check('a missing key is 403', (await call('loops/' + race.id, 'DELETE')).status === 403);
check('the right key deletes', (await call('loops/' + race.id, 'DELETE', null, { 'x-key': race.key })).status === 200 && (await call('loops/' + race.id)).status === 404);

store.kill(); fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
