/**
 * Someone is calling: a small card in the corner, a soft ring, and the
 * window's title blinking, until you answer, wave it off, or they give up.
 *
 * Wes, 2026-09-23: "have a flash or something if someone is calling you, a
 * small popup... a soft call sound. That kinda vibe." A call in a
 * conversation used to ring nobody: the others found a mark in their list.
 *
 * "Calling" is read off what the server already says about calls: a call in
 * one of your conversations went from nobody to somebody while you were
 * connected and not in it. Nothing new is sent, so nothing new is known to
 * the server. A call that was already going when you connected does not ring;
 * it has its mark in the list, as before.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DmChannel } from '@scryproof/shared';

import { nameFor, useLocalNames } from '../lib/local-names';
import { notifyPrefs, ring } from '../lib/notify';
import { useDms } from '../state/dms';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { HangUpGlyph, PhoneGlyph } from './glyphs';

/** How long a call rings before it gives up and leaves the mark in the list. */
const RING_FOR_MS = 45_000;
const RING_EVERY_MS = 2_600;

interface Ringing {
  dmId: string;
  callerId: string;
  since: number;
}

export function IncomingCall() {
  const { state, joinDmCall } = useStore();
  const { state: dms, openDm } = useDms();
  useLocalNames();
  const sound = useSyncExternalStore(notifyPrefs.subscribe, notifyPrefs.get);
  const [ringing, setRinging] = useState<Ringing[]>([]);
  /** The conversations with a call going, as last seen; null until the first look after connecting. */
  const known = useRef<Set<string> | null>(null);

  const selfId = state.user?.id ?? null;
  const open = state.connection === 'open';

  // Who is in which conversation's call, and whether this person is one of them.
  const calls = new Map<string, string[]>();
  for (const entry of Object.values(state.voiceStates)) {
    if (!entry.dmId) continue;
    calls.set(entry.dmId, [...(calls.get(entry.dmId) ?? []), entry.userId]);
  }
  const signature = [...calls.entries()].map(([dmId, people]) => `${dmId}:${people.sort().join(',')}`).sort().join('|');

  useEffect(() => {
    if (!open || !selfId) {
      known.current = null;
      return;
    }
    const going = new Set(calls.keys());
    const before = known.current;
    known.current = going;
    setRinging((current) => {
      // Stop ringing for a call that ended, or that you are now in.
      let next = current.filter((entry) => {
        const people = calls.get(entry.dmId);
        return people && !people.includes(selfId);
      });
      if (before) {
        for (const [dmId, people] of calls) {
          if (before.has(dmId) || people.includes(selfId)) continue;
          if (next.some((entry) => entry.dmId === dmId)) continue;
          next = [...next, { dmId, callerId: people[0]!, since: Date.now() }];
        }
      }
      return next.length === current.length && next.every((entry, i) => entry === current[i]) ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, open, selfId]);

  // Give up after a while, the way a phone does.
  useEffect(() => {
    if (ringing.length === 0) return undefined;
    const soonest = Math.min(...ringing.map((entry) => entry.since)) + RING_FOR_MS - Date.now();
    const timer = setTimeout(
      () => setRinging((current) => current.filter((entry) => Date.now() - entry.since < RING_FOR_MS)),
      Math.max(0, soonest),
    );
    return () => clearTimeout(timer);
  }, [ringing]);

  // The ring itself, and the title blinking. Quiet on Do not disturb; the card still shows.
  const quiet = state.presences[selfId ?? ''] === 'dnd';
  const first = ringing[0];
  const firstDm = first ? dms.dms[first.dmId] : undefined;
  const callerName = first ? callerOf(firstDm, first.callerId) : '';
  useEffect(() => {
    if (!first) return undefined;
    if (!quiet) ring();
    const bell = quiet ? null : setInterval(ring, RING_EVERY_MS);
    const title = document.title;
    let flip = false;
    const blink = setInterval(() => {
      flip = !flip;
      document.title = flip ? `${callerName} is calling` : title;
    }, 1000);
    return () => {
      if (bell) clearInterval(bell);
      clearInterval(blink);
      document.title = title;
    };
  }, [first?.dmId, quiet, callerName]);

  // The system's own pop-up, for a window that is not in front.
  useEffect(() => {
    if (!first || document.hasFocus()) return undefined;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined;
    let shown: Notification | null = null;
    try {
      shown = new Notification(`${callerName} is calling`, { body: 'Open Scryproof to answer.', tag: `call-${first.dmId}`, silent: true });
      shown.onclick = () => {
        window.focus();
        openDm(first.dmId);
        shown?.close();
      };
    } catch {
      // Some browsers only allow these from a service worker. The card is there.
    }
    return () => shown?.close();
  }, [first?.dmId]);

  if (!first) return null;

  const dismiss = () => setRinging((current) => current.filter((entry) => entry !== first));
  const answer = () => {
    openDm(first.dmId);
    joinDmCall(first.dmId);
    dismiss();
  };
  const caller = firstDm?.members.find((member) => member.id === first.callerId);
  const group = firstDm?.kind === 'group' ? (firstDm.title ?? 'a group') : null;

  return (
    <div className="incoming-call" role="alertdialog" aria-label={`${callerName} is calling`}>
      <div className="incoming-call-who">
        {caller ? <Avatar user={caller} /> : null}
        <div>
          <div className="incoming-call-name">{callerName}</div>
          <div className="incoming-call-what">{group ? `Calling ${group}` : 'Incoming call'}{sound.volume === 0 || quiet ? ' · silent' : ''}</div>
        </div>
      </div>
      <div className="incoming-call-actions">
        <button type="button" className="call-button hang-up" title="Ignore" aria-label="Ignore" onClick={dismiss}>
          <HangUpGlyph size={20} />
        </button>
        <button type="button" className="call-button answer" title="Join the call" aria-label="Answer" onClick={answer}>
          <PhoneGlyph size={20} />
        </button>
      </div>
    </div>
  );
}

function callerOf(dm: DmChannel | undefined, callerId: string): string {
  const member = dm?.members.find((entry) => entry.id === callerId);
  return nameFor(callerId, member?.displayName ?? 'Someone');
}
