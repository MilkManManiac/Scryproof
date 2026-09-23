/**
 * The installer and its signed description, as the box hands them out.
 *
 * Installed apps fetch installer.json every hour to see whether there is a
 * newer app. It has to come back as JSON, uncached and byte for byte what
 * scripts/publish-installer.sh put there; everything not on the list stays
 * unreachable.
 */

import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Set before config is first read: each test file runs in a process of its own.
const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-downloads-'));
process.env.DATA_DIR = dataDir;

const manifest = `${JSON.stringify({ version: '0.5.0', sha256: 'a'.repeat(64), size: 3, signature: 'c2ln' }, null, 2)}\n`;

describe('/download/', () => {
  let app: FastifyInstance;

  before(async () => {
    mkdirSync(join(dataDir, 'downloads'));
    writeFileSync(join(dataDir, 'downloads', 'installer.json'), manifest);
    writeFileSync(join(dataDir, 'downloads', 'Scryproof-Setup.exe'), Buffer.from('MZ!'));
    writeFileSync(join(dataDir, 'downloads', 'secret.txt'), 'not for you');
    const { registerDownloadRoutes } = await import('../routes/downloads.js');
    app = Fastify();
    await registerDownloadRoutes(app);
  });

  after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('serves installer.json as uncached JSON, exactly as published', async () => {
    const response = await app.inject({ method: 'GET', url: '/download/installer.json' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/json');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['content-disposition'], undefined);
    assert.equal(response.body, manifest);
  });

  it('still hands out the installer as a file to save', async () => {
    const response = await app.inject({ method: 'GET', url: '/download/Scryproof-Setup.exe' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-disposition'], 'attachment; filename="Scryproof-Setup.exe"');
    assert.equal(response.body, 'MZ!');
  });

  it('serves nothing that is not on the list', async () => {
    for (const url of ['/download/secret.txt', '/download/..%2Finstaller.json', '/download/installer.json.part']) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
    }
  });
});
