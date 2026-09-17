/**
 * Start the local LiveKit media server.
 *
 *   npm run dev:livekit
 *
 * The binary is not in the repo. It lives in .tools/livekit/, downloaded from
 * LiveKit's GitHub releases and checked against their published SHA-256. If it
 * is missing this says how to get it rather than fetching it silently.
 *
 * Bound to 127.0.0.1. Windows may still ask about firewall access the first
 * time, because media uses UDP; "Cancel" is fine, loopback works regardless.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const binary = join(root, '.tools/livekit', process.platform === 'win32' ? 'livekit-server.exe' : 'livekit-server');

if (!existsSync(binary)) {
  console.error(`No LiveKit binary at ${binary}`);
  console.error('Download livekit_<version>_<platform> from https://github.com/livekit/livekit/releases,');
  console.error('check it against checksums.txt from the same release, and unpack it into .tools/livekit/.');
  console.error('Prefer a release more than a week old, for the same reason .npmrc holds packages back.');
  process.exit(2);
}

const child = spawn(binary, ['--config', join(root, 'infra/livekit/livekit.dev.yaml')], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
