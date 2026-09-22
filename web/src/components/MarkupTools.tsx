/*
 * Four small buttons under the composer: bold, italic, strike, code. Each
 * one wraps the selection in the box above. The keys do the same thing
 * (Ctrl+B, Ctrl+I, Ctrl+Shift+X, Ctrl+E), and the buttons are here so
 * nobody has to know that.
 */

import type { RefObject } from 'react';

import { applyMarkup, type Marker } from '../lib/markup';

const TOOLS: { marker: Marker; label: string; title: string; className: string }[] = [
  { marker: '**', label: 'B', title: 'Bold (Ctrl+B)', className: 'markup-tool bold' },
  { marker: '*', label: 'I', title: 'Italic (Ctrl+I)', className: 'markup-tool italic' },
  { marker: '~~', label: 'S', title: 'Strike through (Ctrl+Shift+X)', className: 'markup-tool strike' },
  { marker: '`', label: '<>', title: 'Code (Ctrl+E)', className: 'markup-tool code' },
];

export function MarkupTools({
  input,
  setValue,
  disabled,
}: {
  input: RefObject<HTMLTextAreaElement | null>;
  setValue: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <span className="markup-tools" aria-label="Text style">
      {TOOLS.map((tool) => (
        <button
          key={tool.marker}
          type="button"
          className={tool.className}
          title={tool.title}
          disabled={disabled}
          // Mouse down would take focus from the box and lose the selection.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyMarkup(input.current, tool.marker, setValue)}
        >
          {tool.label}
        </button>
      ))}
    </span>
  );
}
