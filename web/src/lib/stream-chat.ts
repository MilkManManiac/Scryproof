/**
 * Comments on a screen or music share, for whoever is watching or listening.
 * Wes, 2026-10-06: "people watching/listening to a stream can post temp
 * comments". Kept in memory for the life of the stream and never saved: not
 * on the server, not in the browser.
 *
 * Each comment is sealed here with AES-GCM under a key derived from the
 * sender's own call media key, then sent as a LiveKit data message. LiveKit
 * encrypts data messages too in this room, but on receive it reports every
 * packet as unencrypted (livekit-client 2.22.3 reads the type off a field its
 * own sender never fills in), so a receiver cannot tell a sealed packet from
 * one the media server made up. Our own seal is what makes "Encrypted" true:
 * a comment is shown only if it opens under the key of the person the room
 * says sent it, in this call, in this epoch.
 */

import { fromBase64, toBase64 } from './voice-crypto';

export const STREAM_CHAT_TOPIC = 'scryproof.stream-chat.v1';
/** Characters in one comment. */
export const MAX_LENGTH = 300;
/** The counter under the input appears past this many characters. */
export const COUNT_FROM = 250;
/** Newest comments kept per stream; older ones fall off. */
export const KEEP = 50;
/** Sending: at most one comment a second, and five in ten seconds. */
export const SEND_GAP_MS = 1000;
export const BURST = 5;
export const WINDOW_MS = 10_000;
/**
 * Receiving, per sender: the same five, with room for the network bunching
 * two honest comments together. Extras are dropped without a word, so a
 * modified client cannot flood everyone else's strip.
 */
export const RECEIVE_GAP_MS = 500;
export const RECEIVE_WINDOW_MS = 9_000;

const MAX_COMMENT_BYTES = 2048;
const MAX_ENVELOPE_BYTES = 4096;
const SID = /^[A-Za-z0-9_-]{1,128}$/;
const ID = /^[0-9a-f]{16}$/;
const INFO = 'scryproof stream chat v1';

export interface StreamCommentMessage {
  /** The publication's track sid: one screen or music share. */
  stream: string;
  id: string;
  text: string;
}

export interface StreamComment {
  /** Sender and comment id, unique within one stream. */
  key: string;
  userId: string;
  text: string;
}

/**
 * A comment's words, the way everyone will see them: trimmed, newlines and
 * tabs turned into spaces, 1 to 300 characters. Null for anything else,
 * including any other control character or a direction override, which could
 * make a line read as something it is not.
 */
export function cleanComment(text: string): string | null {
  const flat = text.replace(/ *[\r\n\t][ \r\n\t]*/g, ' ').trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(flat)) return null;
  const length = [...flat].length;
  return length >= 1 && length <= MAX_LENGTH ? flat : null;
}

/** The comment inside a sealed packet, checked. The sender is never in here: the room says who sent it. */
export function readStreamComment(bytes: Uint8Array): StreamCommentMessage | null {
  if (bytes.byteLength > MAX_COMMENT_BYTES) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    if (keys.length !== 3 || !['stream', 'id', 'text'].every((key) => keys.includes(key))) return null;
    const { stream, id, text } = value;
    if (typeof stream !== 'string' || typeof id !== 'string' || typeof text !== 'string') return null;
    if (!SID.test(stream) || !ID.test(id)) return null;
    const clean = cleanComment(text);
    return clean === null ? null : { stream, id, text: clean };
  } catch {
    return null;
  }
}

export function newCommentId(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Who sealed it, where, and under which epoch's key. All three are bound into the seal. */
export interface SealContext {
  callId: string;
  sender: string;
  epoch: number;
}

const derived = new WeakMap<Uint8Array, Map<string, Promise<CryptoKey>>>();
function chatKey(mediaKey: Uint8Array, callId: string): Promise<CryptoKey> {
  let byCall = derived.get(mediaKey);
  if (!byCall) derived.set(mediaKey, (byCall = new Map()));
  let key = byCall.get(callId);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', mediaKey as BufferSource, 'HKDF', false, ['deriveKey'])
      .then((material) =>
        crypto.subtle.deriveKey(
          {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode(callId) as BufferSource,
            info: new TextEncoder().encode(INFO) as BufferSource,
          },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    byCall.set(callId, key);
  }
  return key;
}
const aadOf = (context: SealContext): BufferSource =>
  new TextEncoder().encode(JSON.stringify([context.callId, context.sender, context.epoch])) as BufferSource;

/** Seal a comment with the sender's own media key, ready for the data channel. */
export async function sealStreamComment(
  mediaKey: Uint8Array,
  context: SealContext,
  message: StreamCommentMessage,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aadOf(context) },
    await chatKey(mediaKey, context.callId),
    new TextEncoder().encode(JSON.stringify(message)) as BufferSource,
  );
  return new TextEncoder().encode(
    JSON.stringify({ epoch: context.epoch, iv: toBase64(iv), box: toBase64(new Uint8Array(box)) }),
  );
}

/**
 * Open a sealed comment from `context.sender`, whose media key for this epoch
 * is `mediaKey`. Null when it is malformed, from another epoch, or does not
 * open: the wrong key, a relabelled sender, a changed byte.
 */
export async function openStreamComment(
  bytes: Uint8Array,
  mediaKey: Uint8Array | null,
  context: SealContext,
): Promise<StreamCommentMessage | null> {
  if (!mediaKey || bytes.byteLength > MAX_ENVELOPE_BYTES) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || value.epoch !== context.epoch || typeof value.iv !== 'string' || typeof value.box !== 'string')
      return null;
    const iv = fromBase64(value.iv);
    if (iv.byteLength !== 12) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aadOf(context) },
      await chatKey(mediaKey, context.callId),
      fromBase64(value.box) as BufferSource,
    );
    return readStreamComment(new Uint8Array(plain));
  } catch {
    return null;
  }
}

/** How often one person may comment. One per sender on receive, one for ourselves on send. */
export class CommentRate {
  private readonly times = new Map<string, number[]>();

  constructor(
    private readonly gapMs = SEND_GAP_MS,
    private readonly windowMs = WINDOW_MS,
    private readonly burst = BURST,
  ) {}

  /** Milliseconds until `who` may comment again. 0 is now. */
  wait(who: string, now = Date.now()): number {
    const recent = (this.times.get(who) ?? []).filter((at) => now - at < this.windowMs);
    const last = recent.at(-1);
    const gap = last === undefined ? 0 : this.gapMs - (now - last);
    const full = recent.length >= this.burst ? this.windowMs - (now - recent[recent.length - this.burst]!) : 0;
    return Math.max(0, gap, full);
  }

  /** Count a comment if it is allowed now. False means drop it. */
  take(who: string, now = Date.now()): boolean {
    if (this.wait(who, now) > 0) return false;
    const recent = (this.times.get(who) ?? []).filter((at) => now - at < this.windowMs);
    this.times.set(who, [...recent, now].slice(-this.burst));
    return true;
  }

  forget(who: string): void {
    this.times.delete(who);
  }
  clear(): void {
    this.times.clear();
  }
}

/** Comments by stream, newest last. Gone when the stream ends or the call does. */
export class StreamComments {
  private readonly streams = new Map<string, { list: StreamComment[]; seen: Set<string> }>();

  /** False for a comment id this sender already used on this stream. */
  add(stream: string, userId: string, id: string, text: string): boolean {
    let entry = this.streams.get(stream);
    if (!entry) this.streams.set(stream, (entry = { list: [], seen: new Set() }));
    const key = `${userId}:${id}`;
    if (entry.seen.has(key)) return false;
    entry.seen.add(key);
    // A new array each time, so a screen drawing the old one sees the change.
    entry.list = [...entry.list, { key, userId, text }].slice(-KEEP);
    return true;
  }

  list(stream: string): StreamComment[] {
    return this.streams.get(stream)?.list ?? [];
  }

  /** The stream ended. True if it had anything. */
  end(stream: string): boolean {
    return this.streams.delete(stream);
  }

  clear(): void {
    this.streams.clear();
  }

  all(): Record<string, StreamComment[]> {
    const out: Record<string, StreamComment[]> = {};
    for (const [stream, entry] of this.streams) if (entry.list.length > 0) out[stream] = entry.list;
    return out;
  }
}
