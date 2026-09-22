# Soundboard

Read `docs/briefs/README.md` first. **Opus.** It touches the voice
path, but not the encryption: a second audio track goes through the same
per-participant key as the microphone. Read `docs/voice-e2ee.md` before
starting and change nothing under `web/src/lib/voice-crypto.ts`.

## The job

Wes's idea from 2026-09-22 ("kinda work like a soundboard where you
open a panel and can click which one you want"), which became the
character board for text. This is the real thing for voice: a server
uploads short sounds, and anyone in a voice channel opens a panel and
plays one so everyone in the call hears it. The Meepo characters are not
involved.

## Server

- Schema: `sounds` (`id`, `server_id`, `name` 1 to 32, `file` path,
  `bytes`, `created_by`, `created_at`). 24 per server, each up to 1 MB,
  `audio/webm`, `audio/ogg` or `audio/mpeg`, five seconds or under (the
  client checks the length before upload; the server checks size and
  type). One migration.
- Routes in `server/src/routes/sounds.ts`: list, upload (Manage emojis,
  the same bit custom emoji use; do not add a permission), delete, and
  the bytes at `GET /api/sounds/:id/:name` to members only, the way
  `attachments.ts` guards its bytes. Gateway `sounds_changed`, like
  `emojis_changed`.

## Client

- Settings: a "Sounds" page beside "Emoji" in the server settings, same
  layout: upload, rename, delete, play to preview.
- In a call, a speaker-shaped button in the voice bar opens a grid of the
  server's sounds (reuse the layout of `web/src/components/Spawner.tsx`;
  the tiles show the name). Click plays it locally and into the room.
- **Into the room.** `VoiceSession` in `web/src/lib/voice-session.ts`
  publishes the microphone as a `LocalAudioTrack` today, untouched. Add
  a second published track: an `AudioContext` with a
  `MediaStreamDestination`; decode the clip and `start()` a buffer
  source into it; publish the destination's track once (source
  `Track.Source.Unknown`, name `soundboard`) and keep it published while
  in the call, silent between clips. LiveKit encrypts every published
  track with the participant's key, so the receiving side needs no
  change beyond mixing: `mixKey()` in `voice-session.ts` already routes
  screen-share audio apart from the voice; give the soundboard track the
  same treatment so per-person volume applies to it.
- Push-to-talk and the threshold gate (`MicGate` in `voice-audio.ts`)
  must not silence it: they flip the microphone track's `enabled`, and
  this is a different track.
- The connection panel lists published tracks; confirm the new one
  appears. Read what `npm run test:voice` checks (the main session runs
  it, not you) and say in the report whether it needs a case for the
  second track.

## Tests

The length check and the type check as pure functions in
`web/src/lib/sounds.ts`, tested in `web/src/tests/sounds.test.ts`.

## Not in this job

Default sounds shipped with the app, volume per sound, hotkeys.
