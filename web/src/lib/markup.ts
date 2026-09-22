/*
 * The four marks a message can carry, and how the composer puts them on.
 *
 *   **bold**   *italic*   ~~struck~~   `code`
 *
 * Applying a mark wraps the selection, or drops a pair of markers with the
 * caret between them when nothing is selected. Applying it again to text
 * that already has it takes it off, so the button is a toggle and not a
 * way to pile up stars.
 */

export type Marker = '**' | '*' | '~~' | '`';

export interface Draft {
  value: string;
  start: number;
  end: number;
}

export function wrapSelection(draft: Draft, marker: Marker): Draft {
  const { value, start, end } = draft;
  const before = value.slice(0, start);
  const chosen = value.slice(start, end);
  const after = value.slice(end);
  const n = marker.length;

  // Already wrapped, inside the selection: "**bold**" selected whole.
  if (chosen.length >= 2 * n && chosen.startsWith(marker) && chosen.endsWith(marker)) {
    const inner = chosen.slice(n, chosen.length - n);
    return { value: before + inner + after, start, end: start + inner.length };
  }
  // Already wrapped, just outside the selection: "bold" selected inside "**bold**".
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return { value: before.slice(0, -n) + chosen + after.slice(n), start: start - n, end: end - n };
  }
  return { value: before + marker + chosen + marker + after, start: start + n, end: end + n };
}

/** Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+E. Null for any other key. */
export function markerForKey(event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): Marker | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'b' && !event.shiftKey) return '**';
  if (key === 'i' && !event.shiftKey) return '*';
  if (key === 'x' && event.shiftKey) return '~~';
  if (key === 'e' && !event.shiftKey) return '`';
  return null;
}

/**
 * Put a mark on whatever is selected in a textarea. The new text goes out
 * through `setValue` (the box is controlled), and the selection is restored
 * once React has drawn it.
 */
export function applyMarkup(input: HTMLTextAreaElement | null, marker: Marker, setValue: (value: string) => void): void {
  if (!input || input.disabled) return;
  const next = wrapSelection(
    { value: input.value, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length },
    marker,
  );
  setValue(next.value);
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(next.start, next.end);
  });
}
