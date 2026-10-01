/**
 * The pop-up cards in the corner (`lib/popups.ts`). Each fades after a few
 * seconds; resting the pointer on one holds it; clicking goes there.
 *
 * `PopupCardView` is also what the settings draw as their examples, so the
 * picture next to each choice is the real card and never goes out of date.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { notifyPrefs } from '../lib/notify';
import type { PopupDetail } from '../lib/notify';
import { popupText, popups } from '../lib/popups';
import type { PopupCard } from '../lib/popups';
import { Avatar } from './Avatar';

const SHOWN_MS = 6000;
const FADE_MS = 400;

/** A small picture of what the card is about, for the moments with no person's face. */
function MomentMark({ card }: { card: PopupCard }) {
  if (card.user) return <Avatar user={card.user} />;
  return (
    <span className="popup-mark" aria-hidden="true">
      {card.moment === 'event' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="8" />
        </svg>
      )}
    </span>
  );
}

/** One card, as it looks on screen. `still` is for the examples: no fading, no clicking. */
export function PopupCardView({
  card,
  detail,
  still,
  onClose,
}: {
  card: PopupCard;
  detail: PopupDetail;
  still?: boolean;
  onClose?: () => void;
}) {
  const { title, lines } = popupText(card, detail);
  const body = (
    <>
      <MomentMark card={card} />
      <span className="popup-text">
        <span className="popup-title">{title}</span>
        {lines.map((line, index) => (
          <span key={index} className={index === lines.length - 1 && detail === 'what' && card.what === line ? 'popup-what' : 'popup-where'}>
            {line}
          </span>
        ))}
      </span>
    </>
  );
  // `is-` because `message`, `mention` and `event` are already classes elsewhere.
  if (still) return <div className={`popup-card is-${card.moment} still`}>{body}</div>;
  return (
    <div className={`popup-card is-${card.moment}`}>
      <button type="button" className="popup-open" onClick={card.open}>
        {body}
      </button>
      <button type="button" className="popup-close" aria-label="Dismiss" title="Dismiss" onClick={onClose}>
        &#10005;
      </button>
    </div>
  );
}

function LiveCard({ card }: { card: PopupCard }) {
  const [leaving, setLeaving] = useState(false);
  const held = useRef(false);
  const detail = useSyncExternalStore(notifyPrefs.subscribe, () => notifyPrefs.get().popupDetail);

  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined;
    let gone: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      fade = setTimeout(() => {
        if (held.current) return start();
        setLeaving(true);
        gone = setTimeout(() => popups.dismiss(card.id), FADE_MS);
      }, SHOWN_MS);
    };
    start();
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
    // A card replaced by a newer one from the same place starts its clock again.
  }, [card]);

  return (
    <div
      className={leaving ? 'popup-slot leaving' : 'popup-slot'}
      onMouseEnter={() => {
        held.current = true;
        setLeaving(false);
      }}
      onMouseLeave={() => {
        held.current = false;
      }}
    >
      <PopupCardView
        card={{
          ...card,
          open: () => {
            popups.dismiss(card.id);
            card.open();
          },
        }}
        detail={detail}
        onClose={() => popups.dismiss(card.id)}
      />
    </div>
  );
}

export function PopupStack() {
  const cards = useSyncExternalStore(popups.subscribe, popups.get);
  if (cards.length === 0) return null;
  return (
    <div className="popup-stack" role="status" aria-live="polite">
      {cards.map((card) => (
        <LiveCard key={`${card.id}-${card.who}-${card.what ?? ''}`} card={card} />
      ))}
    </div>
  );
}
