/**
 * Logging.
 *
 * Structured JSON in production so logs are greppable, human-readable lines in
 * development. The rule that matters more than the format: message bodies,
 * passwords, tokens and TOTP seeds never reach a log line. IP addresses are
 * hashed with a per-boot salt, so an old log cannot be correlated with a new
 * one or with a person.
 */

import { config } from '../config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVEL_ORDER[(process.env.LOG_LEVEL as Level) ?? (config.isProduction ? 'info' : 'debug')] ?? 20;

/** Keys that must never be printed, whatever nests them. */
const REDACTED = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'passwordHash',
  'totpSecret',
  'totpCode',
  'secret',
  'content',
  'ciphertext',
  'recoveryCodes',
  'key',
  'cookie',
  'authorization',
]);

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED.has(key) ? '[redacted]' : scrub(nested, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, context: unknown, message: string): void {
  if (LEVEL_ORDER[level] < threshold) return;

  if (config.isProduction) {
    process.stdout.write(
      `${JSON.stringify({ at: new Date().toISOString(), level, msg: message, ...(scrub(context) as object) })}\n`,
    );
    return;
  }

  const extra = context && Object.keys(context as object).length > 0 ? scrub(context) : undefined;
  const stamp = new Date().toISOString().slice(11, 23);
  const line = `${stamp} ${level.padEnd(5)} ${message}`;
  if (extra) console.log(line, extra);
  else console.log(line);
}

export const logger = {
  debug: (context: unknown, message: string) => write('debug', context, message),
  info: (context: unknown, message: string) => write('info', context, message),
  warn: (context: unknown, message: string) => write('warn', context, message),
  error: (context: unknown, message: string) => write('error', context, message),
};
