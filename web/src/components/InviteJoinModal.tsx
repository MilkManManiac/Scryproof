/**
 * What an `/invite/CODE` link does once there is a session to act on: the
 * code was stashed at boot (see `lib/invite-link.ts`) and survived sign-in,
 * so the first thing a signed-in shell does is look at it. Already a member?
 * Just open the server. Otherwise, show what it is and let them press Join.
 */

import { useEffect, useState } from 'react';

import { ApiError, api } from '../lib/api';
import { takePendingInviteCode } from '../lib/invite-link';
import { useStore } from '../state/store';
import { Modal } from './Modal';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

type Preview = {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
};

export function InviteJoinModal() {
  const { selectServer, refreshServer } = useStore();
  const [code, setCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const pending = takePendingInviteCode();
    if (!pending) return;

    api.invites
      .preview(pending)
      .then((result) => {
        if (result.kind !== 'server' || !result.server) {
          setError('That invite is not for a server.');
          setCode(pending);
          return;
        }
        if (result.alreadyMember) {
          selectServer(result.server.id);
          return;
        }
        setCode(pending);
        setPreview(result.server);
      })
      .catch((problem) => {
        setCode(pending);
        setError(problem instanceof ApiError ? problem.message : 'Could not use that invite.');
      });
    // Runs once: the pending code is consumed the moment this reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!code) return null;

  function close() {
    setCode(null);
    setPreview(null);
    setError(null);
  }

  async function join() {
    if (!preview || !code) return;
    setBusy(true);
    setError(null);
    try {
      const { server } = await api.invites.accept(code);
      await refreshServer(server.id);
      selectServer(server.id);
      close();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not join that server.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Join a server"
      onClose={close}
      footer={
        error && !preview ? (
          <button type="button" className="button inline" onClick={close}>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="button secondary inline" onClick={close}>
              Cancel
            </button>
            <button type="button" className="button inline" disabled={busy || !preview} onClick={() => void join()}>
              Join
            </button>
          </>
        )
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {preview ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {preview.iconUrl ? (
            <img src={preview.iconUrl} alt="" width={48} height={48} style={{ borderRadius: 12 }} />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-tertiary)',
                fontWeight: 600,
              }}
            >
              {initials(preview.name)}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{preview.name}</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
              {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
