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
export const macKeyPath = process.env.SCRYPROOF_MAC_UPDATE_KEY ?? join(homedir(), '.scryproof', 'mac-update-key.pem');
export const macPublicKeyPath = join(root, 'desktop', 'src', 'update-key-mac.pub.pem');
/** The Mac recovery key (`mac-update-key.mjs --recovery`): made once, private half kept offline, public half baked in beside the everyday one. */
export const macRecoveryKeyPath = process.env.SCRYPROOF_MAC_RECOVERY_KEY ?? join(homedir(), '.scryproof', 'mac-update-recovery-key.pem');
export const macRecoveryPublicKeyPath = join(root, 'desktop', 'src', 'update-key-mac-recovery.pub.pem');
/** The public half, baked into every installer. What installed apps trust. */
export const publicKeyPath = join(root, 'desktop', 'src', 'update-key.pub.pem');
/**
 * The recovery key (audit 2026-10-10, finding 26): a second key installed apps
 * also trust, kept offline and used only if the first is lost. Its private
 * half sits beside the first, with `-recovery` on the name; it is backed up
 * away from this PC and never used for an ordinary release. To sign with it,
 * point SCRYPROOF_UPDATE_KEY at it.
 */
export const recoveryKeyPath = join(homedir(), '.scryproof', 'update-key-recovery.pem');
export const recoveryPublicKeyPath = join(root, 'desktop', 'src', 'update-key-recovery.pub.pem');

/**
 * Make the recovery key, once. Refuses if either half already exists: a second
 * run must never replace a key that shipped apps trust.
 *
 *   node -e "import('./scripts/signing-key.mjs').then((k) => k.makeRecoveryKey())"
 */
export function makeRecoveryKey() {
  for (const path of [recoveryKeyPath, recoveryPublicKeyPath]) {
    if (existsSync(path)) {
      console.error(`${path} already exists. No recovery key was made.`);
      process.exit(1);
    }
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(recoveryKeyPath), { recursive: true });
  writeFileSync(recoveryKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  writeFileSync(recoveryPublicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), { flag: 'wx' });
  console.log(`Made the recovery key at ${recoveryKeyPath}. Back it up off this PC.`);
}

/** The public keys installed apps trust for `kind` ('client' or 'mac'): the baked one, and the recovery one when it is baked in too. */
export function trustedPublicKeyPems(kind) {
  const paths = kind === 'mac' ? [macPublicKeyPath, macRecoveryPublicKeyPath] : [publicKeyPath, recoveryPublicKeyPath];
  return paths.filter((path) => existsSync(path)).map((path) => readFileSync(path, 'utf8'));
}

/**
 * The private key and its public half. With `create`, a key is made if there
 * is none and no public key is baked yet; only the client signer bootstraps it.
 * Anything else with no key stops: a fresh key would sign things no installed
 * app accepts.
 */
export function loadSigningKey({ create = false } = {}) {
  if (!existsSync(keyPath)) {
    if (!create || existsSync(publicKeyPath)) {
      console.error(`There is no signing key at ${keyPath}. Restore the original key on Wes's signing machine. No replacement key will be created.`);
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
 * Whether `publicKeyPem` is a key installed apps were built to trust: the
 * baked key or the recovery key. True when there is no baked key yet (the
 * first run writes it). Out of step, every update would be refused, so the
 * callers stop.
 */
export function matchesBakedKey(publicKeyPem) {
  if (!existsSync(publicKeyPath)) return true;
  // Git on Windows may have rewritten the line endings. The key is the same key.
  const baked = (path) => existsSync(path) && readFileSync(path, 'utf8').replace(/\r\n/g, '\n') === publicKeyPem;
  return baked(publicKeyPath) || baked(recoveryPublicKeyPath);
}

export const keyMismatchMessage = () =>
  `The signing key at ${keyPath} is not the one installed apps trust (desktop/src/update-key.pub.pem).\n` +
  'Restore the matching original private key. Keep the committed public key: rotating it requires an explicit recovery plan and new installers for every member.';
