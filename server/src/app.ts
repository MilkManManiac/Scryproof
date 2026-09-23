/**
 * HTTP application.
 *
 * Fastify with a deliberately small plugin list. Every dependency here runs in
 * the process that handles the most sensitive data we have, so the bar for
 * adding one is high.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';

import { LIMITS } from '@scryproof/shared';

import { config } from './config.js';
import { HttpError } from './lib/http-error.js';
import { logger } from './lib/logger.js';
import { pickClientIp } from './lib/client-ip.js';
import { hashIp } from './lib/crypto.js';
import { resolveSession } from './services/auth.js';
import type { User } from './db/schema.js';

import { registerAuthRoutes } from './routes/auth.js';
import { registerServerRoutes } from './routes/servers.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerRoleRoutes } from './routes/roles.js';
import { registerEmojiRoutes } from './routes/emojis.js';
import { registerSoundRoutes } from './routes/sounds.js';
import { registerEventRoutes } from './routes/events.js';
import { registerTrackerRoutes } from './routes/trackers.js';
import { registerInviteRoutes } from './routes/invites.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerDmRoutes } from './routes/dms.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerBlockRoutes } from './routes/blocks.js';
import { registerDownloadRoutes } from './routes/downloads.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth hook when a valid session cookie is present. */
    user: User | null;
    sessionId: string | null;
  }
}

/** Throws unless the request carries a valid session. */
export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw new HttpError(401, 'unauthorized', 'You are not signed in.');
  return request.user;
}

export function clientIp(request: FastifyRequest): string {
  // The reasoning, and the attack this replaces, are in lib/client-ip.ts.
  return pickClientIp(request.headers['x-forwarded-for'], request.socket.remoteAddress);
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // We do our own structured logging with redaction; Fastify's would be a
    // second, less careful path for the same data.
    logger: false,
    // Off on purpose. Fastify's version believes the *first* forwarded address,
    // which is the one the visitor controls. clientIp() is the only reader.
    trustProxy: false,
    bodyLimit: 1024 * 1024,
  });

  /**
   * Treat an empty body as an empty object.
   *
   * Plenty of endpoints here take no body at all (accept an invite, leave a
   * server, request a voice token). Fastify's default parser rejects an empty
   * payload that arrives with a JSON content type, which is exactly what
   * `fetch` sends when a caller sets the header out of habit. Failing those
   * requests teaches nobody anything.
   */
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done) => {
      const raw = typeof body === 'string' ? body.trim() : '';
      if (raw === '') {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(raw));
      } catch {
        done(new HttpError(400, 'invalid_json', 'That request body is not valid JSON.'), undefined);
      }
    },
  );

  await app.register(cookie, { secret: config.sessionSecret });

  await app.register(multipart, {
    limits: {
      fileSize: LIMITS.attachmentBytes,
      files: LIMITS.attachmentsPerMessage,
    },
  });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  /**
   * Security headers.
   *
   * The content security policy is `self` for everything that matters. No CDN,
   * no analytics origin, no font host: if a policy violation ever fires, it is
   * a bug or an attack, never a third party we forgot about.
   */
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header(
      'Permissions-Policy',
      'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()',
    );
    if (config.isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    return payload;
  });

  /**
   * Cross-site request forgery.
   *
   * Session cookies are SameSite=Lax, which already blocks cross-site POSTs
   * from a form. This is the second lock: every state-changing request must
   * come from our own origin. Cheap, and it does not depend on getting cookie
   * attributes right in every browser.
   */
  app.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    const origin = request.headers.origin;
    if (!origin) return; // Non-browser client; the session cookie still governs.

    const allowed = new Set([config.publicUrl]);
    if (!config.isProduction) {
      allowed.add('http://localhost:5173');
      allowed.add('http://127.0.0.1:5173');
    }

    if (!allowed.has(origin)) {
      await reply.status(403).send({ code: 'bad_origin', message: 'Request origin is not allowed.' });
    }
  });

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[config.cookieName];
    const session = await resolveSession(token);
    request.user = session?.user ?? null;
    request.sessionId = session?.sessionId ?? null;
  });

  /**
   * After an admin reset (`resetPassword` in services/auth.ts) the account is
   * signed in with a temporary password that someone else has seen. Until it
   * is replaced, it may only look at itself, change the password, or leave.
   * The client shows the new-password screen; this is what makes that screen
   * more than a suggestion.
   */
  const allowedBeforeNewPassword = new Set(['/api/auth/me', '/api/auth/password', '/api/auth/logout', '/api/auth/context']);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.user?.mustChangePassword) return;
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api') || allowedBeforeNewPassword.has(path)) return;
    await reply
      .status(403)
      .send({ code: 'password_change_required', message: 'Choose a new password first.' });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      // A route called .parse() directly and the body didn't match. That's a
      // shape problem with what was sent, not a server fault, so it is a 400
      // and it is not worth an error-level log line.
      const firstPath = error.issues[0]?.path.join('.');
      const message = firstPath
        ? `Some of what was sent is not in the right shape: ${firstPath}`
        : 'Some of what was sent is not in the right shape.';
      logger.debug({ path: request.url, method: request.method }, 'request body failed validation');
      void reply.status(400).send({ code: 'invalid_request', message });
      return;
    }

    if (error instanceof HttpError) {
      if (error.status === 429 && typeof error.details?.retryAfterSeconds === 'number') {
        void reply.header('Retry-After', String(error.details.retryAfterSeconds));
      }
      void reply.status(error.status).send(error.toJSON());
      return;
    }

    const fastifyError = error as { statusCode?: number; message?: string };
    const status = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;

    if (status >= 500) {
      logger.error(
        { error, path: request.url, method: request.method, ip: hashIp(clientIp(request)) },
        'request failed',
      );
      // Internal detail never reaches the client: stack traces and driver
      // errors are a map of the system for anyone probing it.
      void reply.status(500).send({ code: 'internal_error', message: 'Something went wrong.' });
      return;
    }

    void reply
      .status(status)
      .send({ code: 'bad_request', message: fastifyError.message ?? 'Bad request.' });
  });

  app.setNotFoundHandler((request, reply: FastifyReply) => {
    if (request.url.startsWith('/api') || request.url.startsWith('/gateway')) {
      void reply.status(404).send({ code: 'not_found', message: 'Not found.' });
      return;
    }
    // Anything else is a client-side route; the SPA handles it.
    void reply.status(404).send({ code: 'not_found', message: 'Not found.' });
  });

  app.get('/api/health', async () => ({ ok: true, at: new Date().toISOString() }));

  await registerAuthRoutes(app);
  await registerServerRoutes(app);
  await registerChannelRoutes(app);
  await registerMessageRoutes(app);
  await registerRoleRoutes(app);
  await registerEmojiRoutes(app);
  await registerSoundRoutes(app);
  await registerEventRoutes(app);
  await registerTrackerRoutes(app);
  await registerInviteRoutes(app);
  await registerAttachmentRoutes(app);
  await registerVoiceRoutes(app);
  await registerDmRoutes(app);
  await registerProfileRoutes(app);
  await registerBlockRoutes(app);
  await registerDownloadRoutes(app);

  // This process serves the API and the gateway only. The built web client is
  // served by nginx, which does static files better and keeps a file-serving
  // dependency out of the process that holds the database credentials.
  return app;
}
