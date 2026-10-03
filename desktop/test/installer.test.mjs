/**
 * An installer is only run if Wes's key signed exactly these bytes as an
 * installer, and only if it is newer than the app running it. The server is
 * played by the test and may do anything a real one could.
 *
 *   npm test          (in desktop/)
 */

import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import {
  MAC_CONTEXT,
  MAX_INSTALLER_BYTES,
  macInstallerFileName,
  macManifestName,
  readMacInstallerManifest,
  signMacInstaller,
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


describe('Mac shell release trust', () => {
  const input = { version: '0.6.0', arch: 'arm64', sha256: sha256(EXE), size: EXE.length };

  test('signs the pinned protocol bytes and verifies the zip', async () => {
    const trey = pair();
    const manifest = signMacInstaller(input, trey.privateKey);
    // Independent protocol oracle: changing both signer and reader cannot hide a drift.
    assert.equal(MAC_CONTEXT, 'scryproof/desktop-installer-mac/v1');
    const bytes = Buffer.from(`scryproof/desktop-installer-mac/v1\narm64\n0.6.0\n${input.sha256}`);
    assert.equal(verify(null, bytes, trey.publicKeyPem, Buffer.from(manifest.signature, 'base64')), true);
    assert.deepEqual(readMacInstallerManifest(JSON.stringify(manifest), trey.publicKeyPem), manifest);
    assert.equal(await verifyInstallerFile(onDisk(EXE), manifest), true);
    assert.equal(macInstallerFileName('0.6.0'), 'Scryproof-0.6.0-mac-arm64.zip');
    assert.equal(macManifestName(), 'installer-mac-arm64.json');
  });

  test('rejects substitution between Windows and Mac even with the same key', () => {
    const trey = pair();
    const mac = signMacInstaller(input, trey.privateKey);
    const win = signInstaller(input, trey.privateKey);
    assert.equal(readInstallerManifest(mac, trey.publicKeyPem), null);
    assert.equal(readMacInstallerManifest(win, trey.publicKeyPem), null);
    // Same fields and arm64, but Windows signature words: the context must differ.
    assert.equal(readMacInstallerManifest({ ...win, arch: 'arm64' }, trey.publicKeyPem), null);
  });

  test('rejects untrusted keys, modified signed fields and malformed input without throwing', () => {
    const trey = pair();
    const good = signMacInstaller(input, trey.privateKey);
    const server = pair();
    assert.equal(readMacInstallerManifest(signMacInstaller(input, server.privateKey), trey.publicKeyPem), null);
    for (const raw of [undefined, null, 'null', '{}', '<html>', [],
      ...[5, '0.6', 'v0.6.0', '0.6.0-beta', '0.7.0'].map(version => ({ ...good, version })),
      ...[undefined, 'x64', '../arm64'].map(arch => ({ ...good, arch })),
      ...[0, -1, 1.5, MAX_INSTALLER_BYTES + 1, NaN].map(size => ({ ...good, size })),
      ...['A'.repeat(64), 'bad', sha256(Buffer.from('tampered'))].map(sha256 => ({ ...good, sha256 })),
      { ...good, signature: 'bad' }, { ...good, signature: undefined },
    ]) assert.equal(readMacInstallerManifest(raw, trey.publicKeyPem), null);
    // Give malformed fields genuine signatures too: rejection must come from
    // the field guard, rather than accidentally from a stale signature.
    for (const change of [
      { version: '0.6' }, { version: '0.6.0-beta' }, { arch: 'x64' },
      { sha256: 'A'.repeat(64) }, { sha256: 'bad' },
      { size: 0 }, { size: MAX_INSTALLER_BYTES + 1 }, { size: 1.5 },
    ]) assert.equal(readMacInstallerManifest(signMacInstaller({ ...input, ...change }, trey.privateKey), trey.publicKeyPem), null);
    assert.equal(readMacInstallerManifest(good, 'bad key'), null);
  });
});

// Exercise the actual CLI boundary in a disposable repository layout: keys
// never touch this checkout or the operator's home, and no network is used.
const releaseFixture = () => {
  const root = mkdtempSync(join(dir, 'release-'));
  mkdirSync(join(root, 'desktop', 'scripts'), { recursive: true });
  mkdirSync(join(root, 'desktop', 'src'));
  mkdirSync(join(root, 'desktop', 'release'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'desktop', 'package.json'), '{"type":"module","version":"0.6.0"}');
  for (const name of ['installer-core.js', 'update-core.js']) cpSync(new URL(`../src/${name}`, import.meta.url), join(root, 'desktop', 'src', name));
  for (const name of ['mac-update-key.mjs', 'mac-preflight.mjs', 'make-update.mjs', 'signing-key.mjs', 'sign-installer.mjs']) {
    cpSync(new URL(`../scripts/${name}`, import.meta.url), join(root, 'desktop', 'scripts', name));
  }
  cpSync(new URL('../../scripts/publish-mac.sh', import.meta.url), join(root, 'scripts', 'publish-mac.sh'));
  const key = join(root, 'private.pem');
  const env = { ...process.env, SCRYPROOF_MAC_UPDATE_KEY: key };
  const run = (script, ...args) => spawnSync(process.execPath, [join(root, 'desktop', 'scripts', script), ...args], { env, encoding: 'utf8' });
  return { root, key, env, run, publicPath: join(root, 'desktop', 'src', 'update-key-mac.pub.pem') };
};

describe('Mac release commands', () => {
  test('creates a private key with restricted mode, repeats safely and refuses a mismatched public key', () => {
    const f = releaseFixture();
    assert.equal(f.run('mac-update-key.mjs').status, 0);
    assert.equal(statSync(f.key).mode & 0o777, 0o600);
    const original = readFileSync(f.publicPath, 'utf8');
    assert.equal(f.run('mac-update-key.mjs').status, 0);
    assert.equal(readFileSync(f.publicPath, 'utf8'), original);
    writeFileSync(f.publicPath, pair().publicKeyPem);
    const mismatch = f.run('mac-update-key.mjs');
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /mismatch/);
    assert.equal(mismatch.stdout.includes('PRIVATE KEY'), false);
  });

  test('keeps the Windows installer signing command and manifest format', () => {
    const f = releaseFixture();
    const wes = pair();
    const winKey = join(f.root, 'windows-private.pem');
    writeFileSync(winKey, wes.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    writeFileSync(join(f.root, 'desktop', 'src', 'update-key.pub.pem'), wes.publicKeyPem);
    writeFileSync(join(f.root, 'desktop', 'release', 'Scryproof-Setup-0.6.0.exe'), EXE);
    const result = spawnSync(process.execPath, [join(f.root, 'desktop', 'scripts', 'sign-installer.mjs')], {
      env: { ...f.env, SCRYPROOF_UPDATE_KEY: winKey }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(f.root, 'desktop', 'release', 'installer.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest), ['version', 'sha256', 'size', 'signature']);
    assert.ok(readInstallerManifest(manifest, wes.publicKeyPem));
    assert.equal(existsSync(join(f.root, 'desktop', 'release', 'installer-mac-arm64.json')), false);
  });

  test('refuses to silently replace a missing private key when apps already trust a public key', () => {
    const f = releaseFixture();
    writeFileSync(f.publicPath, pair().publicKeyPem);
    assert.equal(f.run('mac-update-key.mjs').status, 1);
    assert.equal(existsSync(f.key), false);
  });

  // On a Mac the script also staples and mounts the DMG, which a stand-in DMG cannot pass.
  test('signs the zip, dry-runs a valid publish and refuses doctored hashes and sizes before network', { skip: process.platform === 'darwin' && 'publish-mac.sh validates a real notarized DMG on macOS' }, () => {
    const f = releaseFixture();
    assert.equal(f.run('mac-update-key.mjs').status, 0);
    const release = join(f.root, 'desktop', 'release');
    writeFileSync(join(release, 'Scryproof-0.6.0-mac-arm64.zip'), EXE);
    writeFileSync(join(release, 'Scryproof.dmg'), 'test DMG');
    assert.equal(f.run('sign-installer.mjs', '--mac').status, 0);
    const path = join(release, 'installer-mac-arm64.json');
    const signed = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(readMacInstallerManifest(signed, readFileSync(f.publicPath, 'utf8')));
    assert.equal(readInstallerManifest(signed, readFileSync(f.publicPath, 'utf8')), null);
    const publish = () => spawnSync('bash', [join(f.root, 'scripts', 'publish-mac.sh'), '--dry-run'], { encoding: 'utf8' });
    const dry = publish();
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /manifest|installer-mac-arm64.json/);
    assert.match(dry.stdout, /no network calls/);
    // Size is deliberately not signed, so this reaches the file-integrity guard.
    writeFileSync(path, JSON.stringify({ ...signed, size: signed.size + 1 }));
    const badSize = publish();
    assert.equal(badSize.status, 1);
    assert.match(badSize.stderr, /hash\/size does not match/);
    writeFileSync(path, JSON.stringify({ ...signed, sha256: 'b'.repeat(64) }));
    assert.equal(publish().status, 1);
    writeFileSync(path, JSON.stringify(signed));
    const tampered = Buffer.from(EXE); tampered[100] ^= 1;
    writeFileSync(join(release, 'Scryproof-0.6.0-mac-arm64.zip'), tampered);
    assert.equal(publish().status, 1);
    // A different signing key cannot overwrite a manifest trusted by apps.
    const other = pair();
    writeFileSync(f.key, other.privateKey.export({ type: 'pkcs8', format: 'pem' }));
    assert.equal(f.run('sign-installer.mjs', '--mac').status, 1);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), signed);
  });
});


describe('Mac build preflight and client key safety', () => {
  const clientFixture = () => {
    const f = releaseFixture();
    const wes = pair();
    const client = signBundle(packBundle({ 'index.html': Buffer.from('signed client') }), 1790867486002, wes.privateKey);
    const update = join(f.root, 'web', 'public', 'desktop-update');
    mkdirSync(update, { recursive: true });
    writeFileSync(join(update, 'client.json'), JSON.stringify(client));
    writeFileSync(join(f.root, 'desktop', 'src', 'update-key.pub.pem'), wes.publicKeyPem);
    const versionPath = join(f.root, 'desktop', 'src', 'client-version.json');
    writeFileSync(versionPath, JSON.stringify({ version: client.version }));
    return { ...f, client, versionPath, update };
  };

  test('Mac packaging builds without invoking the client signing scripts', () => {
    const { scripts, build } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.doesNotMatch(scripts['dist:mac'], /release|make-update|loadSigningKey/);
    assert.match(scripts['dist:mac'], /mac-preflight/);
    assert.match(scripts['dist:mac'], /npm run client/);
    assert.ok(build.files.includes('assets/trayTemplate.png'));
    assert.ok(build.files.includes('assets/trayTemplate@2x.png'));
  });

  test('public-key preflight verifies the signed version and refuses a different bundled version without writing', () => {
    const f = clientFixture();
    const missing = f.run('mac-preflight.mjs');
    assert.equal(missing.status, 1);
    assert.ok(missing.stderr.includes("Mac update public key missing: run `npm run mac-update-key` on Trey's Mac first, then commit desktop/src/update-key-mac.pub.pem."));
    writeFileSync(f.publicPath, pair().publicKeyPem);
    const before = readFileSync(f.versionPath, 'utf8');
    const publicPath = join(f.root, 'desktop', 'src', 'update-key.pub.pem');
    const publicBefore = readFileSync(publicPath, 'utf8');
    const good = f.run('mac-preflight.mjs');
    assert.equal(good.status, 0, good.stderr);
    assert.equal(readFileSync(f.versionPath, 'utf8'), before);
    assert.equal(readFileSync(publicPath, 'utf8'), publicBefore);
    writeFileSync(f.versionPath, JSON.stringify({ version: 0 }));
    const mismatch = f.run('mac-preflight.mjs');
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /does not match/);
    assert.equal(readFileSync(f.versionPath, 'utf8'), '{"version":0}');
    writeFileSync(f.versionPath, before);
    writeFileSync(join(f.update, 'client.json'), JSON.stringify({ ...f.client, signature: 'bad' }));
    const invalid = f.run('mac-preflight.mjs');
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /does not verify/);
  });

  test('client signer refuses a missing private key when a public key is committed, without creating a stray key', () => {
    const f = clientFixture();
    const missingKey = join(f.root, 'missing-private.pem');
    const result = spawnSync(process.execPath, [join(f.root, 'desktop', 'scripts', 'make-update.mjs')], {
      env: { ...f.env, SCRYPROOF_UPDATE_KEY: missingKey }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.equal(existsSync(missingKey), false);
    assert.match(result.stderr, /Restore the original key/);
    assert.doesNotMatch(result.stderr, /delete/);
  });

  test('client key bootstrap still works only without a baked public key; mismatch guidance preserves it', () => {
    const f = releaseFixture();
    const privatePath = join(f.root, 'new-client-key.pem');
    const modulePath = new URL(`file://${join(f.root, 'desktop', 'scripts', 'signing-key.mjs')}`).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { loadSigningKey, keyMismatchMessage } from ${JSON.stringify(modulePath)}; loadSigningKey({create:true}); console.log(keyMismatchMessage());`], {
      env: { ...f.env, SCRYPROOF_UPDATE_KEY: privatePath }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(privatePath).mode & 0o777, 0o600);
    assert.match(result.stdout, /Keep the committed public key/);
    assert.doesNotMatch(result.stdout, /delete|PRIVATE KEY/);
  });
});
