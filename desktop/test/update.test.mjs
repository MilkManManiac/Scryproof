/**
 * An update is only an update if Wes's key signed exactly these bytes. The
 * server is played by the test and may do anything a real one could.
 *
 *   npm run test:desktop
 */

import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { readInstallerManifest, signInstaller } from '../src/installer-core.js';
import { MAX_DOWNLOAD_BYTES, openBundle, packBundle, readManifest, saveCapped, signBundle } from '../src/update-core.js';

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) };
};

const FILES = { 'index.html': Buffer.from('<!doctype html><p>new</p>'), 'assets/app.js': Buffer.from('console.log(1)') };

describe('a genuine update', () => {
  test('verifies, and gives back exactly the files that went in', () => {
    const wes = pair();
    const bundle = packBundle(FILES);
    const manifest = readManifest(JSON.stringify(signBundle(bundle, 100, wes.privateKey)), wes.publicKeyPem);
    assert.ok(manifest);
    assert.equal(manifest.version, 100);
    const files = openBundle(bundle, manifest);
    assert.ok(files);
    assert.deepEqual([...files.keys()].sort(), ['assets/app.js', 'index.html']);
    assert.equal(files.get('assets/app.js').toString(), 'console.log(1)');
  });
});

describe('what a server could try', () => {
  test('signing with a key of its own', () => {
    const wes = pair();
    const server = pair();
    const bundle = packBundle(FILES);
    assert.equal(readManifest(JSON.stringify(signBundle(bundle, 100, server.privateKey)), wes.publicKeyPem), null);
  });

  test('keeping the real signature and changing the code', () => {
    const wes = pair();
    const manifest = readManifest(JSON.stringify(signBundle(packBundle(FILES), 100, wes.privateKey)), wes.publicKeyPem);
    const poisoned = packBundle({ ...FILES, 'assets/app.js': Buffer.from('steal()') });
    assert.equal(openBundle(poisoned, manifest), null);
    // Even with the size made to match.
    assert.equal(openBundle(Buffer.alloc(manifest.size, 1), manifest), null);
  });

  test('keeping the real signature and claiming a newer version', () => {
    const wes = pair();
    const signed = signBundle(packBundle(FILES), 100, wes.privateKey);
    assert.equal(readManifest(JSON.stringify({ ...signed, version: 999 }), wes.publicKeyPem), null);
  });

  test('pointing the real signature at a different hash', () => {
    const wes = pair();
    const signed = signBundle(packBundle(FILES), 100, wes.privateKey);
    const other = signBundle(packBundle({ 'index.html': Buffer.from('x') }), 100, pair().privateKey);
    assert.equal(readManifest(JSON.stringify({ ...signed, sha256: other.sha256 }), wes.publicKeyPem), null);
  });

  test('sending nonsense', () => {
    const wes = pair();
    for (const raw of ['', '{}', 'null', '[]', '{"version":"1"}', '{"version":-1,"sha256":"","size":1,"signature":""}', '<html>']) {
      assert.equal(readManifest(raw, wes.publicKeyPem), null);
    }
  });

  test('a bundle with a path that climbs out, or with no app in it, is refused whole', () => {
    const wes = pair();
    for (const files of [{ 'index.html': Buffer.from('x'), '../evil.js': Buffer.from('x') }, { 'assets/app.js': Buffer.from('x') }]) {
      const bundle = packBundle(files);
      const manifest = readManifest(JSON.stringify(signBundle(bundle, 100, wes.privateKey)), wes.publicKeyPem);
      assert.equal(openBundle(bundle, manifest), null);
    }
  });

  test('a key that is not Ed25519 is not a key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    void privateKey;
    const wes = pair();
    const signed = signBundle(packBundle(FILES), 100, wes.privateKey);
    assert.equal(readManifest(JSON.stringify(signed), publicKey.export({ type: 'spki', format: 'pem' })), null);
  });
});

describe('the recovery key', () => {
  test('a manifest signed by either trusted key verifies; one signed by neither does not', () => {
    const wes = pair();
    const recovery = pair();
    const stranger = pair();
    const trusted = [wes.publicKeyPem, recovery.publicKeyPem];
    const bundle = packBundle(FILES);
    for (const signer of [wes, recovery]) {
      const manifest = readManifest(JSON.stringify(signBundle(bundle, 100, signer.privateKey)), trusted);
      assert.ok(manifest);
      assert.ok(openBundle(bundle, manifest));
    }
    assert.equal(readManifest(JSON.stringify(signBundle(bundle, 100, stranger.privateKey)), trusted), null);
    assert.equal(readManifest(JSON.stringify(signBundle(bundle, 100, wes.privateKey)), []), null);
  });

  test('an installer signed by the recovery key verifies too, and by neither does not', () => {
    const recovery = pair();
    const trusted = [pair().publicKeyPem, recovery.publicKeyPem];
    const facts = { version: '0.6.0', sha256: 'a'.repeat(64), size: 1000 };
    assert.ok(readInstallerManifest(JSON.stringify(signInstaller(facts, recovery.privateKey)), trusted));
    assert.equal(readInstallerManifest(JSON.stringify(signInstaller(facts, pair().privateKey)), trusted), null);
  });

  test('a broken key in the list does not stop the good one', () => {
    const wes = pair();
    const signed = JSON.stringify(signBundle(packBundle(FILES), 100, wes.privateKey));
    assert.ok(readManifest(signed, ['not a key', wes.publicKeyPem]));
  });

  test('is baked into the app, and is not the everyday key', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url));
    const file = join(src, 'update-key-recovery.pub.pem');
    assert.ok(existsSync(file));
    const pem = readFileSync(file, 'utf8');
    assert.equal(createPublicKey(pem).asymmetricKeyType, 'ed25519');
    assert.notEqual(pem.replace(/\r\n/g, '\n'), readFileSync(join(src, 'update-key.pub.pem'), 'utf8').replace(/\r\n/g, '\n'));
  });
});

describe('a download', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scryproof-download-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const chunks = (count, size) => Readable.from(Array.from({ length: count }, (_, i) => Buffer.alloc(size, i)));

  test('goes to disk whole when it is within its size', async () => {
    const path = join(dir, 'ok.part');
    assert.equal(await saveCapped(chunks(4, 1024), path, 4096), 4096);
    assert.equal(readFileSync(path).length, 4096);
  });

  test('stops as soon as it passes the size it was signed at', async () => {
    let pulled = 0;
    async function* endless() {
      for (;;) {
        pulled += 1;
        yield Buffer.alloc(1024);
      }
    }
    await assert.rejects(saveCapped(endless(), join(dir, 'big.part'), 4096), /bigger than it was signed at/);
    assert.ok(pulled <= 6, `read ${pulled} chunks before stopping`);
  });

  test('never past the ceiling, whatever size it claims', async () => {
    assert.equal(MAX_DOWNLOAD_BYTES, 512 * 1024 * 1024);
    // One chunk just past the ceiling, against a claimed size far beyond it. Only its length is
    // read before the refusal, so a stand-in saves allocating 256 MB.
    const huge = Readable.from([{ length: MAX_DOWNLOAD_BYTES + 1 }], { objectMode: true });
    await assert.rejects(saveCapped(huge, join(dir, 'ceiling.part'), 10 * MAX_DOWNLOAD_BYTES), /bigger than it was signed at/);
  });
});
