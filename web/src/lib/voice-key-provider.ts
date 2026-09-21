/**
 * The bridge between our key agreement and LiveKit's media encryption.
 *
 * LiveKit encrypts and decrypts media frames, and it asks something else for
 * the keys. Its own `ExternalE2EEKeyProvider` is built for one passphrase
 * shared by everybody, which is not what we do: each participant has their own
 * media key, so what LiveKit needs is a key *per participant identity*. That
 * is `sharedKey: false` plus `onSetEncryptionKey(key, identity, index)`,
 * both of which `BaseKeyProvider` already has.
 *
 * Nothing here decides anything. Every key arriving at this class was either
 * invented on this device or unwrapped from a blob only this device could
 * open — see `voice-crypto.ts`. This file only hands them over.
 *
 * Verified against a real LiveKit server (1.13.6, run locally) by
 * `npm run test:voice`: two browsers, real microphones' worth of fake audio,
 * and a check that a listener holding the wrong key hears nothing.
 *
 * GAMEPLAN.md section 1b, finding 1.
 */

import { BaseKeyProvider } from 'livekit-client';

/**
 * LiveKit identifies participants by the `identity` in their token, which we
 * mint as the opaque user id and nothing else. Two devices belonging to one
 * person would collide here; that is a real limit of the media layer and the
 * reason a call is one device per person for now.
 */
export class ScryproofKeyProvider extends BaseKeyProvider {
  constructor() {
    super({
      // The whole point: every participant gets their own key.
      sharedKey: false,
      // Ratcheting is LiveKit deriving a successor key from the current one.
      // We rotate on membership changes with keys generated fresh each time,
      // which is stronger, and two rotation schemes running at once is two
      // ways to be out of step.
      ratchetWindowSize: 0,
      keySize: 256,
    });
  }

  /**
   * Hand LiveKit one participant's media key.
   *
   * It goes in as HKDF key *material*, not as a finished AES key. LiveKit's
   * worker always derives the frame key itself (`deriveKeys` in its e2ee
   * worker) and throws "algorithm AES-GCM is currently unsupported" for
   * anything that is not HKDF or PBKDF2. An AES-GCM import here compiles, type
   * checks, and fails on the first frame, which is what this file did until it
   * was run against a real server.
   *
   * Every participant derives the same frame key from the same 32 bytes, so
   * nothing is lost: the secret is still ours, still per sender, still fresh
   * each epoch. Non-extractable, because nothing needs to read it back out.
   */
  async setParticipantKey(identity: string, mediaKey: Uint8Array, keyIndex = 0): Promise<void> {
    const material = await crypto.subtle.importKey('raw', mediaKey as BufferSource, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    this.onSetEncryptionKey(material, identity, keyIndex);
  }

  /** Our own key, used to encrypt what this device publishes. */
  setOwnKey(identity: string, mediaKey: Uint8Array, keyIndex = 0): Promise<void> {
    return this.setParticipantKey(identity, mediaKey, keyIndex);
  }
}

/**
 * Firefox is refused from voice rather than having encryption switched off for
 * it. livekit/client-sdk-js#2103: a Firefox publisher's encrypted video cannot
 * be decrypted by Chromium receivers ("missing key at index 241"), still open
 * with no fix. Non-negotiable 2 says E2EE is never "temporarily" disabled, so
 * the answer is a clear explanation, not a downgrade.
 */
export function voiceSupport(userAgent = navigator.userAgent): { ok: boolean; reason?: string } {
  if (/firefox/i.test(userAgent)) {
    return {
      ok: false,
      reason:
        'Firefox cannot send encrypted video that other browsers can read — a bug in the ' +
        'media library, still open. Voice here is encrypted end to end and never turned off ' +
        'to work around it, so use Chrome, Edge or the desktop app for calls.',
    };
  }
  if (typeof RTCRtpSender === 'undefined' || !('createEncodedStreams' in RTCRtpSender.prototype)) {
    return {
      ok: false,
      reason: 'This browser cannot encrypt media frames, so it cannot join an encrypted call.',
    };
  }
  return { ok: true };
}
