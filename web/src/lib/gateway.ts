/**
 * Gateway client.
 *
 * One WebSocket, authenticated by the session cookie the browser already
 * holds. Reconnects with exponential backoff and jitter, because a server
 * restart should not produce a thundering herd from every open tab.
 *
 * On reconnect the server sends a fresh `ready` containing the whole world, so
 * there is no replay protocol to get wrong: state is rebuilt from scratch and
 * anything missed while offline simply arrives in the new snapshot.
 *
 * Two things make a wake from sleep or a network blip quick rather than a
 * half-minute wait: the network or the tab coming back cuts the backoff short,
 * and a heartbeat that gets no answer within `HEARTBEAT_ACK_MS` means the
 * socket only looks open, so it is dropped and a new one started.
 */

import {
  GATEWAY_PATH,
  HEARTBEAT_INTERVAL_MS,
  decodeServerEvent,
  encodeEvent,
} from '@scryproof/shared';
import type { ClientEvent, ServerEvent } from '@scryproof/shared';
import { gatewayUrl } from './desktop';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface GatewayHandlers {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const MAX_BACKOFF_MS = 30_000;
/** How long a heartbeat may go unanswered before the socket is given up on. */
export const HEARTBEAT_ACK_MS = 10_000;

function withParam(url: string, name: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(name, value);
  return parsed.toString();
}

/**
 * Runs jobs one at a time, in order. A job that throws is dropped and the
 * next one still runs: one bad frame must not stop every frame after it.
 */
export function serialQueue(): (job: () => void | Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve();
  return (job) => {
    tail = tail.then(job).catch(() => undefined);
  };
}

export class Gateway {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closedByUs = false;
  private listening = false;

  constructor(private readonly handlers: GatewayHandlers) {}

  connect(): void {
    this.closedByUs = false;
    this.clearTimers();
    this.listen();

    // `follows=move`: this app joins the channel a moderator moves it to by
    // itself, so the server may move it (routes/voice.ts).
    const url = withParam(gatewayUrl(GATEWAY_PATH), 'follows', 'move');

    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.handlers.onStatus('open');

      this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_INTERVAL_MS);
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      // Anything from the server says the socket is alive, not only the ack.
      this.clearAck();
      const parsed = decodeServerEvent(event.data);
      if (parsed) this.handlers.onEvent(parsed);
    });

    socket.addEventListener('close', (event) => {
      // A socket this client already gave up on (dropped or replaced).
      if (this.socket !== socket) return;
      this.clearTimers();
      this.socket = null;

      // A close we asked for is not a disconnection. Reporting one would tell
      // the app the session had gone, and in React's development double-mount
      // that means signing the user out a few milliseconds after signing in.
      if (this.closedByUs) return;

      // 4001 means the server no longer recognises this session. Reconnecting
      // would loop forever, so stop and let the app send them to sign in.
      if (event.code === 4001) {
        this.handlers.onStatus('closed');
        return;
      }

      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      // 'close' always follows, and that is where reconnection is handled.
    });
  }

  /** Sends a heartbeat and starts the clock on its answer. */
  private ping(): void {
    if (!this.send({ t: 'heartbeat' })) return;
    if (this.ackTimer) return;
    this.ackTimer = setTimeout(() => this.drop(), HEARTBEAT_ACK_MS);
  }

  /** The socket looks open but nothing comes back: give up on it, start over. */
  private drop(): void {
    const socket = this.socket;
    this.clearTimers();
    this.socket = null;
    socket?.close();
    this.scheduleReconnect();
  }

  /**
   * The network or the tab came back. Waiting out the rest of a backoff would
   * be a half-minute of nothing; connect now, from the first step. An open
   * socket may be dead after a sleep without the browser knowing yet, so it
   * gets a heartbeat and `HEARTBEAT_ACK_MS` to answer.
   */
  readonly wake = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (this.reconnectTimer) {
      this.attempt = 0;
      this.connect();
      return;
    }
    if (this.isOpen) this.ping();
  };

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    window.addEventListener('online', this.wake);
    window.addEventListener('pageshow', this.wake);
    document.addEventListener('visibilitychange', this.wake);
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('online', this.wake);
    window.removeEventListener('pageshow', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
  }

  private scheduleReconnect(): void {
    this.handlers.onStatus('reconnecting');

    // Exponential backoff with jitter, capped. The jitter matters: without it
    // every client that dropped together comes back together.
    const base = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    const delay = base * (0.7 + Math.random() * 0.6);
    this.attempt += 1;

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearAck(): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearAck();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  get isOpen(): boolean { return this.socket?.readyState === WebSocket.OPEN; }

  send(event: ClientEvent): boolean {
    if (!this.isOpen || !this.socket) return false;
    this.socket.send(encodeEvent(event));
    return true;
  }

  close(): void {
    this.closedByUs = true;
    this.clearTimers();
    this.unlisten();
    this.socket?.close();
    this.socket = null;
  }
}
