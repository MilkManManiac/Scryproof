/**
 * Per-channel settings: the name and topic, and the overwrites that make a
 * channel private.
 *
 * The overwrite editor itself lives in `OverwritePane`, shared with the
 * category screen, because channels and categories run the same algebra one
 * level apart. What is specific to a channel is here: which permission groups
 * apply to a text or voice channel, and the ceiling, which is the editor's
 * permissions *in this channel* rather than their server-wide mask.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  LIMITS,
  Permission,
  decodeMask,
  slugifyChannelName,
  validateChannelName,
} from '@scryproof/shared';
import type { Channel, Member, ServerDetail } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import { groupsForChannel } from '../../lib/permissionMeta';
import { OverwritePane } from './OverwritePane';
import { PUBLIC, PrivacyPicker } from './PrivacyPicker';
import type { PrivacyChoice } from './PrivacyPicker';
import { useStore } from '../../state/store';
import type { Authority } from './authority';

const SLOWMODE_OPTIONS = [0, 5, 10, 30, 60, 300, 900] as const;

function slowmodeLabel(seconds: number): string {
  if (seconds === 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  return `${seconds / 60}m`;
}

export function ChannelSettings({
  channel,
  server,
  members,
  authority,
  onClose,
}: {
  channel: Channel;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');

  return (
    <div className="settings-backdrop" role="presentation">
      <div className="settings" role="dialog" aria-modal="true" aria-label={`#${channel.name}`}>
        <nav className="settings-nav">
          <div className="settings-nav-title">
            {channel.type === 'voice' ? '♫' : '#'} {channel.name}
          </div>
          <button
            type="button"
            className={tab === 'overview' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === 'permissions' ? 'settings-nav-item active' : 'settings-nav-item'}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>

          <div className="settings-nav-spacer" />
          <button type="button" className="settings-nav-item" onClick={onClose}>
            Close
          </button>
        </nav>

        <div className="settings-content">
          {tab === 'overview' ? (
            <ChannelOverview
              channel={channel}
              server={server}
              authority={authority}
              onDeleted={onClose}
            />
          ) : (
            <ChannelPermissions
              channel={channel}
              server={server}
              members={members}
              authority={authority}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelOverview({
  channel,
  server,
  authority,
  onDeleted,
}: {
  channel: Channel;
  server: ServerDetail;
  authority: Authority;
  onDeleted: () => void;
}) {
  const editable = authority.can(Permission.MANAGE_CHANNELS);
  const { state } = useStore();

  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [slowmode, setSlowmode] = useState(channel.slowmodeSeconds);
  const [categoryId, setCategoryId] = useState<string | null>(channel.categoryId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // What the overwrites say now, and what is picked. Null until fetched.
  const [wasPrivacy, setWasPrivacy] = useState<PrivacyChoice | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyChoice>(PUBLIC);

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    api.channels
      .privacy(channel.id)
      .then(({ privacy: current }) => {
        if (cancelled) return;
        setWasPrivacy(current);
        setPrivacy(current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channel.id, editable]);

  const categories = [...server.categories].sort((a, b) => a.position - b.position);
  const slug = slugifyChannelName(name);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
  const privacyDirty =
    wasPrivacy !== null &&
    (privacy.private !== wasPrivacy.private ||
      (privacy.private && (!same(privacy.roleIds, wasPrivacy.roleIds) || !same(privacy.memberIds, wasPrivacy.memberIds))));
  const dirty =
    slug !== channel.name ||
    topic !== (channel.topic ?? '') ||
    slowmode !== channel.slowmodeSeconds ||
    categoryId !== channel.categoryId ||
    privacyDirty;

  async function save() {
    const valid = validateChannelName(slug);
    if (!valid.ok) return setError(valid.error);

    setSaving(true);
    setError(null);
    try {
      if (slug !== channel.name || topic !== (channel.topic ?? '') || slowmode !== channel.slowmodeSeconds || categoryId !== channel.categoryId) {
        await api.channels.update(channel.id, {
          name: slug,
          topic: topic.trim() === '' ? null : topic.trim(),
          slowmodeSeconds: slowmode,
          categoryId,
        });
      }
      if (privacyDirty) {
        const { privacy: saved } = await api.channels.setPrivacy(channel.id, privacy);
        setWasPrivacy(saved);
        setPrivacy(saved);
      }
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not save the channel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Overview</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="channel-settings-name">Name</label>
        <input
          id="channel-settings-name"
          value={name}
          disabled={!editable}
          maxLength={LIMITS.channelName.max}
          onChange={(event) => setName(event.target.value)}
        />
        {slug !== name ? <p className="field-note">Saved as #{slug}.</p> : null}
      </div>

      <div className="field">
        <label htmlFor="channel-settings-topic">Topic</label>
        <input
          id="channel-settings-topic"
          value={topic}
          disabled={!editable}
          maxLength={LIMITS.topic.max}
          onChange={(event) => setTopic(event.target.value)}
        />
        <p className="field-note">Shown in the header. Plain text; never rendered as markup.</p>
      </div>

      {categories.length > 0 ? (
        <div className="field">
          <label htmlFor="channel-settings-category">Category</label>
          <select
            id="channel-settings-category"
            value={categoryId ?? ''}
            disabled={!editable}
            onChange={(event) =>
              setCategoryId(event.target.value === '' ? null : event.target.value)
            }
          >
            <option value="">No category</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <p className="field-note">
            Moving a channel changes who can see it, because the category it lands in is a
            permission layer beneath this channel&rsquo;s own overwrites. Nothing is copied, so
            moving it out again puts it back exactly as it was.
          </p>
        </div>
      ) : null}

      {editable && wasPrivacy && state.user ? (
        <PrivacyPicker serverId={server.id} roles={server.roles} value={privacy} onChange={setPrivacy} selfId={state.user.id} />
      ) : null}

      {channel.type === 'text' ? (
        <div className="field">
          <label>Slow mode</label>
          <div className="swatches">
            {SLOWMODE_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={slowmode === seconds ? 'button inline' : 'button secondary inline'}
                disabled={!editable}
                onClick={() => setSlowmode(seconds)}
              >
                {slowmodeLabel(seconds)}
              </button>
            ))}
          </div>
          <p className="field-note">
            The wait between messages, per person. Anyone with Manage messages is exempt.
          </p>
        </div>
      ) : null}

      {editable ? (
        <div className="danger-zone">
          <div>
            <strong>Delete #{channel.name}</strong>
            <p className="field-note">
              The channel and its messages go with it. There is no undo and no archive.
            </p>
          </div>
          {confirmDelete ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="button secondary inline"
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="button danger inline"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  api.channels
                    .remove(channel.id)
                    .then(onDeleted)
                    .catch((problem) => {
                      setError(
                        problem instanceof ApiError
                          ? problem.message
                          : 'Could not delete the channel.',
                      );
                      setSaving(false);
                    });
                }}
              >
                Delete for good
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="button danger inline"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}

      {dirty && editable ? (
        <div className="save-bar">
          <span>Unsaved changes.</span>
          <button
            type="button"
            className="button secondary inline"
            disabled={saving}
            onClick={() => {
              setName(channel.name);
              setTopic(channel.topic ?? '');
              setSlowmode(channel.slowmodeSeconds);
              setCategoryId(channel.categoryId);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="button inline"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </>
  );
}

function ChannelPermissions({
  channel,
  server,
  members,
  authority,
}: {
  channel: Channel;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
}) {
  const [ceiling, setCeiling] = useState<bigint | null>(null);

  // The bar for "you cannot grant what you do not have" is this person's
  // permissions *in this channel*, which is not their server-wide mask: a
  // channel overwrite may already have taken something away from them here.
  useEffect(() => {
    let live = true;
    api.channels
      .myPermissions(channel.id)
      .then((mine) => live && setCeiling(decodeMask(mine.permissions)))
      .catch(() => live && setCeiling(0n));
    return () => {
      live = false;
    };
  }, [channel.id]);

  const groups = useMemo(() => groupsForChannel(channel.type), [channel.type]);

  return (
    <>
      <h2 className="settings-heading">Permissions</h2>
      {ceiling === null ? (
        <div className="spinner" />
      ) : (
        <OverwritePane
          scopeId={channel.id}
          server={server}
          members={members}
          authority={authority}
          groups={groups}
          ceiling={ceiling}
          note={
            <>
              Overwrites apply on top of roles and on top of this channel’s category, for this
              channel only. Deny beats allow, and a member overwrite beats a role one. To make a
              channel private, deny View channel for @everyone and allow it for the role that
              should be in here.
            </>
          }
          load={() => api.channels.permissions(channel.id)}
          save={(targetId, body) => api.channels.setOverwrite(channel.id, targetId, body)}
          clear={(targetId) => api.channels.clearOverwrite(channel.id, targetId)}
          loadFailed="Could not load this channel’s permissions."
        />
      )}
    </>
  );
}
