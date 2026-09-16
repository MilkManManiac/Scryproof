/**
 * Standalone migrator, for applying migrations without starting the server.
 * Used by deploys and by `npm run db:migrate`.
 */

import { isUsingPglite } from '../config.js';
import { closeDatabase, initDatabase, runMigrations } from './index.js';
import { MIGRATIONS_FOLDER } from './paths.js';

await initDatabase();
console.log(`Applying migrations (${isUsingPglite() ? 'PGlite' : 'Postgres'})...`);
await runMigrations(MIGRATIONS_FOLDER);
console.log('Migrations applied.');
await closeDatabase();
