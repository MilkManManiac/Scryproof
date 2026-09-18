/**
 * End-to-end smoke test against a running server.
 *
 * Exercises the real HTTP surface with real cookies rather than calling the
 * services directly, because the interesting bugs live in the wiring: auth
 * hooks, permission checks, the shapes that cross the boundary.
 *
 * The permission cases matter most. A test that only proves the happy path
 * would pass just as happily on a build where every check was removed.
 *
 *   npx tsx src/scripts/smoke.ts
 */

import { WebSocket } from 'ws';

const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787';
// Production only accepts its own PUBLIC_URL as an origin, so a run against a
// production build has to say which origin it is pretending to be.
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}`);
    if (detail !== undefined) console.log(`       ${JSON.stringify(detail)}`);
  }
}

/** A tiny cookie jar, so each actor in the test is a separate browser. */
class Actor {
  private cookie = '';
  constructor(readonly label: string) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        // Only declare a JSON body when there is one.
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        // Matches an origin the server allows, so the CSRF check passes.
        origin: ORIGIN,
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
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, json };
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }
  patch(path: string, body?: unknown) {
    return this.request('PATCH', path, body);
  }
  put(path: string, body?: unknown) {
    return this.request('PUT', path, body);
  }
  del(path: string) {
    return this.request('DELETE', path);
  }

  /**
   * A gateway socket for this actor, with the same cookie. Events pile up in
   * `events`; `ready` is the ready frame. Voice presence is the one thing the
   * REST surface cannot drive, and it is the thing the permission scoping is
   * most likely to get wrong, so the socket is here for that.
   */
  async socket(): Promise<Socket> {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/gateway`, {
      headers: { origin: ORIGIN, cookie: this.cookie },
    });
    const events: any[] = [];
    let readyFrame: any = null;
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (raw) => {
        const event = JSON.parse(raw.toString());
        events.push(event);
        if (event.t === 'ready') {
          readyFrame = event.d;
          resolve();
        }
      });
      ws.on('error', reject);
      ws.on('close', () => reject(new Error(`${this.label}'s socket closed before ready`)));
    });
    return {
      events,
      get ready() {
        return readyFrame;
      },
      send: (event: unknown) => ws.send(JSON.stringify(event)),
      close: () => ws.close(),
    };
  }
}

interface Socket {
  events: any[];
  readonly ready: any;
  send: (event: unknown) => void;
  close: () => void;
}

const settle = (ms = 250) => new Promise((done) => setTimeout(done, ms));

async function main(): Promise<void> {
  const stamp = Date.now().toString(36);
  const owner = new Actor('owner');
  const friend = new Actor('friend');

  console.log(`\nGoOffline smoke test against ${BASE}\n`);

  /* ------------------------------- accounts ------------------------------ */
  console.log('accounts');

  const ownerName = `owner${stamp}`;
  const registered = await owner.post('/api/auth/register', {
    username: ownerName,
    displayName: 'Owner',
    password: 'a-long-enough-passphrase',
  });
  check('owner can register', registered.status === 200, registered.json);

  const weak = await new Actor('weak').post('/api/auth/register', {
    username: `weak${stamp}`,
    password: 'short',
  });
  check('short password is rejected', weak.status === 400, weak.json);

  const me = await owner.get('/api/auth/me');
  check('session cookie works', me.status === 200 && me.json?.user?.username === ownerName, me.json);

  const anon = await new Actor('anon').get('/api/auth/me');
  check('no cookie means unauthorized', anon.status === 401, anon.json);

  const badLogin = await new Actor('bad').post('/api/auth/login', {
    username: ownerName,
    password: 'wrong-password-entirely',
  });
  check('wrong password is refused', badLogin.status === 401, badLogin.json);

  /* -------------------------------- server ------------------------------- */
  console.log('\nservers and channels');

  const createdServer = await owner.post('/api/servers', { name: 'Test Server' });
  check('owner can create a server', createdServer.status === 200, createdServer.json);

  const serverId: string = createdServer.json?.server?.id;
  const channels: any[] = createdServer.json?.server?.channels ?? [];
  check('new server is furnished with channels', channels.length === 2, channels.map((c) => c.name));

  const textChannel = channels.find((c) => c.type === 'text');
  const voiceChannel = channels.find((c) => c.type === 'voice');
  check('has a text and a voice channel', Boolean(textChannel && voiceChannel));

  const everyoneRole = (createdServer.json?.server?.roles ?? []).find((r: any) => r.isEveryone);
  check('server has an @everyone role', Boolean(everyoneRole));

  /* ------------------------------- messages ------------------------------ */
  console.log('\nmessages');

  const sent = await owner.post(`/api/channels/${textChannel.id}/messages`, {
    content: 'first message',
  });
  check('owner can send a message', sent.status === 200, sent.json);

  const empty = await owner.post(`/api/channels/${textChannel.id}/messages`, { content: '   ' });
  check('empty message is rejected', empty.status === 400, empty.json);

  const history = await owner.get(`/api/channels/${textChannel.id}/messages`);
  check(
    'message appears in history',
    history.status === 200 && history.json?.messages?.[0]?.content === 'first message',
    history.json,
  );

  const edited = await owner.patch(`/api/messages/${sent.json.message.id}`, {
    content: 'edited message',
  });
  check(
    'author can edit their message',
    edited.status === 200 && edited.json?.message?.content === 'edited message',
    edited.json,
  );

  const encryptedReject = await owner.post(`/api/channels/${textChannel.id}/messages`, {
    ciphertext: Buffer.from('nope').toString('base64'),
  });
  check(
    'ciphertext is refused in a plaintext channel',
    encryptedReject.status === 400,
    encryptedReject.json,
  );

  /* -------------------------------- invites ------------------------------ */
  console.log('\ninvites and membership');

  const invite = await owner.post(`/api/servers/${serverId}/invites`, { expiresIn: '1d' });
  check('owner can create an invite', invite.status === 200, invite.json);
  const inviteCode: string = invite.json?.invite?.code;

  const instanceInvite = await owner.post('/api/instance-invites', { maxUses: 1 });
  check('owner can create an account invite', instanceInvite.status === 200, instanceInvite.json);

  const noInvite = await new Actor('noinvite').post('/api/auth/register', {
    username: `nope${stamp}`,
    password: 'a-long-enough-passphrase',
  });
  check('registration without an invite is refused', noInvite.status === 400, noInvite.json);

  // Uses a real invite so it gets past the invite gate and reaches the
  // duplicate check, which is the thing under test.
  const duplicate = await new Actor('dupe').post('/api/auth/register', {
    username: ownerName,
    password: 'a-long-enough-passphrase',
    inviteCode: instanceInvite.json.invite.code,
  });
  check('duplicate username is refused', duplicate.status === 409, duplicate.json);

  const friendRegistered = await friend.post('/api/auth/register', {
    username: `friend${stamp}`,
    displayName: 'Friend',
    password: 'another-long-passphrase',
    inviteCode: instanceInvite.json.invite.code,
  });
  // Also proves the failed attempt above did not burn the single-use invite.
  check('friend registers with an invite', friendRegistered.status === 200, friendRegistered.json);

  const hiddenBefore = await friend.get(`/api/servers/${serverId}`);
  check('non-member cannot see the server', hiddenBefore.status === 404, hiddenBefore.json);

  const joined = await friend.post(`/api/invites/${inviteCode}/accept`);
  check('friend joins with the invite', joined.status === 200, joined.json);

  const members = await owner.get(`/api/servers/${serverId}/members`);
  check('server now has two members', members.json?.members?.length === 2, members.json);

  /* ------------------------------ permissions ---------------------------- */
  console.log('\npermissions');

  const friendSent = await friend.post(`/api/channels/${textChannel.id}/messages`, {
    content: 'hello from friend',
  });
  check('member can send by default', friendSent.status === 200, friendSent.json);

  const friendDeletesOwner = await friend.del(`/api/messages/${sent.json.message.id}`);
  check(
    'member cannot delete someone else’s message',
    friendDeletesOwner.status === 403,
    friendDeletesOwner.json,
  );

  const friendCreatesChannel = await friend.post(`/api/servers/${serverId}/channels`, {
    name: 'sneaky',
  });
  check(
    'member without MANAGE_CHANNELS cannot create a channel',
    friendCreatesChannel.status === 403,
    friendCreatesChannel.json,
  );

  const friendDeletesServer = await friend.del(`/api/servers/${serverId}`);
  check('member cannot delete the server', friendDeletesServer.status === 403, friendDeletesServer.json);

  const friendKicksOwner = await friend.del(`/api/servers/${serverId}/members/${me.json.user.id}`);
  check('member cannot kick the owner', friendKicksOwner.status === 403, friendKicksOwner.json);

  // Deny @everyone VIEW_CHANNEL on a new private channel and confirm the
  // friend cannot see it at all, not even its name.
  const privateChannel = await owner.post(`/api/servers/${serverId}/channels`, {
    name: 'mods-only',
  });
  check('owner can create a channel', privateChannel.status === 200, privateChannel.json);

  const VIEW_CHANNEL = (1n << 0n).toString();
  const denied = await owner.put(
    `/api/channels/${privateChannel.json.channel.id}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: '0', deny: VIEW_CHANNEL },
  );
  check('owner can deny @everyone view access', denied.status === 200, denied.json);

  const friendSeesPrivate = await friend.get(`/api/channels/${privateChannel.json.channel.id}`);
  check(
    'denied member gets 404, not 403, for a hidden channel',
    friendSeesPrivate.status === 404,
    friendSeesPrivate.json,
  );

  const friendReadsPrivate = await friend.get(
    `/api/channels/${privateChannel.json.channel.id}/messages`,
  );
  check(
    'denied member cannot read a hidden channel',
    friendReadsPrivate.status === 404,
    friendReadsPrivate.json,
  );

  const friendServerView = await friend.get(`/api/servers/${serverId}`);
  const visibleNames: string[] = (friendServerView.json?.server?.channels ?? []).map(
    (c: any) => c.name,
  );
  check(
    'hidden channel is absent from the member’s channel list',
    !visibleNames.includes('mods-only'),
    visibleNames,
  );

  const ownerStillSees = await owner.get(`/api/channels/${privateChannel.json.channel.id}`);
  check('owner still sees the hidden channel', ownerStillSees.status === 200, ownerStillSees.json);

  /* --------------------------- category layer ---------------------------- */
  console.log('\ncategory permissions');

  // A category is a permission layer, not a heading. Locking it should lock
  // every channel inside it without touching the channels themselves.
  const category = await owner.post(`/api/servers/${serverId}/categories`, { name: 'Staff' });
  check('owner can create a category', category.status === 200, category.json);
  const categoryId = category.json?.category?.id;

  const inCategory = await owner.post(`/api/servers/${serverId}/channels`, {
    name: 'staff-room',
    categoryId,
  });
  check('owner can create a channel inside it', inCategory.status === 200, inCategory.json);
  const inCategoryId = inCategory.json?.channel?.id;

  const beforeLock = await friend.get(`/api/channels/${inCategoryId}`);
  check(
    'the channel is visible before the category is locked',
    beforeLock.status === 200,
    beforeLock.json,
  );

  const lockCategory = await owner.put(
    `/api/categories/${categoryId}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: '0', deny: VIEW_CHANNEL },
  );
  check('owner can deny @everyone view on the category', lockCategory.status === 200, lockCategory.json);

  const afterLock = await friend.get(`/api/channels/${inCategoryId}`);
  check(
    'a category deny hides a channel that has no overwrites of its own',
    afterLock.status === 404,
    afterLock.json,
  );

  const afterLockList = await friend.get(`/api/servers/${serverId}`);
  const namesAfterLock: string[] = (afterLockList.json?.server?.channels ?? []).map(
    (c: any) => c.name,
  );
  check(
    'the hidden channel is absent from the sidebar too',
    !namesAfterLock.includes('staff-room'),
    namesAfterLock,
  );

  // The heading is information as much as the channel is. "Staff" holds
  // nothing this member may see, so they are not told it exists.
  const categoriesAfterLock: string[] = (afterLockList.json?.server?.categories ?? []).map(
    (c: any) => c.name,
  );
  check(
    'a category holding nothing visible is absent from the sidebar',
    !categoriesAfterLock.includes('Staff'),
    categoriesAfterLock,
  );

  const ownerSees = await owner.get(`/api/servers/${serverId}`);
  const ownerCategories: string[] = (ownerSees.json?.server?.categories ?? []).map(
    (c: any) => c.name,
  );
  check(
    'someone who may manage channels still sees the category',
    ownerCategories.includes('Staff'),
    ownerCategories,
  );

  // The category sets the default; the channel gets the final word.
  const reopen = await owner.put(
    `/api/channels/${inCategoryId}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: VIEW_CHANNEL, deny: '0' },
  );
  check('owner can allow view back on one channel', reopen.status === 200, reopen.json);

  const afterReopen = await friend.get(`/api/channels/${inCategoryId}`);
  check(
    'a channel allow overrides the category deny',
    afterReopen.status === 200,
    afterReopen.json,
  );

  // Moving a channel out of a locked category must restore it, with no
  // re-syncing and nothing left over.
  const secondChannel = await owner.post(`/api/servers/${serverId}/channels`, {
    name: 'staff-notes',
    categoryId,
  });
  const secondId = secondChannel.json?.channel?.id;
  const secondHidden = await friend.get(`/api/channels/${secondId}`);
  check('a second channel in the category is hidden too', secondHidden.status === 404, secondHidden.json);

  const moveOut = await owner.patch(`/api/channels/${secondId}`, { categoryId: null });
  check('owner can move a channel out of the category', moveOut.status === 200, moveOut.json);

  const afterMove = await friend.get(`/api/channels/${secondId}`);
  check(
    'moving a channel out of a locked category reveals it again',
    afterMove.status === 200,
    afterMove.json,
  );

  /* ---------------------------------- layout ----------------------------- */
  console.log('\nlayout');

  // The whole order in one request. The part that matters is that moving a
  // channel under a heading is a permission change, and the endpoint has to
  // treat it as one: the category is still locked here.
  const ownerView = (await owner.get(`/api/servers/${serverId}`)).json?.server;
  const layoutOf = (view: any, place: (channel: any) => string | null) => ({
    categories: [...view.categories]
      .sort((a: any, b: any) => a.position - b.position)
      .map((c: any) => c.id),
    channels: view.channels.map((c: any) => ({ id: c.id, categoryId: place(c) })),
  });

  const backIn = await owner.put(
    `/api/servers/${serverId}/layout`,
    layoutOf(ownerView, (c) => (c.id === secondId ? categoryId : c.categoryId)),
  );
  check('owner can move a channel into a category through the layout', backIn.status === 200, backIn.json);
  const hiddenAgain = await friend.get(`/api/channels/${secondId}`);
  check(
    'a channel moved into a locked category through the layout is hidden',
    hiddenAgain.status === 404,
    hiddenAgain.json,
  );

  const reversed = await owner.put(`/api/servers/${serverId}/layout`, {
    categories: layoutOf(ownerView, () => null).categories,
    channels: [...ownerView.channels]
      .reverse()
      .map((c: any) => ({ id: c.id, categoryId: c.id === secondId ? null : c.categoryId })),
  });
  check('owner can reverse the channel order and move it out in the same request', reversed.status === 200, reversed.json);
  const afterReverse = (await owner.get(`/api/servers/${serverId}`)).json?.server;
  const firstBefore = ownerView.channels[0]?.id;
  const positionOf = (id: string) => afterReverse.channels.find((c: any) => c.id === id)?.position;
  check(
    'positions are renumbered underneath the order sent',
    positionOf(firstBefore) === ownerView.channels.length - 1,
    afterReverse.channels.map((c: any) => [c.name, c.position]),
  );
  const revealedAgain = await friend.get(`/api/channels/${secondId}`);
  check('and the channel moved out is visible again', revealedAgain.status === 200, revealedAgain.json);

  const twice = await owner.put(`/api/servers/${serverId}/layout`, {
    categories: [],
    channels: [
      { id: secondId, categoryId: null },
      { id: secondId, categoryId: null },
    ],
  });
  check('a channel listed twice is refused', twice.status === 400, twice.json);

  const friendArranges = await friend.put(
    `/api/servers/${serverId}/layout`,
    layoutOf(ownerView, (c) => c.categoryId),
  );
  check('a member without MANAGE_CHANNELS cannot rearrange', friendArranges.status === 403, friendArranges.json);

  const layoutEntry = (await owner.get(`/api/servers/${serverId}/audit-log`)).json?.entries?.find(
    (e: any) => e.action === 'server.layout',
  );
  check('the audit log records the rearrangement once per gesture', Boolean(layoutEntry), layoutEntry);

  const clearedCategory = await owner.del(
    `/api/categories/${categoryId}/permissions/${everyoneRole.id}`,
  );
  check('owner can clear a category overwrite', clearedCategory.status === 200, clearedCategory.json);

  const friendEditsCategory = await friend.put(
    `/api/categories/${categoryId}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: '0', deny: VIEW_CHANNEL },
  );
  check(
    'a member without MANAGE_ROLES cannot edit category permissions',
    friendEditsCategory.status === 403,
    friendEditsCategory.json,
  );

  const conflictingCategory = await owner.put(
    `/api/categories/${categoryId}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: VIEW_CHANNEL, deny: VIEW_CHANNEL },
  );
  check(
    'a category overwrite cannot both allow and deny the same bit',
    conflictingCategory.status === 400,
    conflictingCategory.json,
  );

  /* --------------------------- privilege ceiling ------------------------- */
  console.log('\nprivilege escalation');

  const ADMINISTRATOR = (1n << 25n).toString();
  const modRole = await owner.post(`/api/servers/${serverId}/roles`, {
    name: 'Moderator',
    permissions: (
      (1n << 2n) | // MANAGE_MESSAGES
      (1n << 22n) // MANAGE_ROLES
    ).toString(),
  });
  check('owner can create a role', modRole.status === 200, modRole.json);

  const granted = await owner.put(
    `/api/servers/${serverId}/members/${friendRegistered.json.user.id}/roles`,
    { roleIds: [modRole.json.role.id] },
  );
  check('owner can assign the role', granted.status === 200, granted.json);

  const selfPromote = await friend.post(`/api/servers/${serverId}/roles`, {
    name: 'Sneaky Admin',
    permissions: ADMINISTRATOR,
  });
  check(
    'moderator cannot mint a role with permissions they lack',
    selfPromote.status === 403,
    selfPromote.json,
  );

  const escalateOverwrite = await friend.put(
    `/api/channels/${textChannel.id}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: ADMINISTRATOR, deny: '0' },
  );
  check(
    'moderator cannot grant ADMINISTRATOR via a channel overwrite',
    escalateOverwrite.status === 403,
    escalateOverwrite.json,
  );

  const conflicting = await owner.put(
    `/api/channels/${textChannel.id}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: VIEW_CHANNEL, deny: VIEW_CHANNEL },
  );
  check(
    'a permission cannot be allowed and denied at once',
    conflicting.status === 400,
    conflicting.json,
  );

  const modDeletesMessage = await friend.del(`/api/messages/${sent.json.message.id}`);
  check(
    'moderator with MANAGE_MESSAGES can delete a message',
    modDeletesMessage.status === 200,
    modDeletesMessage.json,
  );

  const afterDelete = await owner.get(`/api/channels/${textChannel.id}/messages`);
  const tombstone = (afterDelete.json?.messages ?? []).find(
    (m: any) => m.id === sent.json.message.id,
  );
  check(
    'deleted message keeps its place but loses its body',
    Boolean(tombstone) && tombstone.deleted === true && tombstone.content === null,
    tombstone,
  );

  /* ---------------------------------- voice ------------------------------ */
  console.log('\nvoice');

  const voiceConfig = await owner.get('/api/voice/config');
  check('voice config is readable', voiceConfig.status === 200, voiceConfig.json);

  const voiceToken = await owner.post(`/api/channels/${voiceChannel.id}/voice/token`);
  check(
    'voice token endpoint reports unavailable until LiveKit is configured',
    voiceToken.status === 503 || voiceToken.status === 200,
    voiceToken.json,
  );

  const tokenForTextChannel = await owner.post(`/api/channels/${textChannel.id}/voice/token`);
  check(
    'no voice token for a text channel',
    tokenForTextChannel.status === 400 || tokenForTextChannel.status === 503,
    tokenForTextChannel.json,
  );

  /* ----------------------------- voice presence -------------------------- */
  console.log('\nvoice presence');

  // Who is standing in a voice channel is only news to the people who can see
  // that channel. This once went to the whole server, and to every reconnect,
  // and out of the voice-states endpoint. Presence needs no media server, so
  // it is provable here with a socket and no LiveKit.
  const warRoom = await owner.post(`/api/servers/${serverId}/channels`, {
    name: 'war-room',
    type: 'voice',
  });
  check('owner can create a private voice channel', warRoom.status === 200, warRoom.json);
  const warRoomId = warRoom.json?.channel?.id;

  const lockWarRoom = await owner.put(
    `/api/channels/${warRoomId}/permissions/${everyoneRole.id}`,
    { targetType: 'role', allow: '0', deny: VIEW_CHANNEL },
  );
  check('owner can hide it from @everyone', lockWarRoom.status === 200, lockWarRoom.json);

  const ownerSocket = await owner.socket();
  const friendSocket = await friend.socket();

  ownerSocket.send({ t: 'voice_state', d: { channelId: warRoomId, cameraOn: true } });
  await settle();

  const voiceEvents = (socket: Socket) =>
    socket.events.filter((e) => e.t === 'voice_state_update');
  check(
    'the owner is told they joined',
    voiceEvents(ownerSocket).some((e) => e.d.channelId === warRoomId),
    voiceEvents(ownerSocket),
  );
  check(
    'a member who cannot see the channel is told nothing, camera and all',
    voiceEvents(friendSocket).length === 0,
    voiceEvents(friendSocket),
  );

  // The ready frame on a fresh connect is the second place this leaked.
  const friendAgain = await friend.socket();
  check(
    'a fresh connect does not carry the hidden call either',
    !(friendAgain.ready.voiceStates ?? []).some((v: any) => v.channelId === warRoomId),
    friendAgain.ready.voiceStates,
  );
  friendAgain.close();

  // And the REST endpoint is the third.
  const friendStates = await friend.get(`/api/servers/${serverId}/voice-states`);
  check(
    'the voice-states endpoint keeps it out too',
    friendStates.status === 200 &&
      !(friendStates.json?.voiceStates ?? []).some((v: any) => v.channelId === warRoomId),
    friendStates.json,
  );
  const ownerStates = await owner.get(`/api/servers/${serverId}/voice-states`);
  check(
    'while the owner sees themself in it',
    (ownerStates.json?.voiceStates ?? []).some((v: any) => v.channelId === warRoomId),
    ownerStates.json,
  );

  // Open the channel, and the person already in it has to become visible:
  // nobody moved, so no event fires, which is why the client refetches.
  const clearWarRoom = await owner.del(
    `/api/channels/${warRoomId}/permissions/${everyoneRole.id}`,
  );
  check('owner can open it again', clearWarRoom.status === 200, clearWarRoom.json);
  const friendStatesAfter = await friend.get(`/api/servers/${serverId}/voice-states`);
  check(
    'once the channel is visible, the person already in it is too',
    (friendStatesAfter.json?.voiceStates ?? []).some((v: any) => v.channelId === warRoomId),
    friendStatesAfter.json,
  );

  // Leaving says channelId: null, which names no channel, so the scope has to
  // come from the channel being left. Lock it again first: if the departure
  // were scoped by its payload, the friend would hear about it.
  await owner.put(`/api/channels/${warRoomId}/permissions/${everyoneRole.id}`, {
    targetType: 'role',
    allow: '0',
    deny: VIEW_CHANNEL,
  });
  await settle();
  const friendBeforeLeave = voiceEvents(friendSocket).length;
  ownerSocket.send({ t: 'voice_state', d: { channelId: null } });
  await settle();
  check(
    'a departure from a hidden channel is not announced to someone who cannot see it',
    voiceEvents(friendSocket).length === friendBeforeLeave,
    voiceEvents(friendSocket),
  );
  check(
    'but the people who can see it are told',
    voiceEvents(ownerSocket).some((e) => e.d.channelId === null),
    voiceEvents(ownerSocket),
  );

  ownerSocket.close();
  friendSocket.close();

  /* --------------------------------- audit ------------------------------- */
  console.log('\naudit log');

  const auditLog = await owner.get(`/api/servers/${serverId}/audit-log`);
  const actions: string[] = (auditLog.json?.entries ?? []).map((e: any) => e.action);
  check('audit log records channel creation', actions.includes('channel.create'), actions);
  check('audit log records permission changes', actions.includes('channel.permissions'), actions);
  check('audit log records role creation', actions.includes('role.create'), actions);
  check(
    'audit log records category permission changes',
    actions.includes('category.permissions'),
    actions,
  );

  const friendAudit = await friend.get(`/api/servers/${serverId}/audit-log`);
  check(
    'member without VIEW_AUDIT_LOG cannot read it',
    friendAudit.status === 403,
    friendAudit.json,
  );

  /* -------------------------------- summary ------------------------------ */
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
