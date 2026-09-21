/**
 * The server rail.
 *
 * Only servers the member actually belongs to appear, because the ready frame
 * only ever contains those. There is no directory and no discovery: on a
 * private instance, a server you were not invited to should not be visible as
 * a name you could ask about.
 */

import { useState } from 'react';
import { LIMITS, validateServerName } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { unreadDmCount, useDms } from '../state/dms';
import { badgeText, countLabel, unreadForServer, useStore } from '../state/store';
import { Modal } from './Modal';

function tile(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export function ServerRail() {
  const { state, selectServer, refreshServer } = useStore();
  const { state: dms, showDms, hideDms } = useDms();
  const waiting = unreadDmCount(dms);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setCreating(false);
    setJoining(false);
    setName('');
    setCode('');
    setError(null);
    setBusy(false);
  }

  async function createServer() {
    const valid = validateServerName(name);
    if (!valid.ok) return setError(valid.error);

    setBusy(true);
    setError(null);
    try {
      const { server } = await api.servers.create(name.trim());
      // The gateway sends server_create too; selecting here just means the new
      // server is already open by the time the dialog closes.
      selectServer(server.id);
      close();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not create the server.');
      setBusy(false);
    }
  }

  async function acceptInvite() {
    if (!code.trim()) return setError('Paste an invite code.');

    setBusy(true);
    setError(null);
    try {
      const { server } = await api.invites.accept(code.trim());
      await refreshServer(server.id);
      selectServer(server.id);
      close();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not use that invite.');
      setBusy(false);
    }
  }

  return (
    <nav className="rail" aria-label="Servers">
      <button
        type="button"
        className={`rail-item rail-dms${dms.active ? ' active' : ''}${waiting > 0 ? ' unread' : ''}`}
        title={waiting > 0 ? `Direct messages — ${waiting} unread` : 'Direct messages'}
        aria-current={dms.active ? 'true' : undefined}
        onClick={showDms}
      >
        @
        {waiting > 0 ? <span className="badge">{badgeText(waiting)}</span> : null}
      </button>
      <div className="rail-divider" />

      {state.serverOrder.map((id) => {
        const server = state.servers[id];
        if (!server) return null;
        const active = state.selectedServerId === id && !dms.active;
        // The pip is the server's own news. Looking at it is not reading it,
        // so an open server still shows one until its channels are read.
        const { unread, mentions } = unreadForServer(state, id);

        const classes = ['rail-item'];
        if (active) classes.push('active');
        if (unread) classes.push('unread');

        return (
          <button
            key={id}
            type="button"
            className={classes.join(' ')}
            title={mentions > 0 ? `${server.name} — ${countLabel(mentions)}` : server.name}
            aria-current={active ? 'true' : undefined}
            onClick={() => {
              hideDms();
              selectServer(id);
            }}
          >
            {tile(server.name)}
            {mentions > 0 ? <span className="badge">{badgeText(mentions)}</span> : null}
          </button>
        );
      })}

      {state.serverOrder.length > 0 ? <div className="rail-divider" /> : null}

      <button
        type="button"
        className="rail-item rail-add"
        title="Create a server"
        onClick={() => setCreating(true)}
      >
        +
      </button>

      <button
        type="button"
        className="rail-item rail-add"
        title="Use an invite code"
        style={{ fontSize: 16 }}
        onClick={() => setJoining(true)}
      >
        &#8594;
      </button>

      {creating ? (
        <Modal
          title="Create a server"
          onClose={close}
          footer={
            <>
              <button type="button" className="button secondary inline" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="button inline"
                disabled={busy}
                onClick={() => void createServer()}
              >
                Create
              </button>
            </>
          }
        >
          {error ? <div className="error">{error}</div> : null}
          <div className="field">
            <label htmlFor="server-name">Name</label>
            <input
              id="server-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMITS.serverName.max}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createServer();
              }}
            />
            <p className="field-note">
              You will own it, with a text channel and a voice channel to start.
            </p>
          </div>
        </Modal>
      ) : null}

      {joining ? (
        <Modal
          title="Join with an invite"
          onClose={close}
          footer={
            <>
              <button type="button" className="button secondary inline" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="button inline"
                disabled={busy}
                onClick={() => void acceptInvite()}
              >
                Join
              </button>
            </>
          }
        >
          {error ? <div className="error">{error}</div> : null}
          <div className="field">
            <label htmlFor="invite-code">Invite code</label>
            <input
              id="invite-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void acceptInvite();
              }}
            />
          </div>
        </Modal>
      ) : null}
    </nav>
  );
}
