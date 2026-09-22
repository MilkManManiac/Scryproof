/**
 * Entry point. Boot order matters: database, then migrations, then storage,
 * then HTTP, then the gateway. Nothing serves traffic until the schema it
 * expects is actually there.
 */

import { buildApp } from './app.js';
import { config, isUsingPglite } from './config.js';
import { closeDatabase, initDatabase, runMigrations } from './db/index.js';
import { MIGRATIONS_FOLDER } from './db/paths.js';
import { attachGateway } from './gateway/index.js';
import { logger } from './lib/logger.js';
import { ensureStorageReady } from './services/storage.js';
import { isLivekitConfigured } from './services/livekit.js';
import { startUploadSweep } from './services/upload-sweep.js';

async function main(): Promise<void> {
  await initDatabase();
  await runMigrations(MIGRATIONS_FOLDER);
  await ensureStorageReady();

  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });

  const detachGateway = attachGateway(app.server);
  const stopUploadSweep = startUploadSweep();

  logger.info(
    {
      port: config.port,
      host: config.host,
      database: isUsingPglite() ? 'pglite (local file)' : 'postgres',
      storage: config.storage.driver,
      voice: isLivekitConfigured() ? 'livekit configured' : 'livekit not configured yet',
      publicUrl: config.publicUrl,
    },
    'Scryproof server listening',
  );

  if (!config.isProduction) {
    console.log(`\n  API      http://${config.host}:${config.port}/api/health`);
    console.log(`  Web      ${config.publicUrl}\n`);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    stopUploadSweep();
    detachGateway();
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ error }, 'failed to start');
  process.exit(1);
});
