/**
 * One HTTP byte range (`Range: bytes=start-end`), the only kind browsers send
 * for <video>. Without it a video plays the first chunk and stalls: the player
 * asks for "bytes=N-" to keep going and gets the file from byte 0 again.
 *
 * Returns the inclusive [start, end] to send, null to send the whole file
 * (no header, or one we don't serve), or 'unsatisfiable' for a 416.
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'unsatisfiable' {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // "bytes=-500": the last 500 bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
