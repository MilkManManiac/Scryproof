/**
 * A YouTube link, drawn as a card: thumbnail, title, who posted it. Pressing
 * it opens the video on YouTube in a new tab. Nothing from Google loads in
 * this page: the picture and the words come from this box, which fetched
 * them once (`server/src/routes/link-preview.ts`).
 *
 * `ask` is false in an encrypted channel or a DM: there the card waits for
 * the reader to press "Show preview", because asking this box for the card
 * tells it which video a sealed message pointed at.
 */

import { useEffect, useState } from 'react';

import { api } from '../lib/api';

interface Card {
  title: string;
  author: string;
  thumbnail: string;
}

/** Cards already fetched this tab, so scrolling back does not ask twice. */
const cards = new Map<string, Promise<Card | null>>();

function cardFor(id: string): Promise<Card | null> {
  const existing = cards.get(id);
  if (existing) return existing;
  const made = api.linkPreview.youtube(id).catch(() => null);
  cards.set(id, made);
  return made;
}

export function YouTubeCard({ id, href, ask }: { id: string; href: string; ask: boolean }) {
  const [wanted, setWanted] = useState(ask);
  const [card, setCard] = useState<Card | null | undefined>(undefined);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void cardFor(id).then((made) => !cancelled && setCard(made));
    return () => {
      cancelled = true;
    };
  }, [id, wanted]);

  if (!wanted) {
    return (
      <button type="button" className="link-card link-card-ask" onClick={() => setWanted(true)}>
        <span className="link-card-site">YouTube</span>
        <span className="link-card-title">Show preview</span>
        <span className="link-card-note">Asks this server for the title and thumbnail.</span>
      </button>
    );
  }
  // Fetching, or YouTube had nothing: the plain link above still works.
  if (!card) return null;

  return (
    <a className="link-card" href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      <img className="link-card-thumb" src={card.thumbnail} alt="" loading="lazy" />
      <span className="link-card-text">
        <span className="link-card-site">YouTube</span>
        <span className="link-card-title">{card.title}</span>
        {card.author ? <span className="link-card-note">{card.author}</span> : null}
      </span>
    </a>
  );
}
