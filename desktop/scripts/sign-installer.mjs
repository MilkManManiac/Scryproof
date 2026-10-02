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

import { createPrivateKey } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashFile, macInstallerFileName, macManifestName, readMacInstallerManifest, signMacInstaller, installerFileName, readInstallerManifest, signInstaller, verifyInstallerFile } from '../src/installer-core.js';
import { keyMismatchMessage, loadSigningKey, matchesBakedKey, macKeyPath, macPublicKeyPath, root } from './signing-key.mjs';

const release = join(root, 'desktop', 'release');
const { version } = JSON.parse(readFileSync(join(root, 'desktop', 'package.json'), 'utf8'));
const mac = process.argv.includes('--mac');
const artifact = join(release, mac ? macInstallerFileName(version) : installerFileName(version));

let privateKey, publicKeyPem;
if (mac) {
  try {
    privateKey = createPrivateKey(readFileSync(macKeyPath));
    publicKeyPem = readFileSync(macPublicKeyPath, 'utf8');
  } catch {
    console.error('Mac signing keys are missing or unreadable. Run npm run mac-update-key on Treys Mac, or restore its original private key.');
    process.exit(1);
  }
} else {
  ({ privateKey, publicKeyPem } = loadSigningKey());
}
// The installer carries the baked public key. Signing it with any other key would make an installer no app accepts as an update.
if (!mac && !matchesBakedKey(publicKeyPem)) {
  console.error(keyMismatchMessage());
  process.exit(1);
}

let size;
try {
  size = statSync(artifact).size;
} catch {
  console.error(`No installer at ${artifact}. Build one first: npm run ${mac ? 'dist:mac' : 'dist'}`);
  process.exit(1);
}

const manifest = (mac ? signMacInstaller : signInstaller)({ version, arch: 'arm64', sha256: await hashFile(artifact), size }, privateKey);

// Read it back the way an app will, before anybody is handed it.
const checked = (mac ? readMacInstallerManifest : readInstallerManifest)(JSON.stringify(manifest), publicKeyPem);
if (!checked || !(await verifyInstallerFile(artifact, checked))) {
  console.error('The installer signature just made does not verify. Nothing was written.');
  process.exit(1);
}

const manifestPath = join(release, mac ? macManifestName() : 'installer.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (mac && !readMacInstallerManifest(readFileSync(manifestPath, 'utf8'), publicKeyPem)) {
  console.error('The Mac manifest on disk does not verify against the baked Mac public key.');
  process.exit(1);
}
console.log(`Signed installer ${version}: ${(size / 1024 / 1024).toFixed(0)} MB, sha256 ${manifest.sha256.slice(0, 16)}.`);
