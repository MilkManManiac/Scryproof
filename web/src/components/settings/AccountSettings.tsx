/**
 * Change your password, and turn two-factor on or off.
 *
 * Both live on the server already; this is the first place the app reaches
 * them. Changing the password signs out every other session but keeps this
 * one, because the server already issues a fresh cookie when it does. Turning
 * two-factor on or off is not broadcast over the gateway, so this screen
 * patches the self user in the store itself once the request succeeds.
 */

import { useState, type FormEvent } from 'react';
import { LIMITS, validatePassword } from '@scryproof/shared';

import { ApiError, api } from '../../lib/api';
import { useStore } from '../../state/store';
import { Modal } from '../Modal';

export function AccountSettings({ onClose }: { onClose: () => void }) {
  const { state, patchUser } = useStore();
  const user = state.user;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);

  const [totpView, setTotpView] = useState<'idle' | 'enrolling' | 'disabling'>('idle');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  if (!user) return null;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    const check = validatePassword(next);
    if (!check.ok) return setPasswordError(check.error);
    if (next !== again) return setPasswordError('The two new passwords are not the same.');
    if (next === current) return setPasswordError('Pick a new one, not the one you have now.');

    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setPasswordDone(true);
    } catch (problem) {
      setPasswordError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function beginTotp() {
    setTotpBusy(true);
    setTotpError(null);
    try {
      const { secret: newSecret, qr: newQr } = await api.auth.beginTotp();
      setSecret(newSecret);
      setQr(newQr);
      setCode('');
      setTotpView('enrolling');
    } catch (problem) {
      setTotpError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setTotpBusy(false);
    }
  }

  async function completeTotp(event: FormEvent) {
    event.preventDefault();
    if (totpBusy) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      const { recoveryCodes: codes } = await api.auth.completeTotp(secret, code);
      patchUser({ totpEnabled: true });
      setRecoveryCodes(codes);
      setRecoveryCopied(false);
      setTotpView('idle');
      setSecret('');
      setQr('');
      setCode('');
    } catch (problem) {
      setTotpError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setTotpBusy(false);
    }
  }

  async function disableTotp(event: FormEvent) {
    event.preventDefault();
    if (totpBusy) return;
    setTotpBusy(true);
    setTotpError(null);
    try {
      await api.auth.disableTotp(disablePassword);
      patchUser({ totpEnabled: false });
      setDisablePassword('');
      setTotpView('idle');
    } catch (problem) {
      setTotpError(problem instanceof ApiError ? problem.message : 'Could not reach the server.');
    } finally {
      setTotpBusy(false);
    }
  }

  return (
    <Modal
      title="Account"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <form onSubmit={(event) => void changePassword(event)}>
        <div className="field">
          <label htmlFor="account-current-password">Current password</label>
          <input
            id="account-current-password"
            type="password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setPasswordDone(false);
            }}
            autoComplete="current-password"
            maxLength={LIMITS.password.max}
          />
        </div>
        <div className="field">
          <label htmlFor="account-new-password">New password</label>
          <input
            id="account-new-password"
            type="password"
            value={next}
            onChange={(event) => {
              setNext(event.target.value);
              setPasswordDone(false);
            }}
            autoComplete="new-password"
            maxLength={LIMITS.password.max}
          />
          <p className="field-note">
            At least {LIMITS.password.min} characters. A short sentence you will remember works well.
          </p>
        </div>
        <div className="field">
          <label htmlFor="account-new-password-again">New password again</label>
          <input
            id="account-new-password-again"
            type="password"
            value={again}
            onChange={(event) => {
              setAgain(event.target.value);
              setPasswordDone(false);
            }}
            autoComplete="new-password"
            maxLength={LIMITS.password.max}
          />
        </div>
        {passwordError ? <div className="error">{passwordError}</div> : null}
        {passwordDone ? (
          <p className="field-note">
            Changed. You are still signed in here; everywhere else has been signed out.
          </p>
        ) : null}
        <button type="submit" className="button secondary inline" disabled={passwordBusy}>
          {passwordBusy ? 'Working' : 'Change password'}
        </button>
      </form>

      <div className="field">
        <label>Two-factor</label>
        <p className="field-note">
          An extra code from an authenticator app (for example one on your phone) when you sign in.
        </p>

        {recoveryCodes ? (
          <div>
            <p className="field-note">
              Save these somewhere safe. Each one gets you in once if you lose your phone. They will
              not be shown again.
            </p>
            <textarea readOnly value={recoveryCodes.join('\n')} rows={recoveryCodes.length} />
            <div className="copy-row">
              <button
                type="button"
                className="button inline"
                onClick={() => {
                  void navigator.clipboard.writeText(recoveryCodes.join('\n')).then(() => setRecoveryCopied(true));
                }}
              >
                {recoveryCopied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="button secondary inline" onClick={() => setRecoveryCodes(null)}>
                I&apos;ve saved these
              </button>
            </div>
          </div>
        ) : user.totpEnabled ? (
          <div>
            <p className="field-note">Two-factor is on.</p>
            {totpView === 'disabling' ? (
              <form onSubmit={(event) => void disableTotp(event)}>
                <div className="field">
                  <label htmlFor="account-disable-totp-password">Password</label>
                  <input
                    id="account-disable-totp-password"
                    type="password"
                    value={disablePassword}
                    onChange={(event) => setDisablePassword(event.target.value)}
                    autoComplete="current-password"
                    autoFocus
                  />
                </div>
                <button type="submit" className="button secondary inline" disabled={totpBusy}>
                  {totpBusy ? 'Working' : 'Turn off'}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setTotpView('idle');
                    setDisablePassword('');
                    setTotpError(null);
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button type="button" className="button secondary inline" onClick={() => setTotpView('disabling')}>
                Turn off
              </button>
            )}
          </div>
        ) : totpView === 'enrolling' ? (
          <form onSubmit={(event) => void completeTotp(event)}>
            <img src={qr} alt="QR code for an authenticator app" width={200} height={200} />
            <p className="field-note">
              Scan this with an authenticator app (for example one on your phone), or type this in by
              hand:
            </p>
            <p className="field-note">
              <code>{secret}</code>
            </p>
            <div className="field">
              <label htmlFor="account-totp-code">Code</label>
              <input
                id="account-totp-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={12}
              />
            </div>
            <button type="submit" className="button secondary inline" disabled={totpBusy}>
              {totpBusy ? 'Working' : 'Confirm'}
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setTotpView('idle');
                setSecret('');
                setQr('');
                setCode('');
                setTotpError(null);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="button secondary inline" disabled={totpBusy} onClick={() => void beginTotp()}>
            Turn on
          </button>
        )}
        {totpError ? <div className="error">{totpError}</div> : null}
      </div>
    </Modal>
  );
}
