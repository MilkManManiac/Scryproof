/**
 * Asking for a character to cross the room.
 *
 * Anyone can ask (`play('tang')`): the message list when a spawn message
 * arrives live, the DM store for the same, a history line that was clicked.
 * One listener answers: `components/Stage.tsx`, mounted once in the shell.
 * A request before it mounts, or under "reduce motion", is dropped; the
 * message line is still there to click.
 */

type Listener = (characterId: string) => void;

const listeners = new Set<Listener>();

export function play(characterId: string): void {
  for (const listener of listeners) listener(characterId);
}

export function onPlay(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// For the screenshot script in dev: `window.__play('tang')`.
if (import.meta.env.DEV) (window as unknown as { __play: typeof play }).__play = play;
