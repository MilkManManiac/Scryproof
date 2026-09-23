/**
 * What a shell update is, and how it is known to be ours.
 *
 * `update-core.js` covers the client: the web code the window shows. This is
 * the other half, the app around it (Electron, `desktop/src/*`), which can only
 * be replaced by running a new installer. Running a program is the most
 * trusting thing this app ever does, so the same rule applies, harder: an
 * installer is run only if Wes's key signed exactly its bytes, and only if it
 * is newer than what is running. The server stores it and hands it out; it
 * cannot make one.
 *
 * A shell update is two files, served from /download/:
 *   Scryproof-Setup.exe  the NSIS installer electron-builder made
 *   installer.json       { version, sha256, size, signature }
 *
 * Same key as the client, different words in front of what is signed. A client
 * signature covers `scryproof/desktop-client/v1`, an installer signature
 * `scryproof/desktop-installer/v1`, so neither can ever be passed off as the
 * other.
 *
 * No Electron in this file, so `node --test` can run it.
 */

import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const CONTEXT = 'scryproof/desktop-installer/v1';
/** The installer is about 110 MB. Anything far past that is not our installer. */
export const MAX_INSTALLER_BYTES = 400 * 1024 * 1024;

const VERSION = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;
const signedBytes = (version, hash) => Buffer.from(`${CONTEXT}\n${version}\n${hash}`, 'utf8');

/** `0.10.0` as [0, 10, 0], or null for anything that is not three plain numbers. */
const parts = (version) => {
  const match = typeof version === 'string' ? VERSION.exec(version) : null;
  return match ? match.slice(1).map(Number) : null;
};

/**
 * Whether `candidate` is a later version than `current`, number by number, so
 * 0.10.0 is newer than 0.9.0. False when either is not a version at all: when
 * in doubt, nothing is installed.
 */
export function isNewerVersion(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/** What the installer for a version is called on disk, in the release folder and in the app's download folder. */
export const installerFileName = (version) => `Scryproof-Setup-${version}.exe`;

/** The version in an installer's file name, or null if the name is not one of ours. */
export function versionFromFileName(name) {
  const match = /^Scryproof-Setup-(\d{1,9}\.\d{1,9}\.\d{1,9})\.exe$/.exec(name);
  return match ? match[1] : null;
}

/** The sha256 of a file, read in pieces: an installer is too big to want in memory twice. */
export function hashFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** The manifest for an installer whose hash and size are already known. */
export function signInstaller({ version, sha256, size }, privateKey) {
  return {
    version,
    sha256,
    size,
    signature: sign(null, signedBytes(version, sha256), privateKey).toString('base64'),
  };
}

/**
 * The manifest, if it is one and the key signed it as an installer. Null
 * otherwise. Never throws: what arrives here came off the network.
 */
export function readInstallerManifest(raw, publicKeyPem) {
  try {
    const manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { version, sha256: hash, size, signature } = manifest;
    if (!parts(version)) return null;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null;
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_INSTALLER_BYTES) return null;
    if (typeof signature !== 'string') return null;
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') return null;
    if (!verify(null, signedBytes(version, hash), key, Buffer.from(signature, 'base64'))) return null;
    return { version, sha256: hash, size, signature };
  } catch {
    return null;
  }
}

/**
 * Whether the file at `path` is exactly the installer `manifest` was signed
 * for. Call with a manifest that `readInstallerManifest` returned, never with
 * one that was only parsed. Never throws.
 */
export async function verifyInstallerFile(path, manifest) {
  try {
    if ((await stat(path)).size !== manifest.size) return false;
    return (await hashFile(path)) === manifest.sha256;
  } catch {
    return false;
  }
}
