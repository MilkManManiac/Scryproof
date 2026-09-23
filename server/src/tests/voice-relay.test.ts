/**
 * The gateway's part in voice encryption: counting epochs and carrying sealed
 * messages between the people in a channel.
 *
 * It is a small part on purpose, and these tests are mostly about what it must
 * refuse. The relay never sees a key, so none of this is about secrecy. It is
 * about who can put a message in front of whom, and about a rotation happening
 * every single time the room changes.
 */

import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import type { ServerEvent, VoiceState } from '@scryproof/shared';
import { VOICE_SIGNAL_MAX_BYTES } from '@scryproof/shared';

import * as hub from '../gateway/hub';
import { handleVoiceSignal } from '../gateway/voice';

let nextId = 0;
let run = 0;

interface Seat {
  connection: hub.Connection;
  inbox: ServerEvent[];
}

function connect(userId: string): Seat {
  const inbox: ServerEvent[] = [];
  const ws = {
    readyState: 1,
    send: (raw: string) => inbox.push(JSON.parse(raw) as ServerEvent),
  };
  const connection = {
    id: `c${(nextId += 1)}`,
    ws,
    userId,
    sessionId: 's',
    servers: new Set(['srv']),
    permissionCache: new Map(),
    status: 'online',
    lastSeenAt: Date.now(),
    alive: true,
  } as unknown as hub.Connection;
  hub.addConnection(connection);
  return { connection, inbox };
}

function voiceState(userId: string, channelId: string | null, extra: Partial<VoiceState> = {}): VoiceState {
  return {
    userId,
    serverId: 'srv',
    channelId,
    dmId: null,
    selfMute: false,
    selfDeaf: false,
    serverMute: false,
    serverDeaf: false,
    sharingScreen: false,
    cameraOn: false,
    ...extra,
  };
}

const memberships = (seat: Seat) =>
  seat.inbox.flatMap((event) => (event.t === 'voice_membership' ? [event.d] : []));
const signals = (seat: Seat) =>
  seat.inbox.flatMap((event) => (event.t === 'voice_signal' ? [event.d] : []));

// Module state persists between tests, so each one gets its own channel and people.
let room = '';
let wes: Seat;
let alex: Seat;
let mara: Seat;

beforeEach(() => {
  run += 1;
  room = `room${run}`;
  wes = connect(`wes${run}`);
  alex = connect(`alex${run}`);
  mara = connect(`mara${run}`);
});

describe('voice epochs', () => {
  it('goes up when someone joins, and tells the people in the room', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));

    assert.equal(hub.voiceEpoch(room), 2);
    assert.deepEqual(memberships(wes).map((m) => m.epoch), [1, 2]);
    assert.deepEqual(memberships(alex).map((m) => m.epoch), [2]);
    assert.deepEqual(memberships(alex)[0]?.members.sort(), [alex.connection.userId, wes.connection.userId].sort());
  });

  it('tells nobody outside the room', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    assert.equal(memberships(mara).length, 0);
  });

  it('goes up when someone leaves, so the people who stay rotate', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, null));

    assert.equal(hub.voiceEpoch(room), 3);
    const last = memberships(wes).at(-1);
    assert.deepEqual(last?.members, [wes.connection.userId]);
    // The one who left is not told about a room they are no longer in.
    assert.equal(memberships(alex).at(-1)?.epoch, 2);
  });

  it('goes up when a browser dies', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    hub.clearVoiceStatesForUser(alex.connection.userId);

    assert.equal(hub.voiceEpoch(room), 3);
  });

  it('goes up when someone is removed from the server', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    hub.removeUserFromServer(alex.connection.userId, 'srv');

    assert.equal(hub.voiceEpoch(room), 3);
    assert.deepEqual(hub.voiceOccupants(room), [wes.connection.userId]);
  });

  it('rotates both rooms when someone moves between them', () => {
    const other = `${room}-other`;
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, other));

    assert.equal(hub.voiceEpoch(room), 3);
    assert.equal(hub.voiceEpoch(other), 1);
  });

  it('does not move for mute, deafen, camera or screen share', () => {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    const before = hub.voiceEpoch(room);

    hub.setVoiceState(voiceState(wes.connection.userId, room, { selfMute: true }));
    hub.setVoiceState(voiceState(wes.connection.userId, room, { selfDeaf: true, cameraOn: true }));
    hub.setVoiceState(voiceState(wes.connection.userId, room, { sharingScreen: true }));

    assert.equal(hub.voiceEpoch(room), before);
  });
});

describe('the voice relay', () => {
  const payload = { sealed: 'opaque-to-the-server' };

  function seatEveryone(): number {
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    return hub.voiceEpoch(room);
  }

  it('carries a message to the others in the room, unchanged', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch, kind: 'announce', payload });

    assert.deepEqual(signals(alex), [
      { channelId: room, epoch, kind: 'announce', payload, from: wes.connection.userId },
    ]);
  });

  it('does not echo a message back to its sender', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch, kind: 'announce', payload });
    assert.equal(signals(wes).length, 0);
  });

  it('delivers an addressed message to that person only', () => {
    hub.setVoiceState(voiceState(mara.connection.userId, room));
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch, kind: 'key', payload, to: alex.connection.userId });

    assert.equal(signals(alex).length, 1);
    assert.equal(signals(mara).length, 0);
  });

  it('refuses someone who is not in the room', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(mara.connection, { channelId: room, epoch, kind: 'announce', payload });

    assert.equal(signals(wes).length, 0);
    assert.equal(signals(alex).length, 0);
  });

  it('will not deliver to someone who is not in the room', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch, kind: 'key', payload, to: mara.connection.userId });
    assert.equal(signals(mara).length, 0);
  });

  it('drops a message about an epoch that is over', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch: epoch - 1, kind: 'key', payload });
    assert.equal(signals(alex).length, 0);
  });

  it('drops a message about an epoch that has not happened', () => {
    const epoch = seatEveryone();
    handleVoiceSignal(wes.connection, { channelId: room, epoch: epoch + 1, kind: 'key', payload });
    assert.equal(signals(alex).length, 0);
  });

  it('drops an oversized envelope', () => {
    const epoch = seatEveryone();
    const big = { blob: 'x'.repeat(VOICE_SIGNAL_MAX_BYTES) };
    handleVoiceSignal(wes.connection, { channelId: room, epoch, kind: 'key', payload: big });
    assert.equal(signals(alex).length, 0);
  });

  it('drops anything that is not the right shape', () => {
    const epoch = seatEveryone();
    const junk = [
      { channelId: room, epoch, kind: 'nonsense', payload },
      { channelId: room, epoch: '2', kind: 'key', payload },
      { channelId: room, epoch, kind: 'key', payload: 'a string' },
      { channelId: room, epoch, kind: 'key', payload: ['an', 'array'] },
      { channelId: 7, epoch, kind: 'key', payload },
      { channelId: room, epoch, kind: 'key', payload, to: 12 },
      null,
    ];
    for (const item of junk) handleVoiceSignal(wes.connection, item as never);
    assert.equal(signals(alex).length, 0);
  });

  it('stops carrying for someone the moment they leave', () => {
    seatEveryone();
    hub.setVoiceState(voiceState(wes.connection.userId, null));
    handleVoiceSignal(wes.connection, { channelId: room, epoch: hub.voiceEpoch(room), kind: 'announce', payload });
    assert.equal(signals(alex).length, 0);
  });
});

/**
 * Who is standing in a voice channel is news only to the people who can see
 * that channel.
 *
 * This went out to the whole server, so a member who could not see a private
 * voice channel still learned its id existed, who was sitting in it, and
 * whether their camera was on. That is the 404-not-403 rule broken at the
 * gateway, and it is call metadata besides.
 *
 * `broadcastToChannel` reads each connection's permission cache before it
 * touches the database, so seating the cache is enough to drive it here.
 */
describe('voice presence reaches only the people who can see the channel', () => {
  const VIEW_CHANNEL = 1n;

  const states = (seat: Seat) =>
    seat.inbox.flatMap((event) => (event.t === 'voice_state_update' ? [event.d] : []));

  /**
   * Seats every open connection's permissions for this room, so the broadcast
   * answers from cache and never reaches for a database. Connections made by
   * earlier tests are still registered, and they are given nothing, which is
   * also the honest default: unless a test says otherwise, you cannot see it.
   */
  const seatAll = (grants: [Seat, bigint][]) => {
    for (const connection of hub.allConnections()) {
      connection.permissionCache.set('srv', new Map([[room, 0n]]));
    }
    for (const [seat, mask] of grants) {
      seat.connection.permissionCache.set('srv', new Map([[room, mask]]));
    }
  };

  it('tells someone who can see the channel', async () => {
    seatAll([[wes, VIEW_CHANNEL]]);
    await hub.announceVoiceState('srv', room, voiceState(wes.connection.userId, room));
    assert.equal(states(wes).length, 1);
    assert.equal(states(wes)[0]?.channelId, room);
  });

  it('tells nobody who cannot', async () => {
    seatAll([[wes, VIEW_CHANNEL]]);
    await hub.announceVoiceState('srv', room, voiceState(wes.connection.userId, room));
    assert.equal(states(mara).length, 0);
  });

  it('scopes a departure by the channel that was left, not the empty one on the wire', async () => {
    seatAll([[wes, VIEW_CHANNEL]]);
    // The announcement says channelId: null, which names no channel at all. If
    // the scope came from the payload there would be nothing to scope by and
    // the leak would reopen on the way out of the room.
    await hub.announceVoiceState('srv', room, voiceState(wes.connection.userId, null));
    assert.equal(states(wes).length, 1);
    assert.equal(states(wes)[0]?.channelId, null);
    assert.equal(states(mara).length, 0);
  });

  it('keeps the camera and screen flags inside the channel too', async () => {
    seatAll([]);
    await hub.announceVoiceState(
      'srv',
      room,
      voiceState(wes.connection.userId, room, { cameraOn: true, sharingScreen: true }),
    );
    assert.equal(states(mara).length, 0);
  });

  it('says nothing at all when there is no channel to scope by', async () => {
    seatAll([[wes, VIEW_CHANNEL]]);
    await hub.announceVoiceState('srv', null, voiceState(wes.connection.userId, null));
    assert.equal(states(wes).length, 0);
  });
});

/**
 * The call inside a direct message conversation.
 *
 * It is the same machinery keyed by the conversation's id instead of a
 * channel's: the same epochs, the same relay, the same rotation on every
 * change. What differs is who hears about it (the conversation's members,
 * nobody else) and that it is one of the calls a person can only be in one of.
 */
describe('a call inside a direct message', () => {
  const dmState = (userId: string, dmId: string | null, extra: Partial<VoiceState> = {}): VoiceState => ({
    ...voiceState(userId, null),
    serverId: null,
    dmId,
    ...extra,
  });
  const states = (seat: Seat) =>
    seat.inbox.flatMap((event) => (event.t === 'voice_state_update' ? [event.d] : []));

  it('rotates on join and leave, keyed by the conversation', () => {
    const dm = `dm${run}`;
    hub.setVoiceState(dmState(wes.connection.userId, dm));
    hub.setVoiceState(dmState(alex.connection.userId, dm));
    assert.equal(hub.voiceEpoch(dm), 2);
    assert.deepEqual(hub.voiceOccupants(dm).sort(), [alex.connection.userId, wes.connection.userId].sort());

    hub.clearVoiceStatesForUser(alex.connection.userId);
    assert.equal(hub.voiceEpoch(dm), 3);
    assert.deepEqual(memberships(wes).at(-1)?.members, [wes.connection.userId]);
  });

  it('relays keys between the people in it and no one else', () => {
    const dm = `dm${run}`;
    const payload = { sealed: 'opaque-to-the-server' };
    hub.setVoiceState(dmState(wes.connection.userId, dm));
    hub.setVoiceState(dmState(alex.connection.userId, dm));
    const epoch = hub.voiceEpoch(dm);

    handleVoiceSignal(wes.connection, { channelId: dm, epoch, kind: 'announce', payload });
    handleVoiceSignal(mara.connection, { channelId: dm, epoch, kind: 'announce', payload });

    assert.equal(signals(alex).length, 1);
    assert.equal(signals(alex)[0]?.from, wes.connection.userId);
    assert.equal(signals(mara).length, 0);
  });

  it('is kept apart from server calls in every lookup', () => {
    const dm = `dm${run}`;
    hub.setVoiceState(dmState(wes.connection.userId, dm));
    hub.setVoiceState(voiceState(alex.connection.userId, room));

    assert.deepEqual(hub.allVoiceStatesFor(['srv']).filter((s) => s.userId === wes.connection.userId), []);
    assert.deepEqual(hub.dmVoiceStatesFor([dm]).map((s) => s.userId), [wes.connection.userId]);
    assert.equal(hub.getDmVoiceState(wes.connection.userId)?.dmId, dm);
    assert.equal(hub.getVoiceState('srv', wes.connection.userId), null);
  });

  it('starting one leaves a server call, and the channel rotates', () => {
    const dm = `dm${run}`;
    hub.setVoiceState(voiceState(wes.connection.userId, room));
    hub.setVoiceState(voiceState(alex.connection.userId, room));
    const before = hub.voiceEpoch(room);

    // What the gateway does on a DM join: everything but this conversation goes.
    const cleared = hub.clearVoiceStatesForUser(alex.connection.userId, (s) => s.dmId === dm);
    hub.setVoiceState(dmState(alex.connection.userId, dm));

    assert.equal(cleared.length, 1);
    assert.equal(cleared[0]?.leftChannelId, room);
    assert.equal(cleared[0]?.leftDmId, null);
    assert.equal(cleared[0]?.announcement.channelId, null);
    assert.equal(hub.voiceEpoch(room), before + 1);
    assert.deepEqual(hub.voiceOccupants(room), [wes.connection.userId]);
    assert.deepEqual(hub.voiceOccupants(dm), [alex.connection.userId]);
  });

  it('muting inside it keeps the entry and does not rotate', () => {
    const dm = `dm${run}`;
    hub.setVoiceState(dmState(wes.connection.userId, dm));
    const before = hub.voiceEpoch(dm);
    const cleared = hub.clearVoiceStatesForUser(wes.connection.userId, (s) => s.dmId === dm);
    hub.setVoiceState(dmState(wes.connection.userId, dm, { selfMute: true }));

    assert.equal(cleared.length, 0);
    assert.equal(hub.voiceEpoch(dm), before);
  });

  it('leaving it names the conversation left, so the right people are told', () => {
    const dm = `dm${run}`;
    hub.setVoiceState(dmState(wes.connection.userId, dm));
    const [left] = hub.clearVoiceStatesForUser(wes.connection.userId);
    assert.equal(left?.leftDmId, dm);
    assert.equal(left?.announcement.dmId, null);
    assert.equal(left?.announcement.serverId, null);
  });

  it('is announced to the members of the conversation and nobody else', () => {
    const dm = `dm${run}`;
    hub.sendToDmMembers(
      [wes.connection.userId, alex.connection.userId],
      dmState(wes.connection.userId, dm, { cameraOn: true }),
    );
    assert.equal(states(wes).length, 1);
    assert.equal(states(alex)[0]?.dmId, dm);
    assert.equal(states(mara).length, 0);
  });
});
