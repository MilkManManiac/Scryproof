/**
 * A small popover of choices, anchored under whatever opened it.
 *
 * Exists because two buttons now do more than one thing, and a button that
 * does two things without saying so is worse than two buttons. Dismissal is
 * the whole job: a click anywhere else, or Escape, and it is gone.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export function Menu({
  children,
  onClose,
  align = 'left',
}: {
  children: ReactNode;
  onClose: () => void;
  align?: 'left' | 'right';
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // On the next tick, or the click that opened this would close it again.
    const timer = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className={align === 'right' ? 'menu align-right' : 'menu'} ref={box} role="menu">
      {children}
    </div>
  );
}

export function MenuItem({
  children,
  note,
  onClick,
}: {
  children: ReactNode;
  note?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="menu-item" role="menuitem" onClick={onClick}>
      <span>{children}</span>
      {note ? <span className="menu-item-note">{note}</span> : null}
    </button>
  );
}
