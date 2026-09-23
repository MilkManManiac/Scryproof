/**
 * An installer is only run if Wes's key signed exactly these bytes as an
 * installer, and only if it is newer than the app running it. The server is
 * played by the test and may do anything a real one could.
 *
 *   npm test          (in desktop/)
 */

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import {
  hashFile,
  installerFileName,
  isNewerVersion,
  readInstallerManifest,
  signInstaller,
  verifyInstallerFile,
  versionFromFileName,
} from '../src/installer-core.js';
import { packBundle, readManifest, signBundle } from '../src/update-core.js';

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) };
};

const dir = mkdtempSync(join(tmpdir(), 'scryproof-installer-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200_000, 7), Buffer.from('the real installer')]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
let n = 0;
const onDisk = (bytes) => {
  const path = join(dir, `file-${(n += 1)}.exe`);
  writeFileSync(path, bytes);
  return path;
};
/** What sign-installer.mjs writes, as the app would receive it over the network. */
const published = (key, version = '0.5.0', bytes = EXE) =>
  JSON.stringify(signInstaller({ version, sha256: sha256(bytes), size: bytes.length }, key));

describe('a genuine installer', () => {
  test('verifies, and the file on disk matches', async () => {
    const wes = pair();
    const manifest = readInstallerManifest(published(wes.privateKey), wes.publicKeyPem);
    assert.ok(manifest);
    assert.equal(manifest.version, '0.5.0');
    assert.equal(await verifyInstallerFile(onDisk(EXE), manifest), true);
    assert.equal(await hashFile(onDisk(EXE)), sha256(EXE));
  });
});

describe('what a server could try', () => {
  test('signing with a key of its own', () => {
    const wes = pair();
    const server = pair();
    assert.equal(readInstallerManifest(published(server.privateKey), wes.publicKeyPem), null);
  });

  test('a forged signature: the right shape, the wrong bytes', () => {
    const wes = pair();
    const forged = { ...JSON.parse(published(wes.privateKey)), signature: Buffer.alloc(64, 1).toString('base64') };
    assert.equal(readInstallerManifest(JSON.stringify(forged), wes.publicKeyPem), null);
  });

  test('keeping the real signature and changing one byte of the installer', async () => {
    const wes = pair();
    const manifest = readInstallerManifest(published(wes.privateKey), wes.publicKeyPem);
    const poisoned = Buffer.from(EXE);
    poisoned[1000] ^= 1;
    assert.equal(poisoned.length, manifest.size);
    assert.equal(await verifyInstallerFile(onDisk(poisoned), manifest), false);
  });

  test('a file of the wrong size, longer or shorter', async () => {
    const wes = pair();
    const manifest = readInstallerManifest(published(wes.privateKey), wes.publicKeyPem);
    assert.equal(await verifyInstallerFile(onDisk(Buffer.concat([EXE, Buffer.from('x')])), manifest), false);
    assert.equal(await verifyInstallerFile(onDisk(EXE.subarray(0, EXE.length - 1)), manifest), false);
    assert.equal(await verifyInstallerFile(join(dir, 'not-there.exe'), manifest), false);
  });

  test('keeping the real signature and claiming a different size or a newer version', () => {
    const wes = pair();
    const signed = JSON.parse(published(wes.privateKey));
    // The size is not signed, but the hash is: a lie about the size fails at the file check above.
    assert.equal(readInstallerManifest(JSON.stringify({ ...signed, version: '0.9.0' }), wes.publicKeyPem), null);
    assert.equal(readInstallerManifest(JSON.stringify({ ...signed, sha256: sha256(Buffer.from('other')) }), wes.publicKeyPem), null);
  });

  test('a client update signature presented as an installer one, and the reverse', () => {
    const wes = pair();
    // A real client manifest, straight from the client signer.
    const client = signBundle(packBundle({ 'index.html': Buffer.from('x') }), 100, wes.privateKey);
    assert.equal(readInstallerManifest(JSON.stringify(client), wes.publicKeyPem), null);
    assert.equal(readInstallerManifest(JSON.stringify({ ...client, version: '0.5.0' }), wes.publicKeyPem), null);

    // The worst case: Wes's key signed the client words over exactly this installer's hash and a version shaped like an installer's.
    const hash = sha256(EXE);
    const clientWords = Buffer.from(`scryproof/desktop-client/v1\n0.5.0\n${hash}`, 'utf8');
    const crossed = { version: '0.5.0', sha256: hash, size: EXE.length, signature: sign(null, clientWords, wes.privateKey).toString('base64') };
    assert.equal(readInstallerManifest(JSON.stringify(crossed), wes.publicKeyPem), null);

    // And an installer signature is no client update.
    const installer = JSON.parse(published(wes.privateKey));
    assert.equal(readManifest(JSON.stringify(installer), wes.publicKeyPem), null);
    assert.equal(readManifest(JSON.stringify({ ...installer, version: 5 }), wes.publicKeyPem), null);
  });

  test('sending nonsense', () => {
    const wes = pair();
    const good = JSON.parse(published(wes.privateKey));
    for (const raw of [
      '',
      '{}',
      'null',
      '[]',
      '<html>',
      JSON.stringify({ ...good, version: 5 }),
      JSON.stringify({ ...good, version: 'v0.5.0' }),
      JSON.stringify({ ...good, version: '0.5' }),
      JSON.stringify({ ...good, version: '0.5.0-beta' }),
      JSON.stringify({ ...good, size: 0 }),
      JSON.stringify({ ...good, size: 10 * 1024 * 1024 * 1024 }),
      JSON.stringify({ ...good, sha256: 'A'.repeat(64) }),
    ]) {
      assert.equal(readInstallerManifest(raw, wes.publicKeyPem), null, raw.slice(0, 60));
    }
  });
});

describe('only forward', () => {
  test('newer is newer number by number, not letter by letter', () => {
    assert.equal(isNewerVersion('0.10.0', '0.9.0'), true);
    assert.equal(isNewerVersion('0.5.0', '0.4.0'), true);
    assert.equal(isNewerVersion('0.4.1', '0.4.0'), true);
    assert.equal(isNewerVersion('1.0.0', '0.99.99'), true);
  });

  test('an older or equal version is never an update, however genuinely signed', () => {
    assert.equal(isNewerVersion('0.4.0', '0.4.0'), false);
    assert.equal(isNewerVersion('0.3.9', '0.4.0'), false);
    assert.equal(isNewerVersion('0.9.0', '0.10.0'), false);
    assert.equal(isNewerVersion('0.4.0', '1.0.0'), false);
  });

  test('anything that is not a version is not newer', () => {
    for (const [a, b] of [['', '0.4.0'], ['0.5.0', ''], ['0.5', '0.4.0'], ['0.5.0-beta', '0.4.0'], [5, '0.4.0'], [null, '0.4.0'], ['0.5.0', undefined]]) {
      assert.equal(isNewerVersion(a, b), false, `${a} vs ${b}`);
    }
  });

  test('file names round-trip, and nothing else is taken for an installer', () => {
    assert.equal(installerFileName('0.5.0'), 'Scryproof-Setup-0.5.0.exe');
    assert.equal(versionFromFileName('Scryproof-Setup-0.10.2.exe'), '0.10.2');
    for (const name of ['installer.part', 'Scryproof-Setup.exe', 'Scryproof-Setup-0.5.0.exe.part', '../Scryproof-Setup-0.5.0.exe', 'Other-Setup-0.5.0.exe']) {
      assert.equal(versionFromFileName(name), null, name);
    }
  });
});
