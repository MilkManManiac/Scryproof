/**
 * The byte layouts an encrypted channel signs, shared so the server can check
 * a signature with exactly the bytes the client made it over. Checking keeps
 * garbage out of the table; it proves nothing to the members, who check again
 * themselves. The crypto is in `web/src/lib/channel-crypto.ts`.
 */

export const CHANNEL_EPOCH_CONTEXT = 'scryproof/channel/epoch/v1';
export const CHANNEL_MESSAGE_CONTEXT = 'scryproof/channel/message/v1';

/** Join several pieces with their lengths, so no two inputs can be confused. */
export function concatLabelled(...parts: (string | Uint8Array)[]): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = parts.map((part) => (typeof part === 'string' ? encoder.encode(part) : part));
  const total = encoded.reduce((sum, part) => sum + 4 + part.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let at = 0;
  for (const part of encoded) {
    view.setUint32(at, part.length, false);
    out.set(part, at + 4);
    at += 4 + part.length;
  }
  return out;
}

/** What the maker of an epoch's key signs: the channel, the epoch, who, and the commitment. */
export function epochSignedBytes(input: {
  channelId: string;
  epoch: number;
  creatorId: string;
  creatorDeviceId: string;
  commitment: Uint8Array;
}): Uint8Array {
  return concatLabelled(
    CHANNEL_EPOCH_CONTEXT,
    input.channelId,
    String(input.epoch),
    input.creatorId,
    input.creatorDeviceId,
    input.commitment,
  );
}

/**
 * What a sender's device signs for a message. Everything the server stores in
 * the clear about the message and could otherwise change is in here: which
 * channel, which key, who, which message it answers, and who it pings.
 */
export function messageSignedBytes(input: {
  channelId: string;
  epoch: number;
  authorId: string;
  senderDeviceId: string;
  replyToId: string | null;
  mentionIds: readonly string[];
  mentionsEveryone: boolean;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}): Uint8Array {
  return concatLabelled(
    CHANNEL_MESSAGE_CONTEXT,
    input.channelId,
    String(input.epoch),
    input.authorId,
    input.senderDeviceId,
    input.replyToId ?? '',
    [...input.mentionIds].sort().join(','),
    input.mentionsEveryone ? '1' : '0',
    input.nonce,
    input.ciphertext,
  );
}
