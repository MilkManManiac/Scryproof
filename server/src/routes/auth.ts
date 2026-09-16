/**
 * Account endpoints: register, sign in, sign out, two-factor, password.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { config } from '../config.js';
import { clientIp, requireUser } from '../app.js';
import { consume, reset } from '../lib/rate-limit.js';
import { hashIp } from '../lib/crypto.js';
import { badRequest, tooManyRequests, unauthorized } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import {
  changePassword,
  createSession,
  isFirstRun,
  login,
  registerUser,
  revokeAllSessions,
  revokeSession,
} from '../services/auth.js';
import {
  beginTotpEnrollment,
  completeTotpEnrollment,
  disableTotp,
} from '../services/totp.js';
import * as serialize from '../services/serialize.js';

const registerBody = z.object({
  username: z.string().min(1).max(64),
  displayName: z.string().max(64).optional(),
  password: z.string().min(1).max(512),
  inviteCode: z.string().max(64).optional(),
});

const loginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(512),
  totpCode: z.string().max(32).optional(),
});

/**
 * Session cookie attributes.
 *
 * httpOnly keeps it out of JavaScript, so a cross-site script cannot read it.
 * SameSite=Lax stops it riding along on cross-site POSTs. Secure is on in
 * production and off locally only because localhost is not served over TLS.
 */
function cookieOptions(expiresAt: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    expires: expiresAt,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Lets the sign-in screen know whether to offer first-run setup. */
  app.get('/api/auth/context', async () => ({
    firstRun: await isFirstRun(),
    inviteRequired: config.registrationRequiresInvite,
  }));

  app.post('/api/auth/register', async (request, reply) => {
    const ip = clientIp(request);
    const limit = consume(`register:${hashIp(ip)}`, config.rateLimits.registerPerHour, 3_600_000);
    if (!limit.allowed) {
      throw tooManyRequests('Too many sign-up attempts. Try again later.', limit.retryAfterSeconds);
    }

    const body = registerBody.parse(request.body);

    // The very first account on a fresh instance does not need an invite,
    // because there is nobody to issue one. Every account after it does.
    const firstRun = await isFirstRun();

    const user = await registerUser({
      username: body.username,
      displayName: body.displayName ?? body.username,
      password: body.password,
      inviteCode: body.inviteCode ?? null,
      skipInvite: firstRun,
    });

    const session = await createSession(user, request.headers['user-agent'] ?? null);
    void reply.setCookie(config.cookieName, session.token, cookieOptions(session.expiresAt));

    logger.info({ userId: user.id, firstRun }, 'account created');
    return { user: serialize.selfUser(user) };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const ip = clientIp(request);
    const body = loginBody.parse(request.body);

    // Two buckets. The per-IP one stops a broad guessing run; the per-account
    // one stops someone hammering a single known username from many addresses.
    const ipKey = `login:ip:${hashIp(ip)}`;
    const userKey = `login:user:${body.username.toLowerCase()}`;

    for (const key of [ipKey, userKey]) {
      const limit = consume(key, config.rateLimits.loginPerMinute, 60_000);
      if (!limit.allowed) {
        throw tooManyRequests('Too many sign-in attempts. Wait a moment.', limit.retryAfterSeconds);
      }
    }

    const outcome = await login({
      username: body.username,
      password: body.password,
      totpCode: body.totpCode,
    });

    if (outcome.kind === 'totp_required') {
      // Deliberately a 200 with a flag rather than an error: the password was
      // correct and the client needs to ask for the second factor.
      return { totpRequired: true };
    }

    reset(ipKey);
    reset(userKey);

    const session = await createSession(outcome.user, request.headers['user-agent'] ?? null);
    void reply.setCookie(config.cookieName, session.token, cookieOptions(session.expiresAt));

    logger.info({ userId: outcome.user.id }, 'signed in');
    return { user: serialize.selfUser(outcome.user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionId) await revokeSession(request.sessionId);
    void reply.clearCookie(config.cookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    const user = requireUser(request);
    return { user: serialize.selfUser(user) };
  });

  /**
   * Two-factor enrolment is two steps on purpose: the secret is only written
   * to the database once the user has proved they can generate a code from it,
   * so a half-finished setup can never lock someone out.
   */
  app.post('/api/auth/totp/begin', async (request) => {
    const user = requireUser(request);
    if (user.totpEnabled) throw badRequest('Two-factor is already on.', 'totp_enabled');

    const enrollment = beginTotpEnrollment(user);
    const qrcode = await import('qrcode');
    const dataUrl = await qrcode.default.toDataURL(enrollment.uri, { margin: 1, width: 240 });

    return { secret: enrollment.secret, uri: enrollment.uri, qr: dataUrl };
  });

  app.post('/api/auth/totp/complete', async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ secret: z.string().min(16).max(128), code: z.string().min(6).max(12) })
      .parse(request.body);

    const recoveryCodes = await completeTotpEnrollment(user, body.secret, body.code);
    logger.info({ userId: user.id }, 'two-factor enabled');

    // Shown exactly once. We store only hashes, so they cannot be re-displayed.
    return { recoveryCodes };
  });

  app.post('/api/auth/totp/disable', async (request) => {
    const user = requireUser(request);
    const body = z.object({ password: z.string().min(1).max(512) }).parse(request.body);
    await disableTotp(user, body.password);
    logger.info({ userId: user.id }, 'two-factor disabled');
    return { ok: true };
  });

  app.post('/api/auth/password', async (request, reply) => {
    const user = requireUser(request);
    const body = z
      .object({
        currentPassword: z.string().min(1).max(512),
        newPassword: z.string().min(1).max(512),
      })
      .parse(request.body);

    await changePassword(user, body.currentPassword, body.newPassword);

    // changePassword revoked every session including this one, so issue a
    // fresh cookie rather than silently signing the user out of the tab they
    // are looking at.
    const session = await createSession(user, request.headers['user-agent'] ?? null);
    void reply.setCookie(config.cookieName, session.token, cookieOptions(session.expiresAt));

    logger.info({ userId: user.id }, 'password changed');
    return { ok: true };
  });

  app.post('/api/auth/sessions/revoke-all', async (request, reply) => {
    const user = requireUser(request);
    await revokeAllSessions(user.id);
    void reply.clearCookie(config.cookieName, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/guard', async (request) => {
    if (!request.user) throw unauthorized();
    return { ok: true };
  });
}
