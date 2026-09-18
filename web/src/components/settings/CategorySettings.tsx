/**
 * Per-category settings, reached from the heading in the channel sidebar.
 *
 * A category is a permission layer rather than a heading that happens to have
 * a name, so the screen that edits it is the channel screen one level up: the
 * same shell, the same overwrite editor, a different set of permission groups.
 * The one thing it does not carry is a view gate of its own — a category is
 * never opened, only resolved through.
 *
 * These permissions were reachable before this existed, but only from server
 * settings, and only once a category already existed. That left the sidebar
 * saying nothing about the layer that decides what is in it.
 */

import { useState } from 'react';
import { Permission } from '@gooffline/shared';
import type { Category, Member, ServerDetail } from '@gooffline/shared';

import { ApiError, api } from '../../lib/api';
import { groupsForCategory } from '../../lib/permissionMeta';
import { OverwritePane } from './OverwritePane';
import type { Authority } from './authority';

export function CategorySettings({
  category,
  server,
  members,
  authority,
  onClose,
}: {
  category: Category;
  server: ServerDetail;
  members: Member[];
  authority: Authority;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  const channelCount = server.channels.filter(
    (channel) => channel.categoryId === category.id,
  ).length;

  return (
    <div className="settings-backdrop" role="presentation">
      <div className="settings" role="dialog" aria-modal="true" aria-label={category.name}>
        <nav className="settings-nav">
          <div className="settings-nav-title">{category.name}</div>
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

        <div className={tab === 'permissions' ? 'settings-content wide' : 'settings-content'}>
          {tab === 'overview' ? (
            <CategoryOverview
              category={category}
              channelCount={channelCount}
              authority={authority}
              onDeleted={onClose}
            />
          ) : (
            <>
              <h2 className="settings-heading">Permissions</h2>
              <OverwritePane
                scopeId={category.id}
                server={server}
                members={members}
                authority={authority}
                groups={groupsForCategory()}
                // A category has no view gate of its own, so the bar for "you
                // cannot grant what you do not have" is the server-wide mask.
                ceiling={authority.ceiling}
                note={
                  <>
                    These apply to every channel under {category.name}, underneath each
                    channel&rsquo;s own. Deny View channel for @everyone and allow it for one role
                    to make the whole category private — and every channel you drop into it
                    afterwards, with nothing to re-sync.
                  </>
                }
                load={() => api.categories.permissions(category.id)}
                save={(targetId, body) => api.categories.setOverwrite(category.id, targetId, body)}
                clear={(targetId) => api.categories.clearOverwrite(category.id, targetId)}
                loadFailed="Could not load this category’s permissions."
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryOverview({
  category,
  channelCount,
  authority,
  onDeleted,
}: {
  category: Category;
  channelCount: number;
  authority: Authority;
  onDeleted: () => void;
}) {
  const editable = authority.can(Permission.MANAGE_CHANNELS);

  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const trimmed = name.trim();
  const dirty = trimmed !== category.name;

  async function save() {
    if (trimmed === '') return setError('A category needs a name.');

    setSaving(true);
    setError(null);
    try {
      await api.categories.rename(category.id, trimmed);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not rename the category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Overview</h2>
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="category-settings-name">Name</label>
        <input
          id="category-settings-name"
          value={name}
          disabled={!editable}
          maxLength={48}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="field-note">
          Kept as you type it. Channel names are slugs; a category heading is not.
        </p>
      </div>

      <div className="field">
        <label>Holds</label>
        <p className="field-note">
          {channelCount === 0
            ? 'Nothing yet. Create a channel in it, or move one here from that channel’s settings.'
            : `${channelCount} channel${channelCount === 1 ? '' : 's'}. Each of them resolves this category’s permissions before its own.`}
        </p>
      </div>

      {editable ? (
        <div className="danger-zone">
          <div>
            <strong>Delete {category.name}</strong>
            <p className="field-note">
              {channelCount === 0
                ? 'It is empty, so nothing else changes.'
                : `The ${channelCount} channel${channelCount === 1 ? '' : 's'} inside stay, at the top level. They lose this category’s permissions with it, so anything hidden only by this category becomes visible.`}
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
                  api.categories
                    .remove(category.id)
                    .then(onDeleted)
                    .catch((problem) => {
                      setError(
                        problem instanceof ApiError
                          ? problem.message
                          : 'Could not delete the category.',
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
            onClick={() => setName(category.name)}
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
