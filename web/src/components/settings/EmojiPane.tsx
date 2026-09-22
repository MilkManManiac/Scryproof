/**
 * The server's own emoji.
 *
 * The list comes from the store, which holds what arrived with the server and
 * refreshes on the gateway's `emojis_changed`, so two people editing this
 * screen at once see each other's work without either of them reloading.
 *
 * The image is re-encoded here before it is uploaded, for the reason every
 * other image in this app is: the metadata goes nowhere near our disk, and
 * under Milestone 7 the server could not be the place that strips it.
 */

import { useState } from 'react';
import { LIMITS, Permission, validateEmojiName } from '@scryproof/shared';
import type { ServerDetail } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import { ScrubError, scrubImage } from '../../lib/scrub-image';
import type { Authority } from './authority';

/** What the route accepts. A GIF is left animated, so it is not re-encoded. */
const ACCEPT = 'image/png,image/gif,image/webp';

export function EmojiPane({ server, authority }: { server: ServerDetail; authority: Authority }) {
  const editable = authority.can(Permission.MANAGE_SERVER);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emojis = server.emojis;
  const full = emojis.length >= LIMITS.emojisPerServer;
  const check = name === '' ? null : validateEmojiName(name);
  const ready = editable && !busy && !full && file !== null && check?.ok === true;

  async function add() {
    if (!file || !check?.ok) return;
    setBusy(true);
    setError(null);
    try {
      const clean = await scrubImage(file);
      if (clean.size > LIMITS.emojiBytes) {
        setError(`That image is larger than ${Math.round(LIMITS.emojiBytes / 1024)} KB.`);
        return;
      }
      await api.emojis.add(server.id, name, clean);
      // The gateway event brings the new list, so nothing is set here.
      setName('');
      setFile(null);
    } catch (problem) {
      if (problem instanceof ScrubError) setError(problem.message);
      else setError(problem instanceof ApiError ? problem.message : 'Could not add the emoji.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(emojiId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.emojis.remove(server.id, emojiId);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not remove the emoji.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="settings-heading">Emoji</h2>
      {error ? <div className="error">{error}</div> : null}

      <p className="settings-note">
        Anyone in this server can use these by typing the name between colons, and can react with
        them. {emojis.length} of {LIMITS.emojisPerServer} used.
      </p>

      {emojis.length === 0 ? (
        <p className="settings-note">This server has no emoji of its own yet.</p>
      ) : (
        <div className="emoji-rows">
          {emojis.map((emoji) => (
            <div className="emoji-row" key={emoji.id}>
              <img className="emoji-row-image" src={emoji.url} alt={`:${emoji.name}:`} />
              <span className="emoji-row-name">:{emoji.name}:</span>
              {editable ? (
                <button
                  type="button"
                  className="button secondary inline"
                  disabled={busy}
                  onClick={() => void remove(emoji.id)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {editable ? (
        <>
          <div className="settings-subhead">Add an emoji</div>
          {full ? (
            <p className="settings-note">
              This server is holding as many emoji as it can. Remove one to add another.
            </p>
          ) : (
            <div className="emoji-add">
              <div className="field">
                <label htmlFor="emoji-name">Name</label>
                <input
                  id="emoji-name"
                  value={name}
                  maxLength={LIMITS.emojiName.max}
                  placeholder="nat_20"
                  onChange={(event) => setName(event.target.value.toLowerCase())}
                />
                {check && !check.ok ? <p className="field-note">{check.error}</p> : null}
              </div>

              <div className="field">
                <label htmlFor="emoji-image">Image</label>
                <input
                  id="emoji-image"
                  type="file"
                  accept={ACCEPT}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="field-note">
                  PNG, GIF or WebP, up to {Math.round(LIMITS.emojiBytes / 1024)} KB. A square image
                  of about 128 pixels looks best.
                </p>
              </div>

              <button
                type="button"
                className="button inline"
                disabled={!ready}
                onClick={() => void add()}
              >
                {busy ? 'Adding' : 'Add'}
              </button>
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
