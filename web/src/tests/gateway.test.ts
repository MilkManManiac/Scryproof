/**
 * The gateway client against a pretend socket and a pretend clock: a bad frame
 * does not stop the frames behind it, and a wake from sleep or a network blip
 * is quick rather than a half-minute wait.
 *
 *   npm test
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

type Listener = (event: unknown) => void;

/** Just enough WebSocket to see what the client does with it. */
class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static made: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, Listener[]> = {};

  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    (this.listeners[name] ??= []).push(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
  }

  fire(name: string, event: unknown = {}) {
    if (name === 'open') this.readyState = FakeSocket.OPEN;
    if (name === 'close') this.readyState = FakeSocket.CLOSED;
    for (const listener of this.listeners[name] ?? []) listener(event);
  }

  /** A frame from the server. */
  receive(frame: unknown) {
    this.fire('message', { data: JSON.stringify(frame) });
  }
}

// `lib/desktop` reads `window` as it loads, so the pretend browser comes first.
const g = globalThis as Record<string, unknown>;
g.window = Object.assign(new EventTarget(), { location: { protocol: 'http:', host: 'box.test' } });
g.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
g.WebSocket = FakeSocket;

const { Gateway, serialQueue } = await import('../lib/gateway');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('one bad frame', () => {
  test('a job that throws does not stop the one behind it', async () => {
    const enqueue = serialQueue();
    const seen: string[] = [];
    enqueue(() => {
      throw new Error('cannot read servers of undefined');
    });
    enqueue(async () => {
      seen.push('second');
    });
    enqueue(() => {
      seen.push('third');
    });
    await tick();
    assert.deepEqual(seen, ['second', 'third']);
  });

  test('a malformed ready frame is dropped and the next frame still goes through', async () => {
    FakeSocket.made = [];
    const applied: string[] = [];
    const enqueue = serialQueue();
    const gateway = new Gateway({
      onEvent: (event) =>
        enqueue(() => {
          // What the store does with `ready`: walk the servers. A ready with
          // no servers throws, the way the blank screen of 2026-10-06 did.
          if (event.t === 'ready') for (const server of event.d.servers) applied.push(server.id);
          else applied.push(event.t);
        }),
      onStatus: () => undefined,
    });
    gateway.connect();
    const socket = FakeSocket.made[0]!;
    socket.fire('open');
    socket.receive({ t: 'ready', d: {} });
    socket.receive({ t: 'message_create', d: { id: '1' } });
    socket.receive({ t: 'presence', d: { userId: 'wes', status: 'online' } });
    await tick();
    assert.deepEqual(applied, ['message_create', 'presence']);
    gateway.close();
  });
});

const FAKE_TIMERS = { apis: ['setTimeout', 'setInterval'] as ('setTimeout' | 'setInterval')[] };

function openGateway() {
  FakeSocket.made = [];
  const statuses: string[] = [];
  const gateway = new Gateway({ onEvent: () => undefined, onStatus: (status) => statuses.push(status) });
  gateway.connect();
  FakeSocket.made[0]!.fire('open');
  return { gateway, statuses };
}

describe('coming back from sleep or a blip', () => {
  test('the network coming back cuts the backoff short and starts it over', (t) => {
    t.mock.timers.enable(FAKE_TIMERS);
    const { gateway } = openGateway();
    // Three failed attempts: the next wait would be 8 s or more.
    for (let n = 0; n < 3; n += 1) {
      FakeSocket.made.at(-1)!.fire('close', { code: 1006 });
      t.mock.timers.tick(8_000 * 1.3);
    }
    assert.equal(FakeSocket.made.length, 4);
    FakeSocket.made.at(-1)!.fire('close', { code: 1006 });
    t.mock.timers.tick(5_000);
    assert.equal(FakeSocket.made.length, 4, 'still waiting out the backoff');

    (globalThis.window as EventTarget).dispatchEvent(new Event('online'));
    assert.equal(FakeSocket.made.length, 5, 'a new socket at once');

    // And the backoff is back at the first step: one more failure retries within 2 s.
    FakeSocket.made.at(-1)!.fire('close', { code: 1006 });
    t.mock.timers.tick(1_700);
    assert.equal(FakeSocket.made.length, 6);
    gateway.close();
  });

  test('a heartbeat nobody answers means the socket is dead: drop it and reconnect', (t) => {
    t.mock.timers.enable(FAKE_TIMERS);
    const { gateway, statuses } = openGateway();
    const socket = FakeSocket.made[0]!;
    t.mock.timers.tick(25_000);
    assert.deepEqual(socket.sent, [JSON.stringify({ t: 'heartbeat' })]);
    t.mock.timers.tick(10_000);
    assert.equal(socket.readyState, FakeSocket.CLOSED);
    assert.equal(statuses.at(-1), 'reconnecting');
    t.mock.timers.tick(1_700);
    assert.equal(FakeSocket.made.length, 2);
    // The dead socket closing late is not a second disconnection.
    socket.fire('close', { code: 1006 });
    assert.equal(FakeSocket.made.length, 2);
    gateway.close();
  });

  test('an answered heartbeat keeps the socket', (t) => {
    t.mock.timers.enable(FAKE_TIMERS);
    const { gateway } = openGateway();
    const socket = FakeSocket.made[0]!;
    t.mock.timers.tick(25_000);
    socket.receive({ t: 'heartbeat_ack', d: { at: 1 } });
    t.mock.timers.tick(10_000);
    assert.equal(socket.readyState, FakeSocket.OPEN);
    assert.equal(FakeSocket.made.length, 1);
    gateway.close();
  });

  test('the tab coming back pings an open socket; a hidden tab does nothing', (t) => {
    t.mock.timers.enable(FAKE_TIMERS);
    const { gateway } = openGateway();
    const socket = FakeSocket.made[0]!;
    const document = globalThis.document as EventTarget & { visibilityState: string };
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(socket.sent, []);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(socket.sent, [JSON.stringify({ t: 'heartbeat' })]);
    // Unanswered after the sleep: gone within the ack deadline, not a half minute.
    t.mock.timers.tick(10_000);
    assert.equal(FakeSocket.made.length, 1);
    assert.equal(socket.readyState, FakeSocket.CLOSED);
    gateway.close();
  });

  test('closing the gateway stops it listening for the network', () => {
    const { gateway } = openGateway();
    gateway.close();
    (globalThis.window as EventTarget).dispatchEvent(new Event('online'));
    assert.equal(FakeSocket.made.length, 1);
  });
});
