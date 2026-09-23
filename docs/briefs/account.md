# Account settings: change password and two-factor

Read `docs/briefs/README.md` first. Sonnet.

The server has had these for weeks and the app has no way to reach them:

- `POST /api/auth/password` `{ currentPassword, newPassword }`: changes
  it, signs out every other session, sets a fresh cookie for this one.
- `POST /api/auth/totp/begin`: returns `{ secret, uri, qr }`. `qr` is a
  PNG data URL **drawn on our own server** (the `qrcode` package), so no
  third party sees the secret. Use it as an `<img src>`.
- `POST /api/auth/totp/complete` `{ secret, code }`: turns it on and
  returns `recoveryCodes`, once.
- `POST /api/auth/totp/disable` `{ password }`.
- Client wrappers exist: `api.auth.changePassword`, `beginTotp`,
  `completeTotp`, `disableTotp` in `web/src/lib/api.ts`. The sign-in
  screen already asks for the code when two-factor is on.

## The job

An "Account" section in the settings reached from the menu under your
name. `web/src/components/UserPanel.tsx` opens `ProfileSettings`,
`VoiceSettings` and the others; add Account beside them the same way, in
the same modal style.

- **Change password**: current, new, new again. Same rules and wording as
  `web/src/screens/NewPasswordScreen.tsx`, the forced version of this
  after an admin reset. On success: "Changed. You are still signed in
  here; everywhere else has been signed out."
- **Two-factor**: when off, "Turn on" shows the QR, the secret as text
  (for typing in by hand), a code field and Confirm. On success the
  recovery codes appear once, with a Copy button and "Save these
  somewhere safe. Each one gets you in once if you lose your phone. They
  will not be shown again." When on, it says so, with "Turn off", which
  asks for the password.
- The self user in the store has `totpEnabled`; keep it in step after
  turning it on or off (find how the store updates the self user).

Plain words throughout: "two-factor", not "2FA"; "an authenticator app
(for example one on your phone)".

## Tests

Whatever pure logic there is. `npm test`, `npm run typecheck`,
`npm run build`.

## Not in this job

The server. Email. Passkeys.
