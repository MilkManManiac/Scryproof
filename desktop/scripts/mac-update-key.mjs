/**
 * Run once on Trey's Mac. Only the public half belongs in git.
 *
 *   npm run mac-update-key               the everyday key (~/.scryproof/mac-update-key.pem)
 *   npm run mac-update-key -- --recovery the recovery key, made once and kept offline
 *
 * Installed Mac apps trust both public keys (`main.js` reads
 * `update-key-mac.pub.pem` and, when it is there, `update-key-mac-recovery.pub.pem`).
 * The recovery key signs nothing day to day: its private half goes into a
 * password manager and the file is deleted, so that a lost everyday key means
 * one release signed with the recovery key (`SCRYPROOF_MAC_UPDATE_KEY=<its
 * path> npm run dist:mac`) instead of every Mac reinstalling by hand (audit
 * 2026-10-10, finding 26). Apps built before the recovery key was baked in do
 * not know it; they take one update signed with the everyday key.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { macKeyPath, macPublicKeyPath, macRecoveryKeyPath, macRecoveryPublicKeyPath } from './signing-key.mjs';

const recovery = process.argv.includes('--recovery');
const privatePath = recovery ? macRecoveryKeyPath : macKeyPath;
const publicPath = recovery ? macRecoveryPublicKeyPath : macPublicKeyPath;
const which = recovery ? 'Mac recovery key' : 'Mac private key';

try {
  if (!existsSync(privatePath)) {
    // An existing public key means installed apps already trust a private key.
    if (existsSync(publicPath)) throw new Error(`${which} is missing but a public key is committed. Restore the original private key; do not rotate it silently.`);
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(dirname(privatePath), { recursive: true, mode: 0o700 });
    writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const privateKey = createPrivateKey(readFileSync(privatePath));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The Mac update key must be Ed25519.');
  const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  if (existsSync(publicPath) &&
      createPublicKey(readFileSync(publicPath)).export({ type: 'spki', format: 'pem' }) !== publicKeyPem) {
    throw new Error(`Mac update key mismatch: installed apps trust ${publicPath}. Restore the matching private key.`);
  }
  if (recovery && existsSync(macPublicKeyPath) &&
      createPublicKey(readFileSync(macPublicKeyPath)).export({ type: 'spki', format: 'pem' }) === publicKeyPem) {
    throw new Error('The recovery key is the everyday key. A recovery key is a different key.');
  }
  writeFileSync(publicPath, publicKeyPem);
  console.log(`${recovery ? 'Mac recovery' : 'Mac'} public update key written to ${publicPath}. Commit only that public file.`);
  if (recovery) {
    console.log(`The private half is at ${privatePath}. Put its contents in your password manager now, then delete the file: it is only for a release when the everyday key is gone.`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
