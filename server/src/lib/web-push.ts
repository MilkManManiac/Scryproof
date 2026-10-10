/**
 * Sending one Web Push ping, with nothing in it.
 *
 * Web Push is how a phone hears about something while the app is asleep: our
 * server asks the phone maker's relay (Apple, Google, Mozilla, Microsoft) to
 * wake the device, and the device's service worker does the rest. The relay is
 * a third party in the path, which GAMEPLAN 1b allows on one condition: the
 * ping says "something happened" and nothing else, ever. So there is no body
 * at all. What the notification says is fetched afterwards by the phone, from
 * us, over its own connection (`services/push.ts`, `web/public/sw.js`).
 *
 * An empty ping needs no payload encryption, only VAPID: a short ES256 token
 * that tells the relay the ping comes from the same server the device
 * subscribed to. Written against node:crypto rather than a library, because
 * it is thirty lines and a library here would be one more thing that could
 * phone home (GAMEPLAN 1b, finding 5).
 */

import { createHash, createPrivateKey, sign } from 'node:crypto';

export interface VapidKeys {
  /** The uncompressed P-256 point, base64url: what the browser subscribes with. */
  publicKey: string;
  /** The private scalar `d`, base64url. */
  privateKey: string;
  /** A mailto: or https: address the relay can complain to. */
  subject: string;
}

/**
 * Where a subscription may point. The endpoint comes from the browser, which
 * means from whoever is signed in, and the server will make a request to it:
 * without this list it would be a way to make the box call any address.
 */
const RELAYS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isRelayEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return RELAYS.some((pattern) => pattern.test(url.hostname));
}

export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      // Relays refuse anything over 24 hours.
      exp: Math.floor(now / 1000) + 12 * 60 * 60,
      sub: keys.subject,
    }),
  ).toString('base64url');

  const point = Buffer.from(keys.publicKey, 'base64url');
  const key = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33, 65).toString('base64url'),
    },
    format: 'jwk',
  });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}

/**
 * The relay keeps only the newest undelivered ping per topic, so a phone that
 * was off while one conversation got ten messages wakes once for it. Hashed,
 * because a topic may only be 32 URL-safe characters, and because the relay
 * has no business seeing our ids. The subscription id goes into the hash so
 * two of one person's phones never share a topic: coalescing is per device
 * anyway, and a shared topic would let the relay pair the devices up.
 */
export function topicFor(conversationId: string, subscriptionId: string): string {
  return createHash('sha256').update(`${conversationId}
${subscriptionId}`).digest('base64url').slice(0, 32);
}

export type PingResult = 'sent' | 'gone' | 'failed';

/** Why the last ping failed, for the log. Never includes the endpoint's path, which identifies a device. */
let lastFailure = '';
export const lastPingFailure = (): string => lastFailure;

export async function sendPing(endpoint: string, keys: VapidKeys, topic: string): Promise<PingResult> {
  if (!isRelayEndpoint(endpoint)) return 'gone';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(endpoint, keys),
        // A message from yesterday is not worth a buzz; a day covers a phone
        // left off overnight.
        TTL: String(24 * 60 * 60),
        Urgency: 'high',
        Topic: topic,
        'Content-Length': '0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    // 404 and 410: the person turned it off, or the browser forgot the
    // subscription. Either way it will never work again.
    if (response.status === 404 || response.status === 410) {
      lastFailure = `${new URL(endpoint).hostname} answered ${response.status}: ${(await response.text()).slice(0, 200)}`;
      return 'gone';
    }
    if (response.ok) return 'sent';
    lastFailure = `${new URL(endpoint).hostname} answered ${response.status}: ${(await response.text()).slice(0, 200)}`;
    return 'failed';
  } catch (error) {
    lastFailure = `${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : String(error)}`;
    return 'failed';
  }
}
