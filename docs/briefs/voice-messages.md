# Voice messages

Read `docs/briefs/README.md` first. Sonnet can do this: the recording
and the player are the whole job, and the server's message path is not
touched in any new way.

## The job

Hold the microphone button beside Send, talk, let go, and a short clip
is sent as an attachment that plays in place: a play button, a waveform,
the length. Works in channels (plain attachments) and in DMs (files are
already sealed before upload in `DirectMessages.tsx`, so a clip there is
encrypted like any DM file). Up to two minutes.

## Recording

- `MediaRecorder` on a microphone stream, `audio/webm;codecs=opus`,
  64 kbps. Ask for the microphone only when the button is first pressed,
  and use the microphone chosen in voice settings
  (`voicePrefs.get()`, see `web/src/lib/voice-prefs.ts`).
- While recording, the button shows a red dot and the elapsed time;
  Escape discards. Release sends.
- New `web/src/lib/voice-note.ts`: `record(): { stop(): Promise<Blob>; cancel(): void }`
  and `peaks(samples: Float32Array, count = 48): number[]` (RMS of
  `count` slices, normalised to the loudest). Decoding the blob into
  samples (`OfflineAudioContext`) happens in the component, so `peaks`
  stays pure and testable.
- The message body is `[voice 0:12]`, nothing else, so search and the
  notification preview say what it is. Name the file
  `voice-<unix seconds>.webm`.

## Playing

- `MessageList.tsx` (and the DM file row in `DirectMessages.tsx`): an
  attachment whose name starts with `voice-` and ends `.webm` draws the
  player instead of the file row: play/pause, the waveform as 48 bars
  filled up to the play position, the length. The bars come from
  `peaks()` after the bytes are fetched; nothing is cached. One clip
  plays at a time; starting one stops another.
- The record button appears only where a file could be attached
  (`mayAttach` in `Composer.tsx`; always in DMs).

## Tests

`peaks()` on a generated sine and on silence, in
`web/src/tests/voice-note.test.ts`.

## Not in this job

Transcription, playback speed, recording while in a voice call.
