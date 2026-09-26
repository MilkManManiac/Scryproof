/**
 * A dialog. Escape closes, the backdrop closes, and focus lands on the first
 * field so a keyboard user is not hunting for it.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({
  title,
  children,
  footer,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  /** For a dialog that needs a different width than the default. */
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Once, on opening. Callers pass `onClose` as a fresh arrow on every render,
  // and the call panel re-renders about once a second with its connection
  // numbers; keyed on `onClose`, this took focus back to the first field each
  // time, which shut any open dropdown and scrolled the dialog to the top.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    window.addEventListener('keydown', onKey);

    const first = box.current?.querySelector<HTMLElement>('input, textarea');
    first?.focus();

    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className={className ? `modal ${className}` : 'modal'}
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}
