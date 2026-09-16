import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Committed SQL produced by `npm run db:generate`. */
export const MIGRATIONS_FOLDER = resolve(here, '../../drizzle');
