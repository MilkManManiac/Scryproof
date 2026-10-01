/**
 * Pop-ups: a small card in the corner of the app that fades after a few
 * seconds, like Discord's (Wes and a friend, 2026-10-01: "a little popup that
 * would fade after a while"). While the app is in the background the same
 * thing goes to the computer's own notifications instead, if that is switched
 * on, since a card nobody is looking at fades unseen.
 *
 * How much a pop-up says is one setting with three steps: who, who and where,
 * or who, where and the first line. A direct message never puts its words in
 * the computer's notification at any step: that text is end-to-end encrypted,
 * and the operating system keeps a history of what it showed. Inside the app
 * it may, because there it is already on this screen, decrypted, in memory.
 *
 * Nothing here is stored or sent. Cards live as long as they are on screen.
 */

import type { PublicUser } from '@scryproof/shared';

import { notices } from './notices';
import type { Moment, PopupDetail } from './notify';

export interface PopupCard {
  /** Same id twice is the same card: it replaces rather than stacks. */
  id: string;
  moment: Moment;
  /** Whoever it is about, or an event's title. */
  who: string;
  user?: PublicUser;
  /** "#general · The Table", "Hangout · The Table", a group's name. Null for a one-to-one DM. */
  where: string | null;
  /** The first line of what was said, where there is one and it may be shown. */
  what: string | null;
  /** A group DM's name, for "wrote in Friday Night". */
  group?: string | null;
  /** `what` came out of an end-to-end encrypted channel: for the app's own card only. */
  secret?: boolean;
  /** The channel or conversation it is about. Opening that place takes the card away. */
  place?: string;
  /** Where clicking goes. */
  open: () => void;
}

/** The headline for each moment, at the step that says only who. */
function headline(card: PopupCard): string {
  switch (card.moment) {
    case 'dm':
      return card.group ? `${card.who} wrote in a group` : `${card.who} sent you a message`;
    case 'mention':
      return `${card.who} mentioned you`;
    case 'message':
      return `${card.who} sent a message`;
    case 'joined':
      return `${card.who} joined a voice room`;
    case 'left':
      return `${card.who} left a voice room`;
    case 'live':
      return `${card.who} went live`;
    case 'ended':
      return `${card.who} stopped streaming`;
    case 'event':
      return `${card.who} starts soon`;
    case 'game':
      return `${card.who} finished today's game`;
  }
}

/**
 * The words a pop-up shows at a given step, for the card here, for the
 * computer's notification, and for the examples in settings. `system` is the
 * computer's own notification, which never carries a DM's words or an
 * encrypted channel's.
 */
export function popupText(card: PopupCard, detail: PopupDetail, system = false): { title: string; lines: string[] } {
  const title = headline(card);
  if (detail === 'who') return { title, lines: [] };
  const lines: string[] = [];
  const where = card.moment === 'dm' ? (card.group ?? null) : card.where;
  if (where) lines.push(where);
  if (detail === 'what' && card.what && !(system && (card.moment === 'dm' || card.secret))) lines.push(card.what);
  return { title, lines };
}

const MAX_CARDS = 3;
let cards: PopupCard[] = [];
const listeners = new Set<() => void>();
const tell = (): void => {
  for (const listener of listeners) listener();
};

export const popups = {
  get: (): readonly PopupCard[] => cards,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Newest at the bottom. A fourth pushes the oldest off. */
  show(card: PopupCard): void {
    cards = [...cards.filter((entry) => entry.id !== card.id), card].slice(-MAX_CARDS);
    tell();
  },
  dismiss(id: string): void {
    if (!cards.some((entry) => entry.id === id)) return;
    cards = cards.filter((entry) => entry.id !== id);
    tell();
  },
  /** You went to look: every card about that channel or conversation has done its job. */
  dismissPlace(place: string): void {
    if (!cards.some((entry) => entry.place === place)) return;
    cards = cards.filter((entry) => entry.place !== place);
    tell();
  },
};

/** The computer's own notification, if it was switched on and the browser allows it. */
function systemPopup(card: PopupCard, detail: PopupDetail): void {
  if (!notices.prefs().popups || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const { title, lines } = popupText(card, detail, true);
  try {
    // The tag lets a second message from the same place replace the first
    // rather than stack up beside it.
    const shown = new Notification(title, { body: lines.join('\n'), tag: card.id, silent: true });
    shown.onclick = () => {
      window.focus();
      card.open();
      shown.close();
    };
  } catch {
    // Some browsers only allow these from a service worker. The bell has it anyway.
  }
}

/** A card in the app while someone is in it, the computer's notification while they are not. */
export function present(card: PopupCard, detail: PopupDetail, focused: boolean): void {
  if (focused) popups.show(card);
  else systemPopup(card, detail);
}
