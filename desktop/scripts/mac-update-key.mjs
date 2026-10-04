/** Run once on Trey's Mac. Only the public half belongs in git. */
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { macKeyPath, macPublicKeyPath } from './signing-key.mjs';

try {
  if (!existsSync(macKeyPath)) {
    // An existing public key means installed apps already trust a private key.
    if (existsSync(macPublicKeyPath)) throw new Error('Mac private key is missing but a public key is committed. Restore the original private key; do not rotate it silently.');
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(dirname(macKeyPath), { recursive: true, mode: 0o700 });
    writeFileSync(macKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const privateKey = createPrivateKey(readFileSync(macKeyPath));
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The Mac update key must be Ed25519.');
  const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  if (existsSync(macPublicKeyPath) &&
      createPublicKey(readFileSync(macPublicKeyPath)).export({ type: 'spki', format: 'pem' }) !== publicKeyPem) {
    throw new Error('Mac update key mismatch: installed apps trust desktop/src/update-key-mac.pub.pem. Restore the matching private key.');
  }
  writeFileSync(macPublicKeyPath, publicKeyPem);
  console.log('Mac public update key written to desktop/src/update-key-mac.pub.pem. Commit only that public file.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
