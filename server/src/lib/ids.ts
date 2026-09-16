/**
 * UUIDv7 identifiers.
 *
 * v7 puts a millisecond timestamp in the high bits, so ids sort
 * chronologically as plain strings. That buys us three things for free:
 * message pagination by id with no secondary index, a stable "newest first"
 * ordering that survives clock-equal inserts, and the ability to read a
 * creation time straight off a row while debugging.
 *
 * Within the same millisecond we increment a counter rather than re-rolling
 * randomness, so ids created in a tight loop stay strictly increasing.
 */

import { randomBytes } from 'node:crypto';

let lastTimestamp = -1;
let sequence = 0;

export function uuidv7(): string {
  const now = Date.now();

  if (now === lastTimestamp) {
    // 12 bits of sequence space per millisecond. Overflow is not realistic at
    // our scale, but if it ever happened we would rather wait a tick than emit
    // a duplicate.
    sequence += 1;
    if (sequence > 0xfff) {
      sequence = 0;
      while (Date.now() === now) {
        // spin until the clock moves
      }
      return uuidv7();
    }
  } else {
    lastTimestamp = now;
    sequence = randomBytes(2).readUInt16BE(0) & 0x0ff;
  }

  const bytes = new Uint8Array(16);

  // 48 bits of big-endian milliseconds since the Unix epoch.
  const ms = BigInt(now);
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);

  // Version 7 in the top nibble of byte 6, then 12 bits of sequence.
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;

  const rand = randomBytes(8);
  // Variant 10xx in the top bits of byte 8, then 62 bits of randomness.
  bytes[8] = 0x80 | (rand[0]! & 0x3f);
  for (let i = 1; i < 8; i += 1) bytes[8 + i] = rand[i]!;

  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Read the creation time back out of a v7 id. Handy in logs and tooling. */
export function timestampFromUuidv7(id: string): Date | null {
  const hex = id.replace(/-/g, '');
  if (hex.length !== 32) return null;
  const ms = Number.parseInt(hex.slice(0, 12), 16);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Invite codes are read aloud and typed by hand, so the alphabet drops the
 * characters people confuse: i/l/1, o/0.
 */
export function inviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += INVITE_ALPHABET[bytes[i]! % INVITE_ALPHABET.length];
  }
  return out;
}
