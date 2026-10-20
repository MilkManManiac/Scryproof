/**
 * What a client update is, and how it is known to be ours.
 *
 * The reason the desktop app exists is that its code does not come from the
 * server (GAMEPLAN 1b, finding 2). An updater that fetched new code from the
 * server and ran it would quietly undo that. So an update is only ever applied
 * if it carries a signature made by a key that lives on Wes's PC and nowhere
 * else. The server stores the update and hands it out; it cannot make one, and
 * changing a byte of one makes it worthless.
 *
 * An update is two files:
 *   client.bin   every file of the built client, as gzipped JSON
 *   client.json  { version, sha256, size, signature }
 *
 * The signature (Ed25519) covers the version and the hash together. The hash
 * is what ties it to the bytes. The version is what stops an old, genuinely
 * signed client with a since-fixed hole being served up again: the app only
 * ever moves forward.
 *
 * No Electron in this file, so `node --test` can run it.
 */

import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

const CONTEXT = 'scryproof/desktop-client/v1';
/** The whole client is under 2 MB. Anything far past that is not a client. */
export const MAX_BUNDLE_BYTES = 40 * 1024 * 1024;
/** No download (client, installer, Mac zip) is let grow past this, whatever its manifest says. The installer manifest allows 400 MB. */
export const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Whether any of the trusted keys made `signature` over `bytes`. Two keys are
 * baked into the app: the one Wes signs with, and a recovery key kept offline,
 * so losing the first is not a reinstall by hand for everyone (audit
 * 2026-10-10, finding 26). A key that is not Ed25519 trusts nothing.
 */
export function signedByAny(bytes, signature, publicKeyPems) {
  const sig = Buffer.from(signature, 'base64');
  return [publicKeyPems].flat().some((pem) => {
    try {
      const key = createPublicKey(pem);
      return key.asymmetricKeyType === 'ed25519' && verify(null, bytes, key, sig);
    } catch {
      return false;
    }
  });
}
const signedBytes = (version, hash) => Buffer.from(`${CONTEXT}\n${version}\n${hash}`, 'utf8');

/**
 * Write `source` (a stream or any async iterable of bytes, such as a response
 * body) to `path` as it arrives, never holding it whole, and stop with an
 * error as soon as it is past `limit` bytes, or MAX_DOWNLOAD_BYTES if that is
 * smaller. The caller removes what was written when it throws.
 */
export async function saveCapped(source, path, limit) {
  const cap = Math.min(limit, MAX_DOWNLOAD_BYTES);
  let written = 0;
  await pipeline(
    source,
    async function* (chunks) {
      for await (const chunk of chunks) {
        written += chunk.length;
        if (written > cap) throw new Error('bigger than it was signed at');
        yield chunk;
      }
    },
    createWriteStream(path),
  );
  return written;
}

/** `files` is { 'index.html': Buffer, 'assets/index-abc.js': Buffer, ... }. */
export function packBundle(files) {
  const entries = Object.keys(files)
    .sort()
    .map((path) => [path, files[path].toString('base64')]);
  return gzipSync(Buffer.from(JSON.stringify({ v: 1, files: entries }), 'utf8'), { level: 9 });
}

export function signBundle(bundle, version, privateKey) {
  const hash = sha256(bundle);
  return {
    version,
    sha256: hash,
    size: bundle.length,
    signature: sign(null, signedBytes(version, hash), privateKey).toString('base64'),
  };
}

/**
 * The manifest, if it is one and a trusted key signed it. Null otherwise.
 * `publicKeyPems` is one PEM or a list. Never throws: what arrives here came
 * off the network.
 */
export function readManifest(raw, publicKeyPems) {
  try {
    const manifest = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const { version, sha256: hash, size, signature } = manifest;
    if (!Number.isSafeInteger(version) || version <= 0) return null;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null;
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BUNDLE_BYTES) return null;
    if (typeof signature !== 'string') return null;
    if (!signedByAny(signedBytes(version, hash), signature, publicKeyPems)) return null;
    return { version, sha256: hash, size, signature };
  } catch {
    return null;
  }
}

/**
 * The files inside a bundle, as a Map of path to Buffer, or null if the bytes
 * are not the ones the manifest was signed for. Call with a manifest that
 * `readManifest` returned, never with one that was only parsed.
 */
export function openBundle(bundle, manifest) {
  try {
    if (bundle.length !== manifest.size || sha256(bundle) !== manifest.sha256) return null;
    const parsed = JSON.parse(gunzipSync(bundle, { maxOutputLength: MAX_BUNDLE_BYTES * 4 }).toString('utf8'));
    if (parsed.v !== 1 || !Array.isArray(parsed.files)) return null;
    const files = new Map();
    for (const [path, body] of parsed.files) {
      // Paths are looked up, never joined onto a directory, but a strange one is still a reason to refuse the lot.
      if (typeof path !== 'string' || typeof body !== 'string' || path.startsWith('/') || path.includes('..') || path.includes('\\')) return null;
      files.set(path, Buffer.from(body, 'base64'));
    }
    return files.has('index.html') ? files : null;
  } catch {
    return null;
  }
}
