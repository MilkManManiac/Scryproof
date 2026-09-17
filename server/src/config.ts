/**
 * Configuration, read once at boot.
 *
 * Every secret comes from the environment. Nothing is defaulted to a real
 * value that would be unsafe in production: if a required secret is missing
 * when NODE_ENV is production, we refuse to start rather than quietly
 * generating one and pretending things are fine.
 */

import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const isProduction = process.env.NODE_ENV === 'production';

function required(name: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (isProduction) {
    throw new Error(
      `${name} is not set. Production refuses to start without it. See infra/.env.example.`,
    );
  }
  return '';
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * In development we generate an ephemeral session secret so a fresh clone
 * runs with zero setup. The cost is that restarting logs everyone out, which
 * is the correct tradeoff for a dev box and unacceptable in production.
 */
function sessionSecret(): string {
  const fromEnv = required('SESSION_SECRET');
  if (fromEnv) {
    if (fromEnv.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters.');
    }
    return fromEnv;
  }
  return randomBytes(32).toString('hex');
}

const dataDir = resolve(process.cwd(), optional('DATA_DIR', '.data'));

export const config = {
  isProduction,
  port: optionalNumber('PORT', 8787),
  host: optional('HOST', '127.0.0.1'),

  /** Public origin, used for cookies, invite links and CORS. */
  publicUrl: optional('PUBLIC_URL', 'http://localhost:5173'),

  /**
   * Empty means "use PGlite in this directory". PGlite is real Postgres
   * compiled to WebAssembly, so local development needs no database install
   * and still runs the same SQL and the same migrations as the droplet.
   */
  databaseUrl: optional('DATABASE_URL', ''),
  dataDir,
  pgliteDir: resolve(dataDir, 'pg'),

  sessionSecret: sessionSecret(),
  sessionTtlDays: optionalNumber('SESSION_TTL_DAYS', 30),
  cookieName: optional('COOKIE_NAME', 'go_session'),

  /**
   * Invite-only by default. This is a private server for Wes's groups, not a
   * public signup product, and open registration is the single fastest way to
   * acquire an abuse problem.
   */
  registrationRequiresInvite: bool('REGISTRATION_REQUIRES_INVITE', true),

  storage: {
    /** 'local' writes to disk; 's3' targets MinIO or any S3-compatible store. */
    driver: optional('STORAGE_DRIVER', 'local') as 'local' | 's3',
    localPath: resolve(dataDir, optional('STORAGE_PATH', 'uploads')),
    s3: {
      endpoint: optional('S3_ENDPOINT', ''),
      bucket: optional('S3_BUCKET', 'gooffline'),
      region: optional('S3_REGION', 'us-east-1'),
      accessKeyId: optional('S3_ACCESS_KEY_ID', ''),
      secretAccessKey: optional('S3_SECRET_ACCESS_KEY', ''),
    },
  },

  /**
   * Media server.
   *
   * In development these default to the throwaway values in
   * `infra/livekit/livekit.dev.yaml`, so `npm run dev:livekit` is all it takes
   * to have working voice locally. The key pair guards a server bound to
   * 127.0.0.1 and nothing else. In production there are no defaults: unset
   * means voice is off, and the API says so.
   */
  livekit: {
    url: optional('LIVEKIT_URL', isProduction ? '' : 'ws://127.0.0.1:7880'),
    apiKey: optional('LIVEKIT_API_KEY', isProduction ? '' : 'devkey'),
    apiSecret: optional(
      'LIVEKIT_API_SECRET',
      isProduction ? '' : 'devsecret-devsecret-devsecret-devsecret',
    ),
    /** How long a join token stays valid. Short on purpose. */
    tokenTtlSeconds: optionalNumber('LIVEKIT_TOKEN_TTL_SECONDS', 900),
  },

  rateLimits: {
    loginPerMinute: optionalNumber('RATE_LOGIN_PER_MINUTE', 10),
    registerPerHour: optionalNumber('RATE_REGISTER_PER_HOUR', 5),
    messagesPerMinute: optionalNumber('RATE_MESSAGES_PER_MINUTE', 60),
  },
} as const;

export function isUsingPglite(): boolean {
  return config.databaseUrl === '';
}
