# Phone notifications: push and the icon badge

**Priority: important.** Wes, 2026-09-26, after the first real phone test:
"Is there a way to have notifications through this app structure? like
either a noise or a number next to the app that shows if you have a
message or something?" ... "Note it as important."

Main-session job, not an agent brief: it touches the service worker, the
server and a secret.

## Why phones get nothing today

Pop-ups (`web/src/lib/notices.ts`) only happen while the page is running.
A phone suspends the app seconds after it leaves the screen, so a closed
or backgrounded Scryproof on a phone is silent. The icon badge
(`navigator.setAppBadge`) has the same limit: a closed app cannot set it.
Both need Web Push.

## What Web Push gives, per platform

- iPhone: iOS 16.4 or later, **installed to the home screen only** (a
  Safari tab never gets push). Permission must come from a tap on a
  button of ours, not on page load. Banner, lock screen, the phone's
  standard sound, and a number on the icon. No Apple developer account,
  no fee. No custom sound.
- Android: Chrome, installed or not. Banner and sound; the icon shows a
  dot or a number depending on the launcher.
- Desktop browsers get it for free; the Electron app keeps its own path.

## The rule it lives under

GAMEPLAN.md line 101: push travels through Google, Apple or Mozilla, and
the payload is "something happened" and nothing else, ever. The payload
is also encrypted to the device (RFC 8291), so the relay sees only that
this device got a ping from scryproof.com and when. That metadata is the
accepted cost; say so in the settings text.

## The plan

1. **Plain version.** DMs and @mentions only. VAPID key pair: the private
   key in `infra/.env` on the box only. A `push_subscriptions` table
   (user, device endpoint, keys; deleted on sign-out and when the relay
   answers 404/410). Server sends an empty-content ping on a DM or a
   mention. `sw.js` gets a `push` handler that shows "New message in
   Scryproof" and sets the badge, and a `notificationclick` that opens
   the app. A switch in Settings > Notifications with the button that
   asks permission. Badge cleared when the app is opened and read.
2. **Then find out** whether the service worker can fetch the encrypted
   message from our server and decrypt it on the phone, so the banner
   reads "milky: got like 30 secs for a quick call test?" with nothing
   readable ever passing Apple or Google. Open question: whether iOS
   gives a push handler enough time, and whether the device keys in
   IndexedDB are reachable from the worker. If not, the plain version
   stays.

Test on a real iPhone and a real Android before calling it done; the
phone tour runs Chromium and cannot see push.
