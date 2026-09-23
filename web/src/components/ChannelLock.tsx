/**
 * The lock at the top of an encrypted channel, and the panel behind it: who
 * holds the key the next message will be locked with, whose devices are
 * waiting for someone here to accept them, and what the encryption does not
 * cover. The word "encrypted" appears only where it is true (non-negotiable 8).
 * `docs/channel-e2ee.md`.
 */

import { useCallback, useEffect, useState } from 'react';

import type { Channel, Member } from '@scryproof/shared';

import { channelKeysFor } from '../lib/channel-keys';
import type { AssessedDevice } from '../lib/dm-crypto';
import { isRecoveryDevice } from '../lib/dm-recovery';
import { nameOf } from '../lib/mentions';
import { useStore } from '../state/store';
import { DeviceWarning } from './DirectMessages';
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
  holders: AssessedDevice[];
  waiting: AssessedDevice[];
}

function LockPanel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { state } = useStore();
  const selfId = state.user?.id ?? null;
  const members = state.members[channel.serverId] ?? [];
  const [view, setView] = useState<Holders | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selfId) return;
    try {
      setView(await channelKeysFor(selfId).holders(channel.id));
    } catch {
      setProblem('Could not ask the server who holds the key.');
    }
  }, [selfId, channel.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameFor = (userId: string): string => {
    const member = members.find((entry) => entry.userId === userId);
    return member ? nameOf(member) : 'Someone who left';
  };

  // One line per person: a person's phone and laptop are the same reader.
  const people = new Map<string, AssessedDevice[]>();
  for (const entry of view?.holders ?? []) {
    if (isRecoveryDevice(entry.device.deviceId)) continue;
    people.set(entry.device.userId, [...(people.get(entry.device.userId) ?? []), entry]);
  }

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
      </p>

      {problem ? <div className="error">{problem}</div> : null}

      {view && view.waiting.length > 0 ? (
        <div className="dm-warnings">
          {view.waiting.map((entry) => {
            const person: Member | undefined = members.find((member) => member.userId === entry.device.userId);
            return (
              <DeviceWarning
                key={`${entry.device.userId}:${entry.device.deviceId}`}
                entry={entry}
                person={person?.user ?? null}
                mine={entry.device.userId === selfId}
                onAccept={() => {
                  if (!selfId) return;
                  void channelKeysFor(selfId).accept(channel.id, entry).then(load);
                }}
              />
            );
          })}
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
                </span>
              </li>
            ))}
        </ul>
        <p className="field-note">
          A key goes only to devices someone here believes. When a person loses access, the next message moves the
          channel to a new key they do not get. Key {view?.epoch ?? '…'}.
        </p>
      </div>
    </Modal>
  );
}
