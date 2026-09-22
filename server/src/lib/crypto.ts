/**
 * Cryptographic helpers.
 *
 * Everything here is either a standard primitive from node:crypto or argon2id
 * from a maintained Rust binding. No hand-rolled constructions.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

import { config } from '../config.js';

/**
 * argon2id parameters. 19 MiB and two passes is the OWASP baseline: it costs a
 * legitimate login a few tens of milliseconds and costs an attacker with a GPU
 * farm orders of magnitude more than any SHA-family hash would.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // a crash that leaks which accounts exist.
    return false;
  }
}

/**
 * A dummy verification used when the username does not exist, so that login
 * takes the same wall-clock time whether or not the account is real. Without
 * it, response timing is a free account-enumeration oracle.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

export async function fakeVerifyPassword(password: string): Promise<void> {
  try {
    await argonVerify(DUMMY_HASH, password);
  } catch {
    // Expected: the dummy hash does not verify. The point is the time spent.
  }
}

/** 256 bits of entropy, url-safe. Used for session cookies. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Session cookies are stored only as a SHA-256 digest. SHA-256 is correct here
 * rather than argon2: the input is already 256 bits of uniform randomness, so
 * there is nothing for a slow hash to defend against, and lookups happen on
 * every single request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Key for encrypting secrets at rest (currently TOTP seeds), derived from the
 * session secret so there is one secret to manage on the box. Separate `info`
 * strings keep derived keys independent.
 */
function derivedKey(info: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(config.sessionSecret), Buffer.alloc(0), Buffer.from(info), 32),
  );
}

const SECRET_KEY_INFO = 'scryproof:secret-box:v1';

/** AES-256-GCM. Output is iv.tag.ciphertext, base64url, self-describing. */
export function encryptSecret(plaintext: string): string {
  const key = derivedKey(SECRET_KEY_INFO);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [ivPart, tagPart, dataPart] = payload.split('.');
    if (!ivPart || !tagPart || !dataPart) return null;
    const key = derivedKey(SECRET_KEY_INFO);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/*
 * `generateChannelKey()` used to live here: 32 random bytes, handed to members
 * over the socket. It is deleted rather than left unused.
 *
 * The comment above it said "the media server never sees it", which was true
 * and beside the point — *this* server saw it, and this server is the one an
 * intruder, or DigitalOcean under legal process, gets to. Voice keys are made
 * in the clients now and this process never holds one.
 *
 * Non-negotiable 8. GAMEPLAN 1b, finding 1. If you are about to add a function
 * here that returns key material for members' content, that is the rule you
 * are about to break.
 */

/** Hash an IP for logs. Salted per boot, so logs cannot be correlated later. */
const IP_SALT = randomBytes(16);

export function hashIp(ip: string): string {
  return createHash('sha256').update(IP_SALT).update(ip).digest('hex').slice(0, 16);
}

/**
 * Deterministic accent colour per user, so identity reads at a glance.
 *
 * A fixed palette rather than a hue off the full colour wheel. Hashing to any
 * hue produces neons that fight the interface and, next to each other, read as
 * randomly generated, which is exactly what they are. These are chosen to sit
 * with the cold surfaces and the one warm accent, and every one of them is
 * light enough for dark text to stay readable on it.
 */
const ACCENTS = [
  '#d8a05a',
  '#c98b6b',
  '#bd7a82',
  '#9a86c4',
  '#7fa3cc',
  '#6fb2a8',
  '#8fb072',
  '#c4a95e',
  '#a3919f',
  '#cf8f5e',
] as const;

export function accentForId(id: string): string {
  const digest = createHash('sha256').update(id).digest();
  return ACCENTS[digest.readUInt16BE(0) % ACCENTS.length]!;
}

/**
 * One die, `sides` faces, 1 through `sides`. `crypto.randomInt` rather than
 * `Math.random`: a table trusts the roll because nobody, including whoever
 * runs this box, can nudge it toward a face.
 */
export function rollDie(sides: number): number {
  return randomInt(1, sides + 1);
}
