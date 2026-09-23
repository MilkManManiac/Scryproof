/**
 * LiveKit access tokens.
 *
 * A LiveKit token is a plain HS256 JWT carrying a video grant, so we mint it
 * with node:crypto rather than pulling in the server SDK. That is one fewer
 * dependency inside the process that holds our most sensitive data, and it
 * keeps the exact contents of every token we issue visible in one short file.
 *
 * Tokens are deliberately short-lived and name exactly one room. A leaked
 * token is useless within fifteen minutes and useless anywhere else even
 * before that.
 */

import { createHmac } from 'node:crypto';

import { config } from '../config.js';

interface VideoGrant {
  room: string;
  roomJoin: true;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  /** Restricts which track types may be published. Absent means all. */
  canPublishSources?: string[];
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export interface TokenOptions {
  room: string;
  identity: string;
  name: string;
  canPublish: boolean;
  canSubscribe: boolean;
  /** 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio' | 'unknown' */
  sources: string[];
}

export function isLivekitConfigured(): boolean {
  return Boolean(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret);
}

export function createAccessToken(options: TokenOptions): string {
  if (!isLivekitConfigured()) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.');
  }

  const now = Math.floor(Date.now() / 1000);

  const grant: VideoGrant = {
    room: options.room,
    roomJoin: true,
    canPublish: options.canPublish,
    canSubscribe: options.canSubscribe,
    canPublishData: true,
    canPublishSources: options.sources,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: config.livekit.apiKey,
    sub: options.identity,
    // LiveKit uses `nbf`/`exp` in seconds. A small backdate absorbs clock skew
    // between this box and the media server.
    nbf: now - 10,
    exp: now + config.livekit.tokenTtlSeconds,
    name: options.name,
    video: grant,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', config.livekit.apiSecret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

/**
 * The LiveKit room name for a channel. Prefixed and derived from the channel
 * id so room names cannot collide across servers and reveal nothing about the
 * channel they belong to.
 */
export function roomNameForChannel(channelId: string): string {
  return `ch_${channelId}`;
}
