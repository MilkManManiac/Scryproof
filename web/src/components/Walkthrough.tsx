/**
 * "How Scryproof works": a few cards, each pointing at the part of the screen
 * it is about when that part is on screen, in plain words (Wes, 2026-09-25).
 * `lib/walkthrough.ts` decides when it shows.
 *
 * Not built on `Modal`: the check scripts find dialogs by `.modal`, and a
 * fresh browser profile is exactly the kind of visitor this shows up for.
 *
 * What it says about encryption has to stay true (non-negotiable 8). The
 * sources: `docs/channel-e2ee.md` ("Not encrypted: who posted, when..."),
 * `ChannelLock.tsx`, `RecoveryPhrase.tsx`, the Verify code in `VoicePanel.tsx`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { type Box, closeWalkthrough, placeCard } from '../lib/walkthrough';

interface Step {
  title: string;
  /** Where on screen this card is about. Missing or hidden, the card just sits in the middle. */
  target?: string;
  body: ReactNode;
}

export const STEPS: readonly Step[] = [
  {
    title: 'How Scryproof works',
    body: (
      <>
        <p>
          Scryproof is our own chat app. It runs on our own server, not on Discord&apos;s or anyone else&apos;s, so
          there&apos;s no company in the middle.
        </p>
        <p>
          This takes about a minute. Skip it if you like; it&apos;s in the menu behind your name whenever you want it.
        </p>
      </>
    ),
  },
  {
    title: 'Servers',
    target: '.rail',
    body: (
      <>
        <p>
          The column on the far left is your servers. A server is one group of people with its own channels. Click one
          to go in.
        </p>
        <p>
          The buttons at the bottom of that column start a new server or join one with an invite code. On a phone, the{' '}
          <b>☰</b> at the top left opens it.
        </p>
      </>
    ),
  },
  {
    title: 'Channels',
    target: '.sidebar-scroll',
    body: (
      <>
        <p>
          Channels with a <b>#</b> are for typing. Channels with a <b>♫</b> are voice rooms.
        </p>
        <p>
          Clicking a voice room puts you straight into the call, with nothing to confirm, so be ready to be heard when
          you click.
        </p>
      </>
    ),
  },
  {
    title: 'In a call',
    body: (
      <>
        <p>
          Once you&apos;re in, the buttons under the call mute you, turn on your camera, share your screen, or leave.
        </p>
        <p>
          Under the call there&apos;s a row of numbers: RTT, Jitter, Loss, TURN. You don&apos;t need to know what they
          mean. If your sound starts breaking up, screenshot that row and send it to whoever runs the server. It shows
          where the problem is, so nobody has to guess.
        </p>
        <p>
          Calls are always end-to-end encrypted. <b>Verify</b> shows twenty digits. If everyone in the call reads out
          the same ones, nobody is listening in, the server included.
        </p>
      </>
    ),
  },
  {
    title: 'What the server can’t read',
    target: '.channel-lock-button',
    body: (
      <>
        <p>
          Calls, direct messages, and any channel with <b>Encrypted</b> at the top are locked on the sender&apos;s
          device and only unlocked on the devices of the people meant to read them. The server stores them and passes
          them on, but it has no way to read them, and neither does whoever runs it.
        </p>
        <p>
          It can still see who posted and when, which emoji people reacted with, and the channel&apos;s name. Just not
          what was said.
        </p>
        <p>Channels without the Encrypted button are ordinary: the server can read those.</p>
      </>
    ),
  },
  {
    title: 'Letting a device in',
    target: '.channel-lock-button',
    body: (
      <>
        <p>
          When a friend signs in on a new computer or phone, that device can&apos;t read the encrypted channels until
          someone lets it in. Scryproof won&apos;t do it on its own, because whoever controls the server could slip in a
          fake device and it would look just like a real one.
        </p>
        <p>
          To let one in, click <b>Encrypted</b> at the top of the channel and look under <b>Waiting to be let in</b>.
          Only do it if you know it&apos;s really them. Ask them, outside Scryproof if you can.
        </p>
      </>
    ),
  },
  {
    title: 'Direct messages and your recovery phrase',
    target: '.rail-dms',
    body: (
      <>
        <p>
          The <b>@</b> at the top left is your direct messages. They&apos;re always encrypted.
        </p>
        <p>
          In there you&apos;ll find <b>Make a recovery phrase</b>. It&apos;s twelve words. Write them down somewhere
          that isn&apos;t this computer. If you sign in on a new computer one day, those words are the only thing that
          opens your old direct messages. Lose them and nobody can get those messages back for you, not even whoever
          runs the server. That&apos;s the other side of the server not being able to read them.
        </p>
      </>
    ),
  },
  {
    title: 'Your corner',
    target: '.user-panel',
    body: (
      <>
        <p>
          Bottom left is you. The gear is your microphone and volume settings, including how loud the soundboard is for
          you. The note next to it is notifications. In a call, mute, deafen and the soundboard show up here too.
        </p>
        <p>
          Click your name for themes, <b>What&apos;s new</b>, and this walkthrough.
        </p>
        <p>
          When a new version is ready, a bar across the top says <b>Reload now</b>, or <b>Restart to install</b> in the
          desktop app. Click it when you&apos;re not in a call.
        </p>
      </>
    ),
  },
];

const PAD = 6;

/** The target's box, if it is really on screen. A closed phone drawer is not. */
function measure(selector: string | undefined): Box | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight)
    return null;
  const top = Math.max(0, rect.top) - PAD;
  const left = Math.max(0, rect.left) - PAD;
  return {
    top,
    left,
    width: Math.min(rect.right, window.innerWidth) + PAD - left,
    height: Math.min(rect.bottom, window.innerHeight) + PAD - top,
  };
}

export function Walkthrough() {
  const [at, setAt] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = STEPS[at]!;
  const last = at === STEPS.length - 1;

  const layout = useCallback(() => {
    const box = measure(step.target);
    setSpot(box);
    const size = card.current ? { width: card.current.offsetWidth, height: card.current.offsetHeight } : null;
    if (size) setPlace(placeCard(box, size, { width: window.innerWidth, height: window.innerHeight }));
  }, [step.target]);

  useLayoutEffect(layout, [layout, at]);
  useEffect(() => {
    window.addEventListener('resize', layout);
    // Panels settle a moment after the app first draws.
    const later = window.setTimeout(layout, 300);
    return () => {
      window.removeEventListener('resize', layout);
      window.clearTimeout(later);
    };
  }, [layout]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWalkthrough();
      else if (event.key === 'ArrowRight') setAt((now) => Math.min(now + 1, STEPS.length - 1));
      else if (event.key === 'ArrowLeft') setAt((now) => Math.max(now - 1, 0));
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => card.current?.querySelector<HTMLElement>('.walkthrough-next')?.focus(), [at]);

  return (
    <div className="walkthrough-layer">
      {/* Catches clicks meant for the app underneath, so the screen holds still while it is being described. */}
      <div className={spot ? 'walkthrough-blocker' : 'walkthrough-blocker shaded'} />
      {spot ? (
        <div
          className="walkthrough-spot"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          aria-hidden="true"
        />
      ) : null}
      <div
        ref={card}
        className="walkthrough-card"
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
      >
        <div className="walkthrough-count">
          {at + 1} of {STEPS.length}
        </div>
        <h2 className="walkthrough-title">{step.title}</h2>
        <div className="walkthrough-body">{step.body}</div>
        <div className="walkthrough-footer">
          {last ? null : (
            <button type="button" className="link-button walkthrough-skip" onClick={closeWalkthrough}>
              Skip
            </button>
          )}
          <span className="walkthrough-dots" aria-hidden="true">
            {STEPS.map((entry, index) => (
              <i key={entry.title} className={index === at ? 'on' : undefined} />
            ))}
          </span>
          {at > 0 ? (
            <button type="button" className="button secondary inline" onClick={() => setAt(at - 1)}>
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="button inline walkthrough-next"
            onClick={() => (last ? closeWalkthrough() : setAt(at + 1))}
          >
            {last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
