/** Ephemeral call presence, never saved: who says they are tuned into each music publication. */
export const MUSIC_AUDIENCE_TOPIC = 'scryproof.music-listeners.v1';
export const MUSIC_AUDIENCE_REFRESH_MS = 10_000;
export const MUSIC_AUDIENCE_TTL_MS = 35_000;
const MAX_SHARES = 32;
export interface MusicAudienceMessage {
  listening: string[];
  request?: boolean;
}

export function readMusicAudience(bytes: Uint8Array): MusicAudienceMessage | null {
  if (bytes.byteLength > 4096) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || !Array.isArray(value.listening) || value.listening.length > MAX_SHARES) return null;
    if (value.request !== undefined && typeof value.request !== 'boolean') return null;
    if (!value.listening.every((sid: unknown) => typeof sid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sid)))
      return null;
    return { listening: [...new Set<string>(value.listening)], request: value.request === true };
  } catch {
    return null;
  }
}

export class MusicAudience {
  private readonly peers = new Map<string, { listening: Set<string>; seen: number }>();

  /** The caller supplies the transport-authenticated sender, never an id from the payload. */
  update(userId: string, listening: string[], now = Date.now()): void {
    this.peers.set(userId, { listening: new Set(listening), seen: now });
  }

  listeners(sid: string, present: Set<string>, now = Date.now()): string[] {
    const listeners: string[] = [];
    for (const [id, peer] of this.peers) {
      if (!present.has(id) || now - peer.seen >= MUSIC_AUDIENCE_TTL_MS) {
        this.peers.delete(id);
      } else if (peer.listening.has(sid)) listeners.push(id);
    }
    return listeners.sort();
  }

  remove(userId: string): void {
    this.peers.delete(userId);
  }
  end(sid: string): void {
    for (const peer of this.peers.values()) peer.listening.delete(sid);
  }
  clear(): void {
    this.peers.clear();
  }
}
