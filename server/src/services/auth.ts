/**
 * Accounts and sessions.
 *
 * We run our own. No identity provider gets a list of who talks to whom, which
 * is the entire point of the project. The cost is that password reset, 2FA and
 * session management are ours to get right, so they are written out here
 * rather than scattered through route handlers.
 */

import { and, eq, gt, isNull } from 'drizzle-orm';

import { validatePassword, validateUsername, validateDisplayName } from '@scryproof/shared';

import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { invites, sessions, users } from '../db/schema.js';
import {
  fakeVerifyPassword,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../lib/crypto.js';
import { uuidv7 } from '../lib/ids.js';
import { HttpError, badRequest, conflict, unauthorized } from '../lib/http-error.js';
import type { User } from '../db/schema.js';

export interface SessionResult {
  user: User;
  /** Raw cookie value. Only ever returned here; the database stores its hash. */
  token: string;
  expiresAt: Date;
  sessionId: string;
}

function sessionExpiry(): Date {
  return new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
}

export async function createSession(user: User, userAgent: string | null): Promise<SessionResult> {
  const token = generateToken();
  const expiresAt = sessionExpiry();
  const sessionId = uuidv7();

  await getDb().insert(sessions).values({
    id: sessionId,
    userId: user.id,
    tokenHash: hashToken(token),
    // Truncated: enough to recognise a device in a session list, not enough to
    // be a fingerprint worth keeping.
    userAgent: userAgent ? userAgent.slice(0, 120) : null,
    expiresAt,
    lastUsedAt: new Date(),
  });

  return { user, token, expiresAt, sessionId };
}

export interface AuthenticatedSession {
  user: User;
  sessionId: string;
}

/**
 * Resolve a cookie to a user. Returns null rather than throwing so callers can
 * decide whether the route actually requires a session.
 */
export async function resolveSession(token: string | undefined): Promise<AuthenticatedSession | null> {
  if (!token) return null;

  const db = getDb();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.user.disabledAt) return null;

  // Touch at most once a minute. Writing on every request would turn a read
  // path into a write path for no benefit.
  const last = row.session.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last > 60_000) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, row.session.id));
  }

  return { user: row.user, sessionId: row.session.id };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export interface RegisterInput {
  username: string;
  displayName: string;
  password: string;
  inviteCode: string | null;
  /**
   * Bypass the invite requirement. Set only for the very first account on a
   * fresh instance, where there is nobody who could have issued an invite.
   * The caller proves that condition, not this function.
   */
  skipInvite?: boolean;
}

/**
 * Create an account. Registration is invite-only by default, which is what
 * keeps a private server private and is the cheapest possible defence against
 * every kind of drive-by abuse.
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim() || username;

  const usernameCheck = validateUsername(username);
  if (!usernameCheck.ok) throw badRequest(usernameCheck.error, 'invalid_username');

  const displayCheck = validateDisplayName(displayName);
  if (!displayCheck.ok) throw badRequest(displayCheck.error, 'invalid_display_name');

  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.ok) throw badRequest(passwordCheck.error, 'invalid_password');

  const db = getDb();

  let inviteRow: typeof invites.$inferSelect | null = null;
  if (config.registrationRequiresInvite && !input.skipInvite) {
    if (!input.inviteCode) {
      throw badRequest('This server is invite only. You need an invite code.', 'invite_required');
    }
    inviteRow = await consumeInvitePreflight(input.inviteCode);
  }

  const existing = await findUserByUsername(username);
  if (existing) throw conflict('That username is taken.', 'username_taken');

  const user: typeof users.$inferInsert = {
    id: uuidv7(),
    username,
    displayName,
    passwordHash: await hashPassword(input.password),
  };

  const [created] = await db.insert(users).values(user).returning();
  if (!created) throw new HttpError(500, 'register_failed', 'Could not create the account.');

  if (inviteRow) {
    await db
      .update(invites)
      .set({ uses: inviteRow.uses + 1 })
      .where(eq(invites.code, inviteRow.code));
  }

  return created;
}

/**
 * Check an invite is usable without spending it. The actual increment happens
 * only after the account is created, so a failed registration does not burn a
 * single-use code.
 */
export async function consumeInvitePreflight(code: string): Promise<typeof invites.$inferSelect> {
  const [row] = await getDb()
    .select()
    .from(invites)
    .where(and(eq(invites.code, code.trim().toLowerCase()), isNull(invites.revokedAt)))
    .limit(1);

  if (!row) throw badRequest('That invite code is not valid.', 'invalid_invite');
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw badRequest('That invite has expired.', 'invalid_invite');
  }
  if (row.maxUses !== null && row.uses >= row.maxUses) {
    throw badRequest('That invite has already been used.', 'invalid_invite');
  }
  return row;
}

export interface LoginInput {
  username: string;
  password: string;
  totpCode?: string | undefined;
}

export type LoginOutcome =
  | { kind: 'ok'; user: User }
  | { kind: 'totp_required' };

/**
 * Verify credentials.
 *
 * Wrong username and wrong password produce the same error and take the same
 * amount of time, so the endpoint cannot be used to discover who has an
 * account here.
 */
export async function login(input: LoginInput): Promise<LoginOutcome> {
  const username = input.username.trim().toLowerCase();
  const user = await findUserByUsername(username);

  if (!user) {
    await fakeVerifyPassword(input.password);
    throw unauthorized('Wrong username or password.');
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) throw unauthorized('Wrong username or password.');

  if (user.disabledAt) throw unauthorized('That account is disabled.');

  if (user.totpEnabled) {
    if (!input.totpCode) return { kind: 'totp_required' };

    const { verifyTotpForUser } = await import('./totp.js');
    const valid = await verifyTotpForUser(user, input.totpCode);
    if (!valid) throw unauthorized('That two-factor code is not right.');
  }

  return { kind: 'ok', user };
}

export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw unauthorized('Your current password is not right.');

  const check = validatePassword(newPassword);
  if (!check.ok) throw badRequest(check.error, 'invalid_password');

  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, user.id));

  // Changing a password is the thing you do when you think someone else has
  // it, so every other session dies with it.
  await revokeAllSessions(user.id);
}

/** True when nobody has registered yet, which unlocks first-run setup. */
export async function isFirstRun(): Promise<boolean> {
  const [row] = await getDb().select({ id: users.id }).from(users).limit(1);
  return !row;
}
