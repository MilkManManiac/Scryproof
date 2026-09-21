/**
 * Sign in, sign up, first run, and the second factor.
 *
 * Three things here are security decisions, not styling ones:
 *
 *   - No "that username doesn't exist" anywhere. Wrong password and unknown
 *     account produce the same message, and the server spends the same time on
 *     both, so this screen cannot be used to enumerate members.
 *   - The second factor is a separate step reached only after the password was
 *     correct, and the first request is never retried with a guessed code.
 *   - Nothing is stored in localStorage. The session is an httpOnly cookie the
 *     browser holds and JavaScript cannot read.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { LIMITS, validatePassword, validateUsername } from '@scryproof/shared';
import type { SelfUser } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';

type Mode = 'signin' | 'register';

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SelfUser) => void }) {
  const [context, setContext] = useState<{ firstRun: boolean; inviteRequired: boolean } | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth
      .context()
      .then((value) => {
        setContext(value);
        // A brand-new instance has nobody to sign in as, so open on the form
        // that actually does something.
        if (value.firstRun) setMode('register');
      })
      .catch(() => setContext({ firstRun: false, inviteRequired: true }));
  }, []);

  // An invite link lands on /invite/<code>; carry the code into the form and
  // put the address bar back so a reload does not resubmit it.
  useEffect(() => {
    const match = window.location.pathname.match(/^\/invite\/([a-z0-9]+)$/i);
    if (!match) return;
    setInviteCode(match[1]!);
    setMode('register');
    window.history.replaceState(null, '', '/');
  }, []);

  const firstRun = context?.firstRun ?? false;
  const inviteNeeded = (context?.inviteRequired ?? true) && !firstRun;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === 'register') {
      const name = validateUsername(username.trim().toLowerCase());
      if (!name.ok) return setError(name.error);
      const pass = validatePassword(password);
      if (!pass.ok) return setError(pass.error);
      if (inviteNeeded && !inviteCode.trim()) {
        return setError('An invite code is required to join this instance.');
      }
    }

    setBusy(true);
    try {
      if (mode === 'register') {
        const { user } = await api.auth.register({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim() || undefined,
          password,
          inviteCode: inviteCode.trim() || undefined,
        });
        // A server's invite link also admitted them to the instance. Finish the
        // job so they land inside the server instead of an empty screen. An
        // account-only invite has no server behind it and fails here, harmlessly.
        if (inviteCode.trim()) {
          await api.invites.accept(inviteCode.trim()).catch(() => undefined);
        }
        onAuthenticated(user);
        return;
      }

      const result = await api.auth.login({
        username: username.trim().toLowerCase(),
        password,
        totpCode: needsTotp ? totpCode.trim() : undefined,
      });

      if (result.totpRequired) {
        setError(needsTotp ? 'That code was not accepted. Try the current one.' : null);
        setNeedsTotp(true);
        setTotpCode('');
        return;
      }
      if (result.user) onAuthenticated(result.user);
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!context) {
    return (
      <div className="auth">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          Scry<span>proof</span>
        </div>
        <p className="auth-sub">
          {firstRun
            ? 'Nobody lives here yet. The first account owns the instance.'
            : mode === 'signin'
              ? 'Private instance. Sign in to continue.'
              : 'Create an account on this instance.'}
        </p>

        {firstRun ? (
          <div className="notice">
            First run. This account becomes the owner and can invite everyone else.
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}

        <form onSubmit={submit}>
          {needsTotp ? (
            <div className="field">
              <label htmlFor="totp">Authentication code</label>
              <input
                id="totp"
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                autoFocus
                placeholder="000000"
              />
              <p className="field-note">
                From your authenticator app. A recovery code also works here.
              </p>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={LIMITS.username.max}
                  autoFocus
                />
              </div>

              {mode === 'register' ? (
                <div className="field">
                  <label htmlFor="displayName">Display name</label>
                  <input
                    id="displayName"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={username || 'Optional'}
                    maxLength={LIMITS.displayName.max}
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  maxLength={LIMITS.password.max}
                />
                {mode === 'register' ? (
                  <p className="field-note">
                    At least {LIMITS.password.min} characters. A short sentence you will
                    remember beats a short one with a symbol bolted on.
                  </p>
                ) : null}
              </div>

              {mode === 'register' && inviteNeeded ? (
                <div className="field">
                  <label htmlFor="invite">Invite code</label>
                  <input
                    id="invite"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
              ) : null}
            </>
          )}

          <button className="button" type="submit" disabled={busy}>
            {busy
              ? 'Working'
              : needsTotp
                ? 'Verify'
                : mode === 'register'
                  ? firstRun
                    ? 'Create the owner account'
                    : 'Create account'
                  : 'Sign in'}
          </button>
        </form>

        {firstRun || needsTotp ? null : (
          <div className="auth-switch">
            {mode === 'signin' ? 'Have an invite? ' : 'Already have an account? '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setMode(mode === 'signin' ? 'register' : 'signin');
                setError(null);
              }}
            >
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
