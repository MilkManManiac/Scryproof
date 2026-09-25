/**
 * Reading how long an Ogg file is, without decoding any audio.
 *
 * A soundboard clip cut in the browser is uploaded as Ogg Opus. Ogg stamps
 * every page with how many samples have played by the end of it (the granule
 * position), so the length is the last page's stamp, less the few samples the
 * format says to skip at the start. That is a walk over page headers, which
 * the server can afford where it cannot afford an audio decoder. Ogg Vorbis
 * works the same way with its own sample rate.
 *
 * The writer is here too (`muxOggOpus`): the browser's encoder (WebCodecs
 * `AudioEncoder`) hands back bare Opus packets, and this wraps them in the
 * pages RFC 7845 asks for: an identification page, a comment page, then the
 * audio. The last page's position says where the sound really ends, so the
 * padding an encoder adds to finish its last frame is cut off on playback.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32: polynomial 0x04c11db7, no reflection, no final XOR. */
export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) crc = ((crc << 8) ^ (CRC_TABLE[((crc >>> 24) ^ byte) & 0xff] ?? 0)) >>> 0;
  return crc;
}

const matches = (bytes: Uint8Array, at: number, text: string): boolean => {
  if (at + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) if (bytes[at + index] !== text.charCodeAt(index)) return false;
  return true;
};

/**
 * Seconds of audio in an Ogg Opus or Ogg Vorbis file, or null if it is not a
 * well-formed one: a broken page, a bad checksum, more than one stream, or a
 * codec this does not know. Null means "cannot tell", which the server treats
 * as a refusal.
 */
export function oggSeconds(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  let serial: number | null = null;
  let rate = 0;
  let skip = 0;
  let last = -1;
  let first = true;
  while (at < bytes.length) {
    if (!matches(bytes, at, 'OggS') || at + 27 > bytes.length) return null;
    const segments = bytes[at + 26] ?? 0;
    const headerLength = 27 + segments;
    if (at + headerLength > bytes.length) return null;
    let bodyLength = 0;
    for (let index = 0; index < segments; index += 1) bodyLength += bytes[at + 27 + index] ?? 0;
    const end = at + headerLength + bodyLength;
    if (end > bytes.length) return null;

    // The checksum is computed with its own four bytes as zero, on a copy: a
    // Node Buffer's slice is a view, and zeroing it would damage the file.
    const page = new Uint8Array(bytes.subarray(at, end));
    const stated = view.getUint32(at + 22, true);
    page.fill(0, 22, 26);
    if (oggCrc(page) !== stated) return null;

    const pageSerial = view.getUint32(at + 14, true);
    if (serial === null) serial = pageSerial;
    else if (pageSerial !== serial) return null;

    const body = at + headerLength;
    if (first) {
      if (matches(bytes, body, 'OpusHead') && bodyLength >= 19) {
        rate = 48000;
        skip = view.getUint16(body + 10, true);
      } else if (matches(bytes, body, '\x01vorbis') && bodyLength >= 16) {
        rate = view.getUint32(body + 12, true);
      } else {
        return null;
      }
      first = false;
    }

    const low = view.getUint32(at + 6, true);
    const high = view.getUint32(at + 10, true);
    // All ones means no packet finishes on this page.
    if (!(low === 0xffffffff && high === 0xffffffff)) {
      if (high > 0x1fffff) return null;
      last = high * 2 ** 32 + low;
    }
    at = end;
  }
  if (first || rate <= 0 || last < 0) return null;
  return Math.max(0, last - skip) / rate;
}

/* --------------------------------- writing --------------------------------- */

export interface OpusStream {
  channels: number;
  /** Samples at 48 kHz a player drops from the start: the encoder's lookahead. */
  preSkip: number;
  /** The rate the audio was recorded at, for information only. Opus always decodes at 48 kHz. */
  inputRate: number;
  packets: { data: Uint8Array; samples: number }[];
  /** How many samples at 48 kHz of real sound went in, so the end can be trimmed exactly. */
  totalSamples: number;
}

/** The most packets on one page. Small pages cost a few bytes each; big ones nothing. */
const PACKETS_PER_PAGE = 50;
const SERIAL = 0x53637279; // "Scry"

function page(body: Uint8Array[], flags: number, granule: number, sequence: number): Uint8Array {
  const lacing: number[] = [];
  for (const packet of body) {
    let left = packet.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  if (lacing.length > 255) throw new Error('Too many segments for one Ogg page.');
  const bodyLength = body.reduce((sum, packet) => sum + packet.length, 0);
  const out = new Uint8Array(27 + lacing.length + bodyLength);
  const view = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53]); // OggS
  out[4] = 0;
  out[5] = flags;
  view.setUint32(6, granule % 2 ** 32, true);
  view.setUint32(10, Math.floor(granule / 2 ** 32), true);
  view.setUint32(14, SERIAL, true);
  view.setUint32(18, sequence, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const packet of body) {
    out.set(packet, at);
    at += packet.length;
  }
  view.setUint32(22, oggCrc(out), true);
  return out;
}

function opusHead(stream: OpusStream): Uint8Array {
  const out = new Uint8Array(19);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode('OpusHead'));
  out[8] = 1;
  out[9] = stream.channels;
  view.setUint16(10, stream.preSkip, true);
  view.setUint32(12, stream.inputRate, true);
  view.setInt16(16, 0, true);
  out[18] = 0; // one stream, mono or stereo
  return out;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('Scryproof');
  const out = new Uint8Array(8 + 4 + vendor.length + 4);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode('OpusTags'));
  view.setUint32(8, vendor.length, true);
  out.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true);
  return out;
}

export function muxOggOpus(stream: OpusStream): Uint8Array<ArrayBuffer> {
  if (stream.channels < 1 || stream.channels > 2) throw new Error('Only mono or stereo.');
  if (stream.packets.length === 0) throw new Error('No sound to write.');
  const pages: Uint8Array[] = [page([opusHead(stream)], 0x02, 0, 0), page([opusTags()], 0, 0, 1)];
  const coded = stream.packets.reduce((sum, packet) => sum + packet.samples, 0);
  // Never past what the packets hold: a position beyond the last sample is not valid Ogg.
  const end = Math.min(stream.preSkip + stream.totalSamples, coded);
  // Pages of up to 50 packets, fewer when big packets would need more than the 255 segments a page holds.
  const groups: (typeof stream.packets)[] = [[]];
  let segments = 0;
  for (const packet of stream.packets) {
    const needs = Math.floor(packet.data.length / 255) + 1;
    const current = groups[groups.length - 1] ?? [];
    if (current.length > 0 && (current.length >= PACKETS_PER_PAGE || segments + needs > 255)) {
      groups.push([packet]);
      segments = needs;
    } else {
      current.push(packet);
      segments += needs;
    }
  }
  let played = 0;
  groups.forEach((group, index) => {
    played += group.reduce((sum, packet) => sum + packet.samples, 0);
    const last = index === groups.length - 1;
    pages.push(
      page(
        group.map((packet) => packet.data),
        last ? 0x04 : 0,
        last ? end : Math.min(played, end),
        pages.length,
      ),
    );
  });
  const out = new Uint8Array(pages.reduce((sum, one) => sum + one.length, 0));
  let at = 0;
  for (const one of pages) {
    out.set(one, at);
    at += one.length;
  }
  return out;
}
