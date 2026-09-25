/**
 * What changed, newest first. Opening it counts as reading it: the dot on
 * your name goes away and stays away until the next release.
 *
 * `NewsCard` is the way in that people actually see (Wes, 2026-09-25: "people
 * don't even know it exists"). A card above your name with the newest title,
 * until you open it or close it. Still no pop-up and no sound.
 */

import { useEffect } from 'react';

import { CHANGELOG, LATEST_RELEASE } from '../changelog';
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

/** Above your name after an update you have not read: its title, and a way in. */
export function NewsCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="news-card">
      <button type="button" className="news-card-open" onClick={onOpen}>
        <span className="news-card-kicker">New in Scryproof</span>
        <span className="news-card-title">{LATEST_RELEASE.title}</span>
        <span className="news-card-more">See what changed</span>
      </button>
      <button type="button" className="news-card-close" title="Hide until the next update" aria-label="Hide" onClick={() => markRead()}>
        &#10005;
      </button>
    </div>
  );
}
