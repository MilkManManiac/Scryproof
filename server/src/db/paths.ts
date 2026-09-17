/**
 * Where the committed migrations live.
 *
 * This file runs from two places. Under tsx in development it is
 * `server/src/db/paths.ts`, two levels below `server/`. In production it has
 * been bundled into `server/dist/index.js`, one level below. A single
 * hard-coded `../..` was right for the first and wrong for the second, which
 * is a mistake that only shows itself on the first production boot. So we look
 * for the folder rather than assuming where we are standing.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function findMigrations(): string {
  const candidates = [resolve(here, '../drizzle'), resolve(here, '../../drizzle')];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'meta/_journal.json'))) return candidate;
  }
  throw new Error(`No migrations folder found. Looked in: ${candidates.join(', ')}`);
}

export const MIGRATIONS_FOLDER = findMigrations();
