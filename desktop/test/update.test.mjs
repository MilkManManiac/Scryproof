/**
 * An update is only an update if Wes's key signed exactly these bytes. The
 * server is played by the test and may do anything a real one could.
 *
 *   npm run test:desktop
 */

import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { describe, test } from 'node:test';

import { openBundle, packBundle, readManifest, signBundle } from '../src/update-core.js';

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
