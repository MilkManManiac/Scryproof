import type { Config } from 'drizzle-kit';

/**
 * Only `drizzle-kit generate` uses this, and generate reads the schema file
 * rather than a live database, so no connection string is needed here. Applying
 * migrations is done by the server at boot (see src/db/index.ts).
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
} satisfies Config;
