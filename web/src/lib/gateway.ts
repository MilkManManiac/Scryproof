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
 */

import {
  GATEWAY_PATH,
  HEARTBEAT_INTERVAL_MS,
  decodeServerEvent,
  encodeEvent,
} from '@gooffline/shared';
import type { ClientEvent, ServerEvent } from '@gooffline/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface GatewayHandlers {
  onEvent: (event: ServerEvent) => void;
  onStatus: (status: ConnectionStatus) => void;
}

const MAX_BACKOFF_MS = 30_000;

export class Gateway {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closedByUs = false;

  constructor(private readonly handlers: GatewayHandlers) {}

  connect(): void {
    this.closedByUs = false;
    this.clearTimers();

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}${GATEWAY_PATH}`;

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
      this.attempt = 0;
      this.handlers.onStatus('open');

      this.heartbeat = setInterval(() => {
        this.send({ t: 'heartbeat' });
      }, HEARTBEAT_INTERVAL_MS);
    });

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const parsed = decodeServerEvent(event.data);
      if (parsed) this.handlers.onEvent(parsed);
    });

    socket.addEventListener('close', (event) => {
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

  private scheduleReconnect(): void {
    this.handlers.onStatus('reconnecting');

    // Exponential backoff with jitter, capped. The jitter matters: without it
    // every client that dropped together comes back together.
    const base = Math.min(1000 * 2 ** this.attempt, MAX_BACKOFF_MS);
    const delay = base * (0.7 + Math.random() * 0.6);
    this.attempt += 1;

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimers(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  send(event: ClientEvent): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(encodeEvent(event));
  }

  close(): void {
    this.closedByUs = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
  }
}
