/**
 * The desktop installer, handed out from the box.
 *
 * The installer is 111 MB and GitHub refuses files over 100 MB, so it does not
 * travel through the repository like the rest of a release. It is copied to
 * `<DATA_DIR>/downloads/` on the box (scripts/publish-installer.sh) and served
 * from there: https://scryproof.com/download/Scryproof-Setup.exe. Anyone can
 * fetch it; it holds no secret, and an account still needs an invite.
 *
 * Beside it, `installer.json`: the installer's version, hash and a signature
 * made on Wes's PC. Installed apps read it to update themselves
 * (desktop/src/installer-core.js). The box cannot make one; it only hands it
 * out, and never from a cache, so an app sees a new installer the moment it
 * is published.
 *
 * Only names on the list below are served. Nothing under `downloads/` is
 * reachable by guessing a path.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { config } from '../config.js';
import { notFound } from '../lib/http-error.js';

const DOWNLOADS: Record<string, string> = {
  'Scryproof-Setup.exe': 'application/vnd.microsoft.portable-executable',
  'installer.json': 'application/json',
  'Scryproof.dmg': 'application/x-apple-diskimage',
  'Scryproof-mac-arm64.zip': 'application/zip',
  'installer-mac-arm64.json': 'application/json',
};

export const downloadsDir = (): string => resolve(config.dataDir, 'downloads');

export async function registerDownloadRoutes(app: FastifyInstance): Promise<void> {
  const serve = async (name: string, reply: FastifyReply) => {
    const type = Object.hasOwn(DOWNLOADS, name) ? DOWNLOADS[name] : undefined;
    if (!type) throw notFound('There is no such download.');
    const path = resolve(downloadsDir(), name);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      throw notFound('That download is not on the box yet.');
    }
    void reply.header('Content-Type', type);
    void reply.header('Content-Length', String(size));
    // The installer is saved by a browser; the JSON is read by the app.
    if (!name.endsWith('.json')) void reply.header('Content-Disposition', `attachment; filename="${name}"`);
    void reply.header('Cache-Control', 'no-store');
    return reply.send(createReadStream(path));
  };
  app.get<{ Params: { name: string } }>('/download/:name', (request, reply) => serve(request.params.name, reply));
  // Older desktop shells forward /api/ but cannot fetch /download/ as app files.
  app.get('/api/desktop/installer', (_request, reply) => serve('installer.json', reply));
}
