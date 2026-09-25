/**
 * The lock at the top of an encrypted channel, and the panel behind it: who
 * holds the key the next message will be locked with, whose devices are
 * waiting for someone here to let them in, and what the encryption does not
 * cover. The word "encrypted" appears only where it is true (non-negotiable 8).
 * `docs/channel-e2ee.md`.
 *
 * Two lists here mean two different things, and keeping them apart is the
 * point of the panel. The holder list is what the server says; the accepted
 * devices are what a person on *this* device has let in, and keys only follow
 * the second. A device the server lists as a holder but this panel has never
 * heard of is drawn as exactly that.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Channel, Member } from '@scryproof/shared';

import type { AdmittedDevice } from '../lib/acceptance';
import { channelKeysFor } from '../lib/channel-keys';
import { isRecoveryDevice } from '../lib/dm-recovery';
import { nameOf } from '../lib/mentions';
import { safetyNumber } from '../lib/safety-number';
import { useStore } from '../state/store';
import { Modal } from './Modal';

export function ChannelLock({ channel }: { channel: Channel }) {
  const [open, setOpen] = useState(false);
  if (!channel.encrypted || channel.type !== 'text') return null;
  return (
    <>
      <button
        type="button"
        className="channel-lock-button"
        title="End-to-end encrypted. Who can read this channel."
        onClick={() => setOpen(true)}
      >
        Encrypted
      </button>
      {open ? <LockPanel channel={channel} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

interface Holders {
  epoch: number;
  holders: AdmittedDevice[];
  waiting: AdmittedDevice[];
}

function LockPanel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { state } = useStore();
  const selfId = state.user?.id ?? null;
  const members = state.members[channel.serverId] ?? [];
  const [view, setView] = useState<Holders | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mine, setMine] = useState<{ userId: string; fingerprint: string } | null>(null);
  /** Safety numbers, by fingerprint: working one out takes about half a second. */
  const numbers = useRef(new Map<string, string>());
  const [shown, setShown] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!selfId) return;
    try {
      const keys = channelKeysFor(selfId);
      setView(await keys.holders(channel.id));
      setMine(await keys.self());
    } catch {
      setProblem('Could not ask the server who holds the key.');
    }
  }, [selfId, channel.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The numbers are worked out once each, in the background, newest device
  // last: nothing here is worth a frozen panel, and none of them change.
  useEffect(() => {
    const held = [
      ...(mine ? [mine] : []),
      ...(view?.waiting ?? [])
        .filter((entry) => !entry.accepted)
        .map((entry) => ({ userId: entry.device.userId, fingerprint: entry.fingerprint })),
      ...(view?.holders ?? [])
        .filter((entry) => !entry.accepted)
        .map((entry) => ({ userId: entry.device.userId, fingerprint: entry.fingerprint })),
    ];
    let stopped = false;
    void (async () => {
      for (const entry of held) {
        if (!entry.fingerprint) continue;
        let number = numbers.current.get(entry.fingerprint);
        if (!number) {
          number = await safetyNumber(entry.userId, entry.fingerprint);
          numbers.current.set(entry.fingerprint, number);
        }
        if (stopped) return;
        setShown((known) => ({ ...known, [entry.fingerprint]: number }));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [mine, view]);

  const nameFor = (userId: string): string => {
    const member = members.find((entry) => entry.userId === userId);
    return member ? nameOf(member) : 'Someone who left';
  };

  // One line per person: a person's phone and laptop are the same reader.
  const people = new Map<string, AdmittedDevice[]>();
  for (const entry of view?.holders ?? []) {
    if (isRecoveryDevice(entry.device.deviceId)) continue;
    people.set(entry.device.userId, [...(people.get(entry.device.userId) ?? []), entry]);
  }

  const numberFor = (fingerprint: string): string =>
    fingerprint ? (shown[fingerprint] ?? 'working it out…') : 'no key';

  return (
    <Modal
      title={`#${channel.name} is end-to-end encrypted`}
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="field-note" style={{ marginTop: 0 }}>
        Messages here are locked on the sender&rsquo;s device and signed by it. The server stores scrambled bytes and
        has no key. Not encrypted: who posted and when, which message a reply points at, reactions, who was
        mentioned, and the channel&rsquo;s name and topic.
        {channel.encryptedAt
          ? ` Encryption was turned on ${new Date(channel.encryptedAt).toLocaleDateString()}: messages from before then are not encrypted, and the server can read them.`
          : ''}
      </p>

      {problem ? <div className="error">{problem}</div> : null}

      <div className="field">
        <label>Waiting to be let in</label>
        {view === null && !problem ? <div className="spinner" /> : null}
        {view && view.waiting.length === 0 ? (
          <p className="field-note">Nobody. Every device that can read this channel has been let in on this device.</p>
        ) : null}
        <div className="dm-warnings">
          {view?.waiting.map((entry) => {
            const holding = (view.holders ?? []).some(
              (holder) => holder.device.deviceId === entry.device.deviceId && holder.device.userId === entry.device.userId,
            );
            const who = entry.device.userId === selfId ? 'You' : nameFor(entry.device.userId);
            return (
              <div className="dm-warning" key={`${entry.device.userId}:${entry.device.deviceId}`}>
                <div>
                  <strong>
                    {who} {holding ? 'holds this channel’s key' : 'wants to read here'}.
                  </strong>{' '}
                  {holding ? 'The server says so; nobody on this device let it in. ' : ''}
                  {entry.verdict === 'changed'
                    ? 'Its key is not the one this device saw before: that is what a wiped browser looks like, and what somebody in the middle looks like.'
                    : 'A new browser or a new phone looks like this. So would somebody pretending.'}{' '}
                  Until it is let in, it gets no key from this device. Device {entry.device.deviceId.slice(0, 8)}.
                  <span className="dm-fingerprint" title="This device's safety number, from its identity key.">
                    {numberFor(entry.fingerprint)}
                  </span>
                </div>
                <button
                  type="button"
                  className="button secondary inline"
                  onClick={() => {
                    if (!selfId) return;
                    void channelKeysFor(selfId).accept(channel.id, entry).then(load);
                  }}
                >
                  Let in
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {mine ? (
        <div className="field">
          <label>Your number</label>
          <p className="field-note" style={{ marginTop: 0 }}>
            Read this out loud, over something the server does not carry, so the other person can check it against
            their screen. If they see something else for this device, someone is in the middle.
          </p>
          <span className="dm-fingerprint">{numberFor(mine.fingerprint)}</span>
        </div>
      ) : null}

      <div className="field">
        <label>Who holds the current key</label>
        {view === null && !problem ? <div className="spinner" /> : null}
        {view && people.size === 0 ? (
          <p className="field-note">Nobody yet. The first message sent here makes it.</p>
        ) : null}
        <ul className="lock-holders">
          {[...people.entries()]
            .sort(([a], [b]) => nameFor(a).localeCompare(nameFor(b)))
            .map(([userId, devices]) => (
              <li key={userId}>
                <span>{userId === selfId ? `${nameFor(userId)} (you)` : nameFor(userId)}</span>
                <span className="lock-devices">
                  {devices.length} device{devices.length === 1 ? '' : 's'}
                  {devices.every((entry) => entry.accepted) ? '' : ' — not let in here'}
                </span>
              </li>
            ))}
        </ul>
        <p className="field-note">
          A key goes only to devices a person here has let in. When the server reports that someone lost access, the
          next message moves the channel to a new key they do not get. A server that hides a removal can keep them on
          the list; nothing on this device can catch that yet. Key {view?.epoch ?? '…'}.
        </p>
      </div>
    </Modal>
  );
}
