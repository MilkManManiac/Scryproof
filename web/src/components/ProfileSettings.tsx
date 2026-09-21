/**
 * Your name, your picture, and the line under your name.
 *
 * A picture goes through the same stripping as an attachment before it leaves
 * this machine (scrub-image.ts), and is shrunk to 512 pixels here rather than
 * on the server: the server stores what it is given and never opens it.
 */

import { useRef, useState } from 'react';
import { LIMITS } from '@scryproof/shared';

import { api, ApiError } from '../lib/api';
import { ScrubError, scrubImage } from '../lib/scrub-image';
import { useStore } from '../state/store';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

const AVATAR_PX = 512;

/** Square, from the middle, no bigger than it needs to be. */
async function squareOff(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height, AVATAR_PX);
    const crop = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
    const type = file.type === 'image/png' || file.type === 'image/gif' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.88));
    return blob ? new File([blob], type === 'image/png' ? 'avatar.png' : 'avatar.jpg', { type }) : file;
  } finally {
    bitmap.close();
  }
}

export function ProfileSettings({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const user = state.user;
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [statusText, setStatusText] = useState(user?.statusText ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  if (!user) return null;

  const failed = (problem: unknown) =>
    setError(problem instanceof ApiError || problem instanceof ScrubError ? problem.message : 'That did not work.');

  async function save() {
    const name = displayName.trim();
    if (!name) return setError('A name cannot be empty.');
    setBusy(true);
    setError(null);
    try {
      await api.auth.updateProfile({ displayName: name, statusText: statusText.trim() || null });
      onClose();
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
    }
  }

  async function choose(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.uploadAvatar(await squareOff(await scrubImage(file)));
    } catch (problem) {
      failed(problem);
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  }

  return (
    <Modal
      title="Your profile"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button inline" disabled={busy} onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="profile-picture">
        <Avatar user={user} />
        <div>
          <button type="button" className="button secondary inline" disabled={busy} onClick={() => picker.current?.click()}>
            {user.avatarUrl ? 'Change picture' : 'Add a picture'}
          </button>
          {user.avatarUrl ? (
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => void api.auth.removeAvatar().catch(failed)}
            >
              Remove
            </button>
          ) : null}
          <p className="field-note">Cropped square, shrunk to 512 pixels, and any location data in it is removed before it is sent.</p>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => void choose(event.target.files?.[0])}
        />
      </div>

      <div className="field">
        <label htmlFor="profile-name">Display name</label>
        <input
          id="profile-name"
          value={displayName}
          maxLength={LIMITS.displayName.max}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="profile-status">Status</label>
        <input
          id="profile-status"
          value={statusText}
          maxLength={LIMITS.statusText}
          placeholder="What you are up to"
          onChange={(event) => setStatusText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
        <p className="field-note">Shown under your name to everyone in your servers. Leave it empty to show nothing.</p>
      </div>
    </Modal>
  );
}
