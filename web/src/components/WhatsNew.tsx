/**
 * What changed, newest first. Opening it counts as reading it: the dot on
 * your name goes away and stays away until the next release.
 */

import { useEffect } from 'react';

import { CHANGELOG } from '../changelog';
import { markRead } from '../lib/whats-new';
import { Rich } from './MessageList';
import { Modal } from './Modal';

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function dateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return DATE.format(new Date(year!, month! - 1, day));
}

export function WhatsNew({ onClose }: { onClose: () => void }) {
  useEffect(() => markRead(), []);

  return (
    <Modal
      title="What's new"
      className="whats-new"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="release-list">
        {CHANGELOG.map((release, index) => (
          <section className="release" key={release.id}>
            <div className="release-when">
              {index === 0 || CHANGELOG[index - 1]!.date !== release.date ? dateLabel(release.date) : null}
            </div>
            <h3 className="release-title">{release.title}</h3>
            <ul className="release-notes">
              {release.notes.map((note) => (
                <li key={note}>
                  <Rich content={note} members={[]} emojis={[]} everyone={false} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
