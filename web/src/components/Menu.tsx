/**
 * A small popover of choices, anchored under whatever opened it.
 *
 * Exists because two buttons now do more than one thing, and a button that
 * does two things without saying so is worse than two buttons. Dismissal is
 * the whole job: a click anywhere else, or Escape, and it is gone.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Menu({
  children,
  onClose,
  align = 'left',
  portal = false,
}: {
  children: ReactNode;
  onClose: () => void;
  align?: 'left' | 'right';
  /** Escape a scrolling parent's clipping, while staying anchored to it. */
  portal?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!portal || !box.current || !anchor.current?.parentElement) return;
    const menu = box.current;
    const place = () => {
      const rect = anchor.current!.parentElement!.getBoundingClientRect();
      const margin = 8;
      menu.style.maxWidth = `${Math.min(212, window.innerWidth - margin * 2)}px`;
      menu.style.maxHeight = `${window.innerHeight - margin * 2}px`;
      const left = align === 'right' ? rect.right - menu.offsetWidth : rect.left;
      menu.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - menu.offsetWidth - margin))}px`;
      menu.style.top = `${Math.max(margin, Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - margin))}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [portal, align]);

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

  const menu = (
    <div className={portal ? 'menu menu-portal' : align === 'right' ? 'menu align-right' : 'menu'} ref={box} role="menu">
      {children}
    </div>
  );
  return portal ? <><span ref={anchor} hidden />{createPortal(menu, document.getElementById('root') ?? document.body)}</> : menu;
}

export function MenuItem({
  children,
  note,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  note?: string;
  onClick: () => void;
  /** Red: something that cannot be undone. */
  danger?: boolean;
}) {
  return (
    <button type="button" className={danger ? 'menu-item danger' : 'menu-item'} role="menuitem" onClick={onClick}>
      <span>{children}</span>
      {note ? <span className="menu-item-note">{note}</span> : null}
    </button>
  );
}
