/**
 * The list of keyboard shortcuts, kept next to nothing else.
 *
 * A shortcut nobody can find is a shortcut nobody has. This is the only place
 * they are written down, so when one changes there is one thing to change.
 */

import { Modal } from './Modal';

const MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');
const CTRL = MAC ? '⌘' : 'Ctrl';

const SHORTCUTS: [keys: string[], what: string][] = [
  [[CTRL, 'K'], 'Go to a channel'],
  [[CTRL, 'Shift', 'K'], 'This list'],
  [['Alt', '↑'], 'Channel above'],
  [['Alt', '↓'], 'Channel below'],
  [['Alt', 'Shift', '↑'], 'Server above'],
  [['Alt', 'Shift', '↓'], 'Server below'],
  [['Esc'], 'Mark this channel read'],
  [['↑'], 'Edit your last message, with the box empty'],
  [['Shift', 'Enter'], 'A new line instead of sending'],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="shortcut-list">
        {SHORTCUTS.map(([keys, what]) => (
          <div className="shortcut-row" key={what}>
            <span className="shortcut-keys">
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <span className="shortcut-what">{what}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
