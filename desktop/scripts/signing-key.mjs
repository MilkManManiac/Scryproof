/**
 * The update signing key, shared by the two things that sign: the client
 * (`make-update.mjs`) and the installer (`sign-installer.mjs`).
 *
 * The key lives in the home folder of whoever builds, outside the repo:
 * `~/.scryproof/update-key.pem`. It is never printed, never committed and
 * never goes to the box. Nothing here writes it anywhere else or logs it.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const keyPath = process.env.SCRYPROOF_UPDATE_KEY ?? join(homedir(), '.scryproof', 'update-key.pem');
/** The public half, baked into every installer. What installed apps trust. */
export const publicKeyPath = join(root, 'desktop', 'src', 'update-key.pub.pem');

/**
 * The private key and its public half. With `create`, a key is made if there
 * is none; only the client signer does that, the first time it ever runs.
 * Anything else with no key stops: a fresh key would sign things no installed
 * app accepts.
 */
export function loadSigningKey({ create = false } = {}) {
  if (!existsSync(keyPath)) {
    if (!create) {
      console.error(`There is no signing key at ${keyPath}. Sign a client first (npm run release:client), or restore the key from the password manager.`);
      process.exit(1);
    }
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log(`Made a new signing key at ${keyPath}. Apps built before now will not accept updates signed with it.`);
  }
  const privateKey = createPrivateKey(readFileSync(keyPath));
  const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  return { privateKey, publicKeyPem };
}

/**
 * Whether `publicKeyPem` is the key installed apps were built to trust. True
 * when there is no baked key yet (the first run writes it). Out of step, every
 * update would be refused, so the callers stop.
 */
export function matchesBakedKey(publicKeyPem) {
  if (!existsSync(publicKeyPath)) return true;
  // Git on Windows may have rewritten the line endings. The key is the same key.
  return readFileSync(publicKeyPath, 'utf8').replace(/\r\n/g, '\n') === publicKeyPem;
}

export const keyMismatchMessage = () =>
  `The signing key at ${keyPath} is not the one installed apps trust (desktop/src/update-key.pub.pem).\n` +
  'If the old key is lost, delete that .pem file, run this again, and build and hand out a new installer.';
