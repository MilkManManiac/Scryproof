# The speaking ring lags

Read `docs/briefs/README.md` first. Sonnet.

milky: "check on lag on the light up circle for when someone is talking."

The ring comes from `refreshSpeaking()` in `web/src/lib/voice-session.ts`:
the union of LiveKit's `ActiveSpeakersChanged` (the server's own guess,
which arrives late and lets go late) and `this.mix?.talking()` (our own
ears, from the decoded audio in `voice-audio.ts`). A union is as slow as
the slower of the two to let go, and the server's list only updates a few
times a second.

## The job

1. Measure before changing. Find how often `talking()` is evaluated and
   what threshold and hold it uses, and how often `ActiveSpeakersChanged`
   fires. Put the numbers in your report.
2. Drive the ring from our own ears: for everyone we receive audio from,
   the decoded level with a short hold (on within about 100 ms of sound,
   off about 300 ms after it stops). For **yourself**, the local
   microphone meter that already exists for the settings meter and the
   gate, respecting mute and push-to-talk: a muted person never rings.
   Use the server's list only for people we have no decoded audio for
   yet.
3. Keep `speaking: string[]` in the snapshot and publish only on change,
   as now; the lists (`.voice-member.speaking`, `.member.speaking`,
   `.voice-tile.speaking`) read it and must not change.
4. The pure part (level samples in, speaking or not out, with the hold)
   goes in a small function with a unit test in `web/src/tests/`.

`scripts/voice-check.mjs` checks "the channel list and the member list
both ring alex while he speaks". Keep that true. You may not run it.

## Not in this job

The look of the ring. Anything about screen share (another brief is in
`voice-session.ts` at the same time: keep your change inside the speaking
code so the merge is clean).
