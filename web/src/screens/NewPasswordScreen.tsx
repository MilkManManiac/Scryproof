/**
 * The first thing someone sees after an admin reset their password.
 *
 * They signed in with a temporary password that someone else has seen, so
 * before anything else they pick their own. The server refuses everything
 * but this, sign-out and `me` until they do (`app.ts`), so this screen is
 * the only way forward, not a nag to dismiss.
 *
 * It asks for the temporary password again rather than carrying it over from
 * the sign-in form: a reload between the two would lose it, and typing it
 * once more is cheap.
 */

import { useState, type FormEvent } from 'react';
import { LIMITS, validatePassword } from '@scryproof/shared';
import type { SelfUser } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';

export function NewPasswordScreen({
  user,
  onDone,
  onSignedOut,
}: {
  user: SelfUser;
  onDone: (user: SelfUser) => void;
  onSignedOut: () => void;
}) {
  const [temporary, setTemporary] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const check = validatePassword(next);
    if (!check.ok) return setError(check.error);
    if (next !== again) return setError('The two new passwords are not the same.');
    if (next === temporary) return setError('Pick a new one, not the temporary one.');

    setBusy(true);
    setError(null);
    try {
      await api.auth.changePassword(temporary, next);
      const { user: updated } = await api.auth.me();
      onDone(updated);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await api.auth.logout().catch(() => undefined);
    onSignedOut();
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          Scry<span>proof</span>
        </div>
        <p className="auth-sub">
          Your password was reset, {user.displayName}. Choose a new one to carry on.
        </p>

        {error ? <div className="error">{error}</div> : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="temporary">Temporary password</label>
            <input
              id="temporary"
              type="password"
              value={temporary}
              onChange={(event) => setTemporary(event.target.value)}
              autoComplete="current-password"
              maxLength={LIMITS.password.max}
              autoFocus
            />
            <p className="field-note">The one you were just given, the same one you signed in with.</p>
          </div>

          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              maxLength={LIMITS.password.max}
            />
            <p className="field-note">
              At least {LIMITS.password.min} characters. A short sentence you will remember works well.
            </p>
          </div>

          <div className="field">
            <label htmlFor="new-password-again">New password again</label>
            <input
              id="new-password-again"
              type="password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              autoComplete="new-password"
              maxLength={LIMITS.password.max}
            />
          </div>

          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Working' : 'Save and continue'}
          </button>
        </form>

        <div className="auth-switch">
          <button type="button" className="link-button" onClick={() => void signOut()}>
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
