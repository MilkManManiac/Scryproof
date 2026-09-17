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

import type { ServerEvent, VoiceState } from '@gooffline/shared';
import { VOICE_SIGNAL_MAX_BYTES } from '@gooffline/shared';

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
