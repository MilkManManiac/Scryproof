/**
 * The gateway client against a pretend socket: a bad frame does not stop the
 * frames behind it.
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
