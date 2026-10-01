/**
 * Short tours for big updates (Wes, 2026-10-01: instead of only listing what
 * changed, "show them what's new and how to get there and how it works").
 *
 * A release that adds something a person has to find gets a few walkthrough
 * cards here, keyed by its changelog id. Its What's new card then says "Show
 * me". Small releases get none and stay a list. Same cards as the first-run
 * walkthrough, skippable the same ways, and clicking off closes it.
 */

import { useSyncExternalStore } from 'react';

import { markRead } from '../lib/whats-new';
import type { PopupCard } from '../lib/popups';
import { PopupCardView } from './PopupStack';
import { Walkthrough, type Step } from './Walkthrough';

const EXAMPLE: PopupCard = {
  id: 'tour-example',
  moment: 'mention',
  who: 'lamp',
  user: { id: 'tour-example', username: 'lamp', displayName: 'lamp', accent: '#7c6cf0', avatarUrl: null, statusText: null },
  where: '#general · The Table',
  what: null,
  open: () => undefined,
};

export const TOURS: Record<string, readonly Step[]> = {
  '2026-10-01-notifications': [
    {
      title: 'Where that sound came from',
      target: '.rail-bell',
      body: (
        <>
          <p>
            The bell now keeps everything said while you were looking somewhere else: a line per channel, who was
            talking and how many messages, with any mention of you picked out.
          </p>
          <p>The sentence at the top says what is waiting. Click a line to go straight there.</p>
        </>
      ),
    },
    {
      title: 'Counts, and one channel at a time',
      target: '.sidebar-scroll',
      body: (
        <>
          <p>
            A grey number beside a channel is how many messages you have not read there. Red is still mentions of you.
          </p>
          <p>
            Right-click a channel or a server (on a phone, press and hold) to pick <b>Every message</b>,{' '}
            <b>Mentions only</b> or <b>Mute</b>. A channel you watch gets a small eye.
          </p>
        </>
      ),
    },
    {
      title: 'Pop-ups',
      body: (
        <>
          <p>When something is for you, a card like this shows in the corner and fades after a few seconds:</p>
          <div className="tour-example">
            <PopupCardView card={EXAMPLE} detail="where" still />
          </div>
          <p>Click it to go there. You choose how much it says: just who, who and where, or the first line too.</p>
        </>
      ),
    },
    {
      title: 'Your choices',
      target: 'button[aria-label="Settings"]',
      body: (
        <>
          <p>
            The gear by your name, then <b>Notifications</b>. Every kind of thing has its own row: mentions, direct
            messages, channel messages, people joining a voice room, going live, events, the daily games.
          </p>
          <p>Pick a sound or none, and switch its pop-up on or off.</p>
        </>
      ),
    },
  ],
};

let open: string | null = null;
const listeners = new Set<() => void>();
const tell = (): void => {
  for (const listener of listeners) listener();
};

export const tours = {
  has: (releaseId: string): boolean => Boolean(TOURS[releaseId]),
  /** Seeing the tour is reading the update. */
  start(releaseId: string): void {
    if (!TOURS[releaseId]) return;
    open = releaseId;
    markRead();
    tell();
  },
  close(): void {
    open = null;
    tell();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  current: (): string | null => open,
};

export function TourGate() {
  const current = useSyncExternalStore(tours.subscribe, tours.current);
  const steps = current ? TOURS[current] : undefined;
  if (!steps) return null;
  return <Walkthrough key={current} steps={steps} onClose={tours.close} clickOffCloses />;
}
