/**
 * The recovery phrase.
 *
 * Every device's DM key is made in that device and cannot be taken out of it,
 * so a new laptop cannot read what was locked to the old one. The phrase is the
 * way round that which does not involve the server holding anything secret.
 *
 * Twelve words stand for one more device: one that has no browser and never
 * signs in. Its two keys are worked out from the words, the same way every
 * time, so whoever has the words has the device. The public halves are
 * published like any other device's and messages are locked to it like any
 * other. Typing the words into a new laptop rebuilds the private halves there,
 * and everything locked to the phrase opens.
 *
 * What the server holds: two public keys and the locked copies, which is what
 * it holds for every device. Not the words, not anything made from the words
 * that could be turned back into them, and not a locked-up copy of the private
 * keys either. There is nothing on the box to guess against except the public
 * key, and twelve words from a list of 2048 are 128 bits: not guessable.
 *
 * The phrase device also signs. The laptop that makes the phrase vouches for
 * it, and it vouches for the laptop, and later for any device the words are
 * typed into. So the people you talk to are not asked to accept your new
 * laptop: the words are the proof it is yours. `assessDevices` in dm-crypto.
 *
 * Honest limits. Whoever reads the words can read your DMs, for as long as
 * that phrase is in use: keep them on paper, not in a file. And the two
 * libraries below are the only cryptography in this project that is not the
 * browser's own. WebCrypto can use a P-256 key but cannot work one out from a
 * seed, and the word list is 2048 words nobody should retype. Both are audited,
 * have no dependencies beyond each other's hashes, and make no network calls.
 */

import { p256 } from '@noble/curves/nist.js';
import { generateMnemonic, mnemonicToSeedWebcrypto, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import type { DmDevice } from './dm-crypto';
import { fingerprintOf } from './voice-crypto';

const IDENTITY_INFO = 'scryproof/dm/recovery/identity/v1';
const DM_INFO = 'scryproof/dm/recovery/dm/v1';

/** Must match `RECOVERY_PREFIX` in server/src/routes/dms.ts. */
export const RECOVERY_PREFIX = 'recovery-';
export const isRecoveryDevice = (deviceId: string): boolean => deviceId.startsWith(RECOVERY_PREFIX);

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const text = new TextEncoder();

/** Twelve words, from the browser's own random numbers. */
export const newPhrase = (): string => generateMnemonic(wordlist, 128);

/** However it was typed: capitals, line breaks, a numbered list copied off a page. */
export const tidyPhrase = (typed: string): string =>
  typed
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();

/** The last word carries a checksum, so most slips of the pen are caught here. */
export const phraseLooksRight = (phrase: string): boolean => validateMnemonic(tidyPhrase(phrase), wordlist);

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** One P-256 key out of the seed, labelled so the two keys are unrelated. */
async function keyFromSeed(
  seed: CryptoKey,
  info: string,
  algorithm: 'ECDSA' | 'ECDH',
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeyBytes: Uint8Array }> {
  // 48 bytes, which noble reduces to a scalar without the bias 32 would have.
  const material = new Uint8Array(
    await subtle().deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32) as BufferSource, info: text.encode(info) as BufferSource },
      seed,
      384,
    ),
  );
  const { secretKey } = p256.keygen(material);
  material.fill(0);
  const point = p256.getPublicKey(secretKey, false);

  // Uncompressed: 0x04, then x, then y.
  const x = base64url(point.slice(1, 33));
  const y = base64url(point.slice(33, 65));
  const params = { name: algorithm, namedCurve: 'P-256' };
  // Non-extractable from here on, like every other private key in this app.
  const privateKey = await subtle().importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: base64url(secretKey), ext: false },
    params,
    false,
    algorithm === 'ECDSA' ? ['sign'] : ['deriveBits'],
  );
  secretKey.fill(0);
  const publicKey = await subtle().importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, ext: true },
    params,
    true,
    algorithm === 'ECDSA' ? ['verify'] : [],
  );
  return { privateKey, publicKey, publicKeyBytes: new Uint8Array(await subtle().exportKey('spki', publicKey)) };
}

/**
 * The device the words stand for. The person's id goes in, so the same words
 * on two accounts are two unrelated devices.
 *
 * Throws on words that fail their checksum: a wrong phrase would otherwise
 * quietly become a different, empty device.
 */
export async function recoveryDevice(userId: string, phrase: string): Promise<DmDevice> {
  const tidy = tidyPhrase(phrase);
  if (!validateMnemonic(tidy, wordlist)) throw new Error('Those are not the twelve words. Check the spelling and the order.');

  // PBKDF2, 2048 rounds, as BIP39 has it. The words are already unguessable; this is not what protects them.
  const seedBytes = await mnemonicToSeedWebcrypto(tidy, `scryproof:${userId}`);
  const seed = await subtle().importKey('raw', seedBytes as BufferSource, 'HKDF', false, ['deriveBits']);
  seedBytes.fill(0);

  const identity = await keyFromSeed(seed, IDENTITY_INFO, 'ECDSA');
  const dm = await keyFromSeed(seed, DM_INFO, 'ECDH');
  const fingerprint = await fingerprintOf(identity.publicKeyBytes);
  const digest = new Uint8Array(await subtle().digest('SHA-256', identity.publicKeyBytes as BufferSource));
  // Named after its own key, so a new phrase is a new device and never an old one with changed keys.
  const deviceId = RECOVERY_PREFIX + [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return { userId, identity: { deviceId, ...identity, fingerprint }, dm };
}
