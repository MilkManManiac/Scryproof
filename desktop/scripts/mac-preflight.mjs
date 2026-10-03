/** Mac packaging consumes Wes's signed client version; it never signs one. */
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readManifest } from '../src/update-core.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
try {
  if (!existsSync(new URL('../src/update-key-mac.pub.pem', import.meta.url))) {
    throw new Error("Mac update public key missing: run `npm run mac-update-key` on Trey's Mac first, then commit desktop/src/update-key-mac.pub.pem.");
  }
  const macKey = createPublicKey(read('../src/update-key-mac.pub.pem'));
  if (macKey.asymmetricKeyType !== 'ed25519') throw new Error('The Mac public update key must be Ed25519.');
  const manifest = readManifest(read('../../web/public/desktop-update/client.json'), read('../src/update-key.pub.pem'));
  if (!manifest) throw new Error('The committed client manifest does not verify against Wes\'s public key.');
  const bundled = JSON.parse(read('../src/client-version.json'));
  if (bundled.version !== manifest.version) throw new Error('client-version.json does not match the signed client manifest. Restore the matching committed files; do not invent a version.');
  console.log(`Mac preflight passed: signed client version ${manifest.version}. No private key needed.`);
} catch (error) {
  console.error(`Mac preflight refused: ${error.message}`);
  process.exit(1);
}
