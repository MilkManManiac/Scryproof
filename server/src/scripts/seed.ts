/**
 * Seed a local instance with something worth looking at.
 *
 * Talks to the running server over HTTP, exactly as a browser would, so it
 * exercises registration, invites, permissions and posting rather than writing
 * rows behind the API's back. If the seed works, the app works.
 *
 *   bash scripts/dev-restart.sh     # fresh database
 *   npm run seed --workspace server
 *
 * Prints the credentials at the end. These are development accounts on a local
 * database that gets wiped on every restart; they are not secrets and they
 * must never exist on the box.
 */

export {};

const BASE = process.env.SEED_BASE ?? 'http://127.0.0.1:8787';
const PASSWORD = 'seed-passphrase-for-local-dev';

class Actor {
  private cookie = '';
  id = '';

  constructor(
    readonly username: string,
    readonly displayName: string,
  ) {}

  async request(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        origin: 'http://localhost:5173',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const first = setCookie.split(';')[0];
      if (first) this.cookie = first;
    }

    const text = await response.text();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
    }
    return json;
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, body?: unknown) => this.request('POST', path, body);
  patch = (path: string, body?: unknown) => this.request('PATCH', path, body);
  put = (path: string, body?: unknown) => this.request('PUT', path, body);
}

/** Spread the timestamps so the timeline groups and divides like a real one. */
async function say(actor: Actor, channelId: string, content: string): Promise<void> {
  await actor.post(`/api/channels/${channelId}/messages`, { content });
  await new Promise((resolve) => setTimeout(resolve, 60));
}

async function main(): Promise<void> {
  const context = await new Actor('', '').get('/api/auth/context');
  if (!context.firstRun) {
    console.error(
      'This instance already has accounts. Run `bash scripts/dev-restart.sh` for a clean one.',
    );
    process.exit(1);
  }

  console.log(`\nSeeding ${BASE}\n`);

  const wes = new Actor('wes', 'Wes');
  const owner = await wes.post('/api/auth/register', {
    username: wes.username,
    displayName: wes.displayName,
    password: PASSWORD,
  });
  wes.id = owner.user.id;
  console.log(`  owner  @${wes.username}`);

  // Everyone after the first needs an invite, so the owner mints them.
  const friends = [
    new Actor('alex', 'Alex'),
    new Actor('mara', 'Mara'),
    new Actor('dev', 'Devon'),
  ];

  for (const friend of friends) {
    const { invite } = await wes.post('/api/instance-invites', { maxUses: 1 });
    const created = await friend.post('/api/auth/register', {
      username: friend.username,
      displayName: friend.displayName,
      password: PASSWORD,
      inviteCode: invite.code,
    });
    friend.id = created.user.id;
    console.log(`  member @${friend.username}`);
  }

  const { server } = await wes.post('/api/servers', { name: 'The Table' });
  console.log(`  server ${server.name}`);

  const general = server.channels.find((c: any) => c.type === 'text');
  const textCategory = server.categories.find((c: any) => c.name.toLowerCase().includes('text'));

  const planning = await wes.post(`/api/servers/${server.id}/channels`, {
    name: 'session-planning',
    type: 'text',
    categoryId: textCategory?.id ?? null,
  });
  const maps = await wes.post(`/api/servers/${server.id}/channels`, {
    name: 'maps',
    type: 'text',
    categoryId: textCategory?.id ?? null,
  });

  await wes.patch(`/api/channels/${general.id}`, {
    topic: 'Anything and everything. Keep the spoilers in #session-planning.',
  });
  await wes.patch(`/api/channels/${maps.channel.id}`, {
    topic: 'Work in progress. Rivers take the longest.',
    slowmodeSeconds: 5,
  });

  // A moderator role, hoisted so it separates in the member list.
  const { role } = await wes.post(`/api/servers/${server.id}/roles`, {
    name: 'Table Mods',
    color: '#e0a33f',
  });
  await wes.patch(`/api/roles/${role.id}`, {
    // Manage messages plus kick. Deliberately not administrator.
    permissions: String((1n << 2n) | (1n << 17n) | (1n << 16n)),
    hoist: true,
  });

  const { invite } = await wes.post(`/api/servers/${server.id}/invites`, { expiresIn: '7d' });
  for (const friend of friends) {
    await friend.post(`/api/invites/${invite.code}/accept`);
  }

  await wes.put(`/api/servers/${server.id}/members/${friends[0]!.id}/roles`, {
    roleIds: [role.id],
  });

  const [alex, mara, devon] = friends as [Actor, Actor, Actor];

  await say(wes, general.id, 'Right, this is ours now. No Discord, no telemetry, nobody else on the wire.');
  await say(alex, general.id, 'It loads fast. What is it actually running on?');
  await say(wes, general.id, 'One box. The whole thing moves to another host with a restore and a DNS change.');
  await say(mara, general.id, 'Does voice work the same way?');
  await say(
    wes,
    general.id,
    'Same box, and the audio is end to end encrypted, so the server relays it without being able to listen.',
  );
  await say(devon, general.id, 'Prove it later. For now I just want the map channel.');
  await say(alex, general.id, 'Seconded.');

  await say(wes, planning.channel.id, 'Next session: the river crossing, then the thing under it.');
  await say(mara, planning.channel.id, 'Do we need to bring the boat or is that a trap');
  await say(wes, planning.channel.id, 'Yes.');

  await say(wes, maps.channel.id, 'Started the marshes. The rivers take longer than the whole coastline.');
  await say(devon, maps.channel.id, 'That is the part that makes it look hand made though.');

  console.log('\nDone.\n');
  console.log('  Open      http://localhost:5173');
  console.log(`  Sign in   ${['wes', ...friends.map((f) => f.username)].join(' / ')}`);
  console.log(`  Password  ${PASSWORD}`);
  console.log('\n  Local development accounts only. This database is wiped on restart.\n');
}

main().catch((problem) => {
  console.error('\nSeed failed:', problem instanceof Error ? problem.message : problem, '\n');
  process.exit(1);
});
