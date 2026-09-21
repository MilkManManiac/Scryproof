/**
 * Two-factor authentication.
 *
 * Standard TOTP (RFC 6238), so any authenticator app works and nothing depends
 * on a vendor. Seeds are encrypted at rest: a stolen database dump does not
 * hand the attacker working second factors.
 */

import { eq } from 'drizzle-orm';
import { generateSecret, generateURI, verifySync } from 'otplib';

import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from '../lib/crypto.js';
import { badRequest } from '../lib/http-error.js';
import { inviteCode } from '../lib/ids.js';
import type { User } from '../db/schema.js';

const ISSUER = 'Scryproof';
const PERIOD_SECONDS = 30;

/**
 * Accept a code from one step either side of now. Phone clocks drift, and
 * without this a user with a slightly wrong clock simply cannot sign in.
 * Wider than this starts meaningfully extending the window in which a
 * shoulder-surfed code still works.
 */
const EPOCH_TOLERANCE_SECONDS = PERIOD_SECONDS;

export interface TotpEnrollment {
  secret: string;
  /** otpauth:// URI for the QR code. */
  uri: string;
}

/**
 * Start enrolment. The secret is returned once, held by the client while the
 * user scans it, and only written to the database when they prove they can
 * generate a code from it.
 */
export function beginTotpEnrollment(user: User): TotpEnrollment {
  const secret = generateSecret();
  const uri = generateURI({
    strategy: 'totp',
    issuer: ISSUER,
    label: user.username,
    secret,
    period: PERIOD_SECONDS,
  });
  return { secret, uri };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const result = verifySync({
      strategy: 'totp',
      secret,
      token: code.replace(/\s/g, ''),
      period: PERIOD_SECONDS,
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    // A malformed secret or token reads as "wrong code", never as a crash.
    return false;
  }
}

export async function verifyTotpForUser(user: User, code: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  const secret = decryptSecret(user.totpSecret);
  if (!secret) return false;
  if (verifyTotpCode(secret, code)) return true;
  return consumeRecoveryCode(user, code);
}

/**
 * Finish enrolment and hand back recovery codes. Recovery codes exist because
 * there is no email on this instance: losing a phone must not mean losing the
 * account, and the alternative is an account-recovery path that an attacker
 * could use too.
 */
export async function completeTotpEnrollment(
  user: User,
  secret: string,
  code: string,
): Promise<string[]> {
  if (!verifyTotpCode(secret, code)) {
    throw badRequest('That code is not right. Check your authenticator app.', 'invalid_totp');
  }

  const plain = Array.from({ length: 10 }, () => `${inviteCode(5)}-${inviteCode(5)}`);
  const hashed = await Promise.all(plain.map((value) => hashPassword(value)));

  await getDb()
    .update(users)
    .set({
      totpSecret: encryptSecret(secret),
      totpEnabled: true,
      recoveryCodes: hashed,
    })
    .where(eq(users.id, user.id));

  return plain;
}

/**
 * Recovery codes are single use. A used one is removed immediately, before the
 * login is allowed to proceed.
 */
async function consumeRecoveryCode(user: User, candidate: string): Promise<boolean> {
  const stored = user.recoveryCodes;
  if (!stored || stored.length === 0) return false;

  const normalized = candidate.trim().toLowerCase();

  for (let index = 0; index < stored.length; index += 1) {
    const hash = stored[index];
    if (!hash) continue;
    if (await verifyPassword(hash, normalized)) {
      const remaining = stored.filter((_, i) => i !== index);
      await getDb().update(users).set({ recoveryCodes: remaining }).where(eq(users.id, user.id));
      return true;
    }
  }

  return false;
}

export async function disableTotp(user: User, password: string): Promise<void> {
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw badRequest('Your password is not right.', 'invalid_password');

  await getDb()
    .update(users)
    .set({ totpSecret: null, totpEnabled: false, recoveryCodes: null })
    .where(eq(users.id, user.id));
}
