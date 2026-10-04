/**
 * The `ready` frame tells a client what this gateway can do. A gateway that
 * answers call joins with `voice_owned` must say so, because a client that
 * waits for that answer from one that never sends it tears the call down and
 * re-joins forever (the deployed server predates it).
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';

import { GATEWAY_PATH, type ServerEvent } from '@scryproof/shared';

const dataDir = mkdtempSync(join(tmpdir(), 'scryproof-gateway-ready-'));
process.env.DATA_DIR = dataDir;

const { initDatabase, closeDatabase, runMigrations } = await import('../db/index.js');
const { MIGRATIONS_FOLDER } = await import('../db/paths.js');
const { registerUser, createSession } = await import('../services/auth.js');
const { buildApp } = await import('../app.js');
const { config } = await import('../config.js');
const { attachGateway } = await import('../gateway/index.js');

type App = Awaited<ReturnType<typeof buildApp>>;

describe('gateway ready frame', () => {
  let app: App;
  let detach: () => void;
  let port: number;
  let cookie: string;

  before(async () => {
    await initDatabase();
    await runMigrations(MIGRATIONS_FOLDER);
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    detach = attachGateway(app.server);
    port = (app.server.address() as { port: number }).port;
    const user = await registerUser({
      username: 'ready-person',
      displayName: 'ready-person',
      password: 'a long enough password',
      inviteCode: null,
      skipInvite: true,
    });
    const session = await createSession(user, null);
    cookie = `${config.cookieName}=${session.token}`;
  });

  after(async () => {
    detach();
    await app.close();
    await closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('advertises that it confirms voice ownership', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${GATEWAY_PATH}`, { headers: { cookie } });
    try {
      const first = await new Promise<ServerEvent>((resolve, reject) => {
        socket.once('message', (raw) => resolve(JSON.parse(raw.toString()) as ServerEvent));
        socket.once('error', reject);
        socket.once('close', () => reject(new Error('closed before ready')));
      });
      assert.equal(first.t, 'ready');
      assert.equal(first.t === 'ready' && first.d.voiceOwnership, true);
    } finally {
      socket.close();
    }
  });
});
