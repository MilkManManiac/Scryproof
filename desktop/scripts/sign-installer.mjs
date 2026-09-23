/**
 * Sign the installer electron-builder just made, so installed apps can update
 * their own shell from it.
 *
 *   npm run dist          (in desktop/; runs this last)
 *
 * Writes `desktop/release/installer.json` beside
 * `Scryproof-Setup-<version>.exe`: version, sha256, size and an Ed25519
 * signature, with the same key that signs clients but different words in
 * front (`installer-core.js`). `scripts/publish-installer.sh` sends both to
 * the box. Nothing here goes into git.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashFile, installerFileName, readInstallerManifest, signInstaller, verifyInstallerFile } from '../src/installer-core.js';
import { keyMismatchMessage, loadSigningKey, matchesBakedKey, root } from './signing-key.mjs';

const release = join(root, 'desktop', 'release');
const { version } = JSON.parse(readFileSync(join(root, 'desktop', 'package.json'), 'utf8'));
const exe = join(release, installerFileName(version));

const { privateKey, publicKeyPem } = loadSigningKey();
// The installer carries the baked public key. Signing it with any other key would make an installer no app accepts as an update.
if (!matchesBakedKey(publicKeyPem)) {
  console.error(keyMismatchMessage());
  process.exit(1);
}

let size;
try {
  size = statSync(exe).size;
} catch {
  console.error(`No installer at ${exe}. Build one first: npm run dist`);
  process.exit(1);
}

const manifest = signInstaller({ version, sha256: await hashFile(exe), size }, privateKey);

// Read it back the way an app will, before anybody is handed it.
const checked = readInstallerManifest(JSON.stringify(manifest), publicKeyPem);
if (!checked || !(await verifyInstallerFile(exe, checked))) {
  console.error('The installer signature just made does not verify. Nothing was written.');
  process.exit(1);
}

writeFileSync(join(release, 'installer.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Signed installer ${version}: ${(size / 1024 / 1024).toFixed(0)} MB, sha256 ${manifest.sha256.slice(0, 16)}.`);
