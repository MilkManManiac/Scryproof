/**
 * Bringing a message into view.
 *
 * This lives beside the store rather than in the timeline component because the
 * store's own `jumpToMessage` finishes by calling it, and a state module that
 * imports a component to scroll is a circle waiting to happen.
 */

/** Bring a message into view and flash it. Does nothing if that row is not drawn. */
export function jumpTo(messageId: string): void {
  const row = document.getElementById(`message-${messageId}`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('flash');
  // Reading a layout property makes the browser notice the class went away,
  // so adding it back restarts the animation.
  void row.offsetWidth;
  row.classList.add('flash');
}

/**
 * Scroll to a message that the render which will draw it has only just been
 * asked for. One frame for React to commit, one for the browser to lay the
 * rows out; the row does not exist to scroll to before both have happened.
 */
export function jumpToSoon(messageId: string): void {
  requestAnimationFrame(() => requestAnimationFrame(() => jumpTo(messageId)));
}
