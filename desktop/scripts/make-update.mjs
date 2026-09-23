/**
 * Build the client and sign it as an update for the desktop app.
 *
 *   npm run release:client        (from the repo root)
 *
 * Writes `web/public/desktop-update/client.bin` and `client.json`. Those are
 * committed and deployed with everything else, and the box serves them at
 * /desktop-update/. Installed apps find them there, check the signature
 * against the public key they were built with, and move to the new client.
 *
 * The signing key is made the first time this runs and kept in the home
 * folder of whoever ran it, outside the repo: `~/.scryproof/update-key.pem`.
 * It is never printed, never committed and never goes to the box. Lose it and
 * every installed app has to be reinstalled once, from an installer built with
 * the new key. Anyone who copies it can ship code to every installed app, so
 * it is worth a copy in the password manager and nowhere else.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { openBundle, packBundle, readManifest, signBundle } from '../src/update-core.js';
import { keyMismatchMessage, loadSigningKey, matchesBakedKey, publicKeyPath, root } from './signing-key.mjs';

const outDir = process.env.SCRYPROOF_UPDATE_OUT ?? join(root, 'web', 'public', 'desktop-update');
const dist = join(root, 'web', 'dist');

const { privateKey, publicKeyPem } = loadSigningKey({ create: true });

// The key the apps are built with has to be the other half of the one signing. Out of step, every update would be refused.
if (!process.env.SCRYPROOF_UPDATE_OUT) {
  if (!matchesBakedKey(publicKeyPem)) {
    console.error(keyMismatchMessage());
    process.exit(1);
  }
  writeFileSync(publicKeyPath, publicKeyPem);
}

if (!process.env.SCRYPROOF_UPDATE_SKIP_BUILD) {
  const built = spawnSync('npm run build --workspace web', { cwd: root, stdio: 'inherit', shell: true });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const files = {};
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const name = relative(dist, path).split(sep).join('/');
    // Last time's update is in there too, copied from web/public. An update does not contain updates.
    if (name === 'desktop-update') continue;
    if (entry.isDirectory()) walk(path);
    else files[name] = readFileSync(path);
  }
};
walk(dist);

const version = Number(process.env.SCRYPROOF_UPDATE_VERSION ?? Date.now());
const bundle = packBundle(files);
const manifest = signBundle(bundle, version, privateKey);

// Read it back the way an app will, before anybody is handed it.
const checked = readManifest(JSON.stringify(manifest), publicKeyPem);
if (!checked || !openBundle(bundle, checked)) {
  console.error('The update just made does not verify. Nothing was written.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'client.bin'), bundle);
writeFileSync(join(outDir, 'client.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// What an installer built right now carries inside it, so it knows whether an update is newer than itself.
if (!process.env.SCRYPROOF_UPDATE_OUT) {
  writeFileSync(join(root, 'desktop', 'src', 'client-version.json'), `${JSON.stringify({ version })}\n`);
}
console.log(`Signed client ${version}: ${Object.keys(files).length} files, ${(bundle.length / 1024).toFixed(0)} KB.`);
