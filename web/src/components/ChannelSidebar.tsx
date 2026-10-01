/**
 * Channel list for the selected server.
 *
 * Every channel drawn here came from the server already filtered by
 * VIEW_CHANNEL. The client never receives a channel it cannot see, so there is
 * nothing here to hide and nothing to leak by mistake.
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import { LIMITS, Permission, slugifyChannelName, validateChannelName } from '@scryproof/shared';
import type { ServerDetail } from '@scryproof/shared';

import { ApiError, INVITE_LIVES, api, type InviteLife } from '../lib/api';
import { groupChannels } from '../lib/channel-order';
import { channelDrafts, isShortDraft } from '../lib/drafts';
import { usePressHold } from '../lib/hold';
import { nameFor, useLocalNames } from '../lib/local-names';
import { notifyPrefs, placeMode } from '../lib/notify';
import { canOnServer } from '../lib/usePermissions';
import { badgeText, countLabel, unreadFor, useStore } from '../state/store';
import { Avatar } from './Avatar';
import { ComingUp } from './ComingUp';
import { Menu, MenuItem } from './Menu';
import { PlaceModeItems } from './PlaceModeItems';
import { Modal } from './Modal';
import { CategorySettings } from './settings/CategorySettings';
import { ChannelSettings } from './settings/ChannelSettings';
import { PUBLIC, PrivacyPicker } from './settings/PrivacyPicker';
import type { PrivacyChoice } from './settings/PrivacyPicker';
import { ServerSettings } from './settings/ServerSettings';
import { authorityFor } from './settings/authority';
import { UserPanel } from './UserPanel';
import { VolumeMenu, spotOf, type MenuSpot } from './VolumeMenu';
import { VoiceModItems } from './VoiceModItems';
import { useVoice } from '../state/useVoice';
import { CameraGlyph, HeadphonesGlyph, MicGlyph, ScreenGlyph } from './glyphs';
import { useProfileCard } from './ProfileCard';

export function ChannelSidebar({ server }: { server: ServerDetail }) {
  const { state, selectChannel, joinVoice } = useStore();
  useLocalNames();
  const live = useVoice();
  const card = useProfileCard();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<'channel' | 'category' | 'invite' | 'settings' | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  // Which category the New channel dialog should start on, when it was opened
  // from a heading rather than from the top of the sidebar.
  const [newChannelIn, setNewChannelIn] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  /** The channel whose settings are open, from its gear or its menu. */
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  /** A person being dragged out of one voice channel, and the channel under them. */
  const [dragging, setDragging] = useState<{ userId: string; from: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  /** Why a drag to move someone was refused, under the channel it was dropped on. */
  const [moveProblem, setMoveProblem] = useState<{ channelId: string; text: string } | null>(null);
  // Which channel's right-click menu (mute/unmute) is open, if any.
  const [channelMenu, setChannelMenu] = useState<string | null>(null);
  const hold = usePressHold();
  /** The channel whose right-click menu is asking "really delete?". */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** The person in a voice channel whose right-click volume menu is open. */
  const [volumeMenu, setVolumeMenu] = useState<{ userId: string; spot: MenuSpot } | null>(null);
  const notifyState = useSyncExternalStore(notifyPrefs.subscribe, notifyPrefs.get);
  // The version, not the text itself: only used to make React re-render this
  // list when a draft changes, and every channel reads its own text back off
  // the store below.
  useSyncExternalStore(channelDrafts.subscribe, channelDrafts.getVersion);

  const canManage = canOnServer(server, Permission.MANAGE_CHANNELS);
  // Channel settings hold the permissions too, which Manage roles may edit
  // without Manage channels. The same test as the gear over an open channel.
  const canEdit = canManage || canOnServer(server, Permission.MANAGE_ROLES);
  const canMove = canOnServer(server, Permission.MOVE_MEMBERS);
  const canInvite = canOnServer(server, Permission.CREATE_INVITE);
  // An empty category is only ever sent to someone who may manage channels, and
  // they need to see the one they just made.
  const groups = useMemo(
    () => groupChannels(server, { keepEmpty: canManage }),
    [server, canManage],
  );

  const members = state.members[server.id] ?? [];
  const category = server.categories.find((entry) => entry.id === editingCategory) ?? null;
  const editing = server.channels.find((entry) => entry.id === editingChannel) ?? null;

  const moveInto = (channelId: string, userId: string) => {
    setMoveProblem(null);
    api.voice.move(server.id, userId, channelId).catch((problem: unknown) => {
      setMoveProblem({ channelId, text: problem instanceof ApiError ? problem.message : 'Could not move them.' });
      window.setTimeout(() => setMoveProblem((now) => (now?.channelId === channelId ? null : now)), 5000);
    });
  };
  const voiceOccupantName = (userId: string) => {
    const member = members.find((entry) => entry.userId === userId);
    return nameFor(userId, member?.nickname ?? member?.user.displayName ?? 'Someone');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-header-name" title={server.name}>
          {server.name}
        </span>
        <span className="sidebar-header-tools">
          <button
            type="button"
            className="icon-button"
            title="Server settings"
            onClick={() => setDialog('settings')}
          >
            &#9881;
          </button>
          {canInvite ? (
            <button
              type="button"
              className="icon-button"
              title="Invite someone"
              onClick={() => setDialog('invite')}
            >
              &#8594;
            </button>
          ) : null}
          {canManage ? (
            <span style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-button"
                title="Add a channel or a category"
                aria-haspopup="menu"
                onClick={() => setAddMenu((open) => !open)}
              >
                +
              </button>
              {addMenu ? (
                <Menu align="right" onClose={() => setAddMenu(false)}>
                  <MenuItem
                    note="Somewhere to talk."
                    onClick={() => {
                      setAddMenu(false);
                      setNewChannelIn(null);
                      setDialog('channel');
                    }}
                  >
                    Channel
                  </MenuItem>
                  <MenuItem
                    note="A heading, and a permission layer under every channel in it."
                    onClick={() => {
                      setAddMenu(false);
                      setDialog('category');
                    }}
                  >
                    Category
                  </MenuItem>
                </Menu>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>

      <div className="sidebar-scroll">
        <ComingUp server={server} />

        {groups.map((entry) => {
          const key = entry.id ?? 'uncategorised';
          const isCollapsed = collapsed[key] ?? false;

          return (
            <div className="category" key={key}>
              <div className="category-row">
                <button
                  type="button"
                  className="category-label"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}
                >
                  <span className={isCollapsed ? 'category-caret collapsed' : 'category-caret'}>
                    &#9660;
                  </span>
                  {entry.name}
                </button>

                {canManage && entry.id !== null ? (
                  <span className="category-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title={`Settings for ${entry.name}`}
                      onClick={() => setEditingCategory(entry.id)}
                    >
                      &#9881;
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title={`New channel in ${entry.name}`}
                      onClick={() => {
                        setNewChannelIn(entry.id);
                        setDialog('channel');
                      }}
                    >
                      +
                    </button>
                  </span>
                ) : null}
              </div>

              {isCollapsed || entry.channels.length > 0 ? null : (
                <p className="category-empty">
                  Nothing in here yet. Only you and anyone who can manage channels sees this
                  heading until there is.
                </p>
              )}

              {isCollapsed
                ? null
                : entry.channels.map((channel) => {
                    const active = state.selectedChannelId === channel.id;
                    const inVoice = Object.values(state.voiceStates).filter(
                      (voice) => voice.channelId === channel.id,
                    );
                    // No special case for the open channel. Looking at it marks
                    // it read and the badge goes by itself; if the window is
                    // not focused it has not been read, and saying so here is
                    // the only thing that keeps this count and the rail's from
                    // disagreeing.
                    const { unread, mentions, count } = unreadFor(state, channel);
                    const mode = placeMode(notifyState, server.id, channel.id);
                    const muted = mode === 'mute';
                    const hasDraft = isShortDraft(channelDrafts.get(channel.id));

                    // The type is a class too, so a voice channel can be told from a
                    // text one by selector (the screenshot script needs that).
                    const classes = ['channel', channel.type];
                    if (active) classes.push('active');
                    if (unread) classes.push('unread');
                    if (muted) classes.push('muted');

                    if (dropOn === channel.id) classes.push('drop-target');
                    // A person from another voice channel can be dropped here.
                    const takesDrop = channel.type === 'voice' && dragging !== null && dragging.from !== channel.id;

                    return (
                      <div key={channel.id} className="channel-row" style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className={classes.join(' ')}
                          onDragOver={
                            takesDrop
                              ? (event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                  if (dropOn !== channel.id) setDropOn(channel.id);
                                }
                              : undefined
                          }
                          onDragLeave={takesDrop ? () => setDropOn((now) => (now === channel.id ? null : now)) : undefined}
                          onDrop={
                            takesDrop
                              ? (event) => {
                                  event.preventDefault();
                                  setDropOn(null);
                                  if (dragging) moveInto(channel.id, dragging.userId);
                                  setDragging(null);
                                }
                              : undefined
                          }
                          title={
                            muted
                              ? `${channel.name} — muted`
                              : mode === 'watch'
                                ? `${channel.name} — every message makes a sound and pops up`
                                : mode === 'mentions'
                                  ? `${channel.name} — mentions only`
                                  : undefined
                          }
                          onClick={() => {
                            selectChannel(channel.id);
                            if (channel.type === 'voice') joinVoice(channel.id);
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setChannelMenu(channel.id);
                          }}
                          {...hold(() => setChannelMenu(channel.id))}
                        >
                          <span className="channel-sigil">
                            {channel.type === 'voice' ? '♫' : '#'}
                          </span>
                          <span className="channel-name">{channel.name}</span>
                          {channel.private ? (
                            <span className="channel-lock" title="Private: only some roles and people can see this channel">
                              &#9679;
                            </span>
                          ) : null}
                          {channel.encrypted ? (
                            <span className="channel-lock" title="End-to-end encrypted">
                              &#128274;
                            </span>
                          ) : null}
                          {mode === 'watch' ? (
                            // Why this channel is noisy, at a glance.
                            <span className="channel-watch" aria-label="Every message">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="2.8" />
                              </svg>
                            </span>
                          ) : null}
                          {hasDraft ? (
                            <span className="channel-draft" title="You have an unsent draft here">
                              &#9998;
                            </span>
                          ) : null}
                          {mentions > 0 ? (
                            <span className="badge" title={countLabel(mentions)}>
                              {badgeText(mentions)}
                            </span>
                          ) : count > 0 ? (
                            // How many came in since you last read it (Wes's friend,
                            // 2026-10-01). Grey, so a mention still stands out.
                            <span className="badge quiet" title={`${count >= 100 ? 'Over 99' : count} unread`}>
                              {badgeText(count)}
                            </span>
                          ) : null}
                        </button>

                        {canEdit ? (
                          <button
                            type="button"
                            className="icon-button channel-gear"
                            title={channel.type === 'voice' ? `Edit ${channel.name}` : `Edit #${channel.name}`}
                            aria-label={`Channel settings for ${channel.name}`}
                            onClick={() => setEditingChannel(channel.id)}
                          >
                            &#9881;
                          </button>
                        ) : null}
                        {moveProblem?.channelId === channel.id ? <p className="channel-note">{moveProblem.text}</p> : null}

                        {channelMenu === channel.id ? (
                          <Menu
                            onClose={() => {
                              setChannelMenu(null);
                              setConfirmDelete(null);
                              setDeleteError(null);
                            }}
                          >
                            <PlaceModeItems
                              id={channel.id}
                              scope="channel"
                              kind={channel.type === 'voice' ? 'voice' : 'text'}
                              serverId={server.id}
                              onDone={() => setChannelMenu(null)}
                            />
                            {canEdit ? (
                              <MenuItem
                                note="Name, who can see it and get in, and what each role may do."
                                onClick={() => {
                                  setChannelMenu(null);
                                  setEditingChannel(channel.id);
                                }}
                              >
                                Edit channel
                              </MenuItem>
                            ) : null}
                            {/* Deleting lives in the channel's settings too, at the
                                bottom. Wes could not find it there, so it is here as
                                well, with the same two steps. Hidden without Manage
                                channels; the server refuses either way. */}
                            {canManage && confirmDelete !== channel.id ? (
                              <MenuItem
                                danger
                                note="Its messages go with it. You will be asked once more."
                                onClick={() => setConfirmDelete(channel.id)}
                              >
                                Delete channel
                              </MenuItem>
                            ) : null}
                            {canManage && confirmDelete === channel.id ? (
                              <MenuItem
                                danger
                                note={deleteError ?? 'There is no undo and no archive.'}
                                onClick={() => {
                                  api.channels
                                    .remove(channel.id)
                                    .then(() => {
                                      setChannelMenu(null);
                                      setConfirmDelete(null);
                                    })
                                    .catch((problem) => {
                                      setDeleteError(problem instanceof ApiError ? problem.message : 'Could not delete it.');
                                    });
                                }}
                              >
                                Yes, delete #{channel.name}
                              </MenuItem>
                            ) : null}
                          </Menu>
                        ) : null}

                        {inVoice.length > 0 ? (
                          <div className="voice-members">
                            {inVoice.map((voice) => {
                              const member = members.find(
                                (entry2) => entry2.userId === voice.userId,
                              );
                              // Speaking is known only from inside the call:
                              // LiveKit tells us who is loud, and only for the
                              // room we are in. From outside, nobody is ringed.
                              const speaking =
                                live.channelId === channel.id && live.speaking.includes(voice.userId);
                              const draggable = canMove && voice.userId !== state.user?.id;
                              const openMenu = (at: { clientX: number; clientY: number }) =>
                                setVolumeMenu({ userId: voice.userId, spot: spotOf(at) });
                              return (
                                <div
                                  className={speaking ? 'voice-member speaking' : 'voice-member'}
                                  key={voice.userId}
                                  draggable={draggable || undefined}
                                  title={draggable ? 'Drag onto another voice channel to move them' : undefined}
                                  onDragStart={
                                    draggable
                                      ? (event) => {
                                          event.dataTransfer.effectAllowed = 'move';
                                          event.dataTransfer.setData('text/plain', voiceOccupantName(voice.userId));
                                          setDragging({ userId: voice.userId, from: channel.id });
                                        }
                                      : undefined
                                  }
                                  onDragEnd={
                                    draggable
                                      ? () => {
                                          setDragging(null);
                                          setDropOn(null);
                                        }
                                      : undefined
                                  }
                                  {...(voice.userId !== state.user?.id ? hold(openMenu) : {})}
                                  role={member ? 'button' : undefined}
                                  tabIndex={member ? 0 : undefined}
                                  style={member ? { cursor: 'pointer' } : undefined}
                                  onClick={member ? (event) => card.show(member.user, event.currentTarget, server.id) : undefined}
                                  onKeyDown={
                                    member
                                      ? (event) => {
                                          if (event.key === 'Enter') card.show(member.user, event.currentTarget, server.id);
                                        }
                                      : undefined
                                  }
                                  onContextMenu={
                                    voice.userId !== state.user?.id
                                      ? (event) => {
                                          event.preventDefault();
                                          openMenu(event);
                                        }
                                      : undefined
                                  }
                                >
                                  {member ? (
                                    <Avatar user={member.user} small />
                                  ) : (
                                    <span className="avatar small" style={{ background: '#3a4150' }} />
                                  )}
                                  <span className="channel-name">{voiceOccupantName(voice.userId)}</span>
                                  <span className="voice-flags">
                                    {voice.sharingScreen ? (
                                      <span className="voice-flag sharing" title="Sharing their screen">
                                        <ScreenGlyph />
                                      </span>
                                    ) : null}
                                    {voice.cameraOn ? (
                                      <span className="voice-flag camera" title="Camera on">
                                        <CameraGlyph />
                                      </span>
                                    ) : null}
                                    {voice.selfDeaf || voice.serverDeaf ? (
                                      <span className="voice-flag muted" title="Deafened">
                                        <HeadphonesGlyph off />
                                      </span>
                                    ) : voice.selfMute || voice.serverMute ? (
                                      <span className="voice-flag muted" title="Muted">
                                        <MicGlyph off />
                                      </span>
                                    ) : null}
                                  </span>
                                  {volumeMenu?.userId === voice.userId ? (
                                    <VolumeMenu
                                      userId={voice.userId}
                                      name={voiceOccupantName(voice.userId)}
                                      spot={volumeMenu.spot}
                                      onClose={() => setVolumeMenu(null)}
                                    >
                                      <VoiceModItems server={server} voice={voice} onDone={() => setVolumeMenu(null)} />
                                    </VolumeMenu>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
            </div>
          );
        })}
      </div>

      <UserPanel />

      {dialog === 'channel' ? (
        <NewChannelDialog
          server={server}
          initialCategoryId={newChannelIn}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'category' ? (
        <NewCategoryDialog server={server} onClose={() => setDialog(null)} />
      ) : null}
      {editing ? (
        <ChannelSettings
          channel={editing}
          server={server}
          members={members}
          authority={authorityFor(server, members, state.user?.id ?? null)}
          onClose={() => setEditingChannel(null)}
        />
      ) : null}
      {category ? (
        <CategorySettings
          category={category}
          server={server}
          members={members}
          authority={authorityFor(server, members, state.user?.id ?? null)}
          onClose={() => setEditingCategory(null)}
        />
      ) : null}
      {dialog === 'invite' ? (
        <InviteDialog server={server} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'settings' ? (
        <ServerSettings server={server} onClose={() => setDialog(null)} />
      ) : null}
    </aside>
  );
}

function NewChannelDialog({
  server,
  initialCategoryId,
  onClose,
}: {
  server: ServerDetail;
  initialCategoryId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [privacy, setPrivacy] = useState<PrivacyChoice>(PUBLIC);
  const [encrypted, setEncrypted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { state } = useStore();

  const slug = slugifyChannelName(name);
  const categories = [...server.categories].sort((a, b) => a.position - b.position);

  async function create() {
    const valid = validateChannelName(slug);
    if (!valid.ok) return setError(valid.error);

    setBusy(true);
    setError(null);
    try {
      await api.channels.create(server.id, {
        name: slug,
        type,
        categoryId,
        encrypted: type === 'text' && encrypted,
        private: privacy.private ? privacy : undefined,
      });
      onClose();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create the channel.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New channel"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button inline"
            disabled={busy}
            onClick={() => void create()}
          >
            Create
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label>Type</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={type === 'text' ? 'button inline' : 'button secondary inline'}
            onClick={() => setType('text')}
          >
            # Text
          </button>
          <button
            type="button"
            className={type === 'voice' ? 'button inline' : 'button secondary inline'}
            onClick={() => setType('voice')}
          >
            &#9835; Voice
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="channel-name">Name</label>
        <input
          id="channel-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={LIMITS.channelName.max}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
        />
        <p className="field-note">Will be created as {slug ? `#${slug}` : 'a lowercase slug'}.</p>
      </div>

      {categories.length > 0 ? (
        <div className="field">
          <label htmlFor="channel-category">Category</label>
          <select
            id="channel-category"
            value={categoryId ?? ''}
            onChange={(event) => setCategoryId(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">No category</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <p className="field-note">
            The category&rsquo;s permissions apply to this channel before its own, so a channel
            created in a private category is private from the moment it exists.
          </p>
        </div>
      ) : null}

      {state.user ? (
        <PrivacyPicker serverId={server.id} roles={server.roles} value={privacy} onChange={setPrivacy} selfId={state.user.id} />
      ) : null}

      {type === 'text' ? (
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={encrypted} onChange={(event) => setEncrypted(event.target.checked)} />
            End-to-end encrypted
          </label>
          <p className="field-note">
            {encrypted
              ? 'Messages are locked on your devices, and the server stores only scrambled bytes. Files and voice messages are locked too. No search, polls, rolls or initiative here yet. Cannot be turned off later.'
              : 'Messages are stored on our server where it could read them, like a normal channel. Voice is always encrypted either way.'}
          </p>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * A category is created empty, and an empty category is only visible to people
 * who may manage channels. That is deliberate — the heading is information, and
 * "Staff" over nothing anyone can see gives away exactly what the permissions
 * were for — but it does mean the thing you just made looks lonely until you
 * put a channel in it. The sidebar says so in place of the missing channels.
 */
function NewCategoryDialog({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (trimmed === '') return setError('A category needs a name.');

    setBusy(true);
    setError(null);
    try {
      await api.categories.create(server.id, trimmed);
      onClose();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create the category.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New category"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button inline"
            disabled={busy}
            onClick={() => void create()}
          >
            Create
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label htmlFor="category-name">Name</label>
        <input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={48}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
        />
        <p className="field-note">
          Kept as you type it, capitals and all. Set its permissions from the gear beside the
          heading; everything you put inside inherits them.
        </p>
      </div>
    </Modal>
  );
}

function InviteDialog({ server, onClose }: { server: ServerDetail; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function mint(expiresIn: InviteLife) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.invites.create(server.id, expiresIn);
      setUrl(result.url);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create an invite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Invite to ${server.name}`}
      onClose={onClose}
      footer={
        <button type="button" className="button secondary inline" onClick={onClose}>
          Done
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {url ? (
        <div className="field">
          <label>Invite link</label>
          <div className="copy-row">
            <input readOnly value={url} onFocus={(event) => event.target.select()} />
            <button
              type="button"
              className="button inline"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="field-note">
            Anyone with this link can join this server. It does not create an account on the
            instance by itself unless registration is open.
          </p>
        </div>
      ) : (
        <div className="field">
          <label>Expires after</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {INVITE_LIVES.map((option) => (
              <button
                key={option.id}
                type="button"
                className="button secondary inline"
                disabled={busy}
                onClick={() => void mint(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="field-note">Pick one to make the link. Every invite stops working within two days.</p>
        </div>
      )}
    </Modal>
  );
}
