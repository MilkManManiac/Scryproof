# Voice changers

Read `docs/briefs/README.md` first. **Opus.** Wes, 2026-09-22: "nice to
have". The README's correction is the starting fact: the microphone goes
to LiveKit untouched today; `MicGate` in `web/src/lib/voice-audio.ts`
listens on a clone and flips the real track's `enabled`.

## The job

Three voices in the voice settings, off by default: Robot, Chipmunk,
Deep. Preview through the settings meter before joining; the choice
sticks (`voicePrefs`). Everyone in the call hears the changed voice. The
encryption is untouched: the effect runs before the track is published.

## How

- New `web/src/lib/voice-effects.ts`: `effectChain(context, input, effect)`
  returning the output `AudioNode`.
  - Robot: ring modulator (input times a 30 Hz to 50 Hz sine) plus a
    little band-pass. Cheap, sounds right.
  - Chipmunk and Deep: pitch shift by a factor (1.5 and 0.7) in an
    `AudioWorklet` doing granular overlap-add: two grains 50 ms long,
    Hann windows, read pointer running at the factor. Put the worklet
    source in `web/public/worklets/pitch-shift.js` (plain JS, no
    bundling) and load it with `audioWorklet.addModule`. Latency budget:
    under 60 ms added.
- `VoiceSession` (`web/src/lib/voice-session.ts`): when an effect is on,
  open the microphone yourself, run it through the chain into a
  `MediaStreamDestination`, and publish the destination's track as the
  microphone (`Track.Source.Microphone`, so the gate, the speaking ring
  and everything downstream see one microphone as before). `MicGate`
  keeps listening on a clone of the raw microphone; the flag it flips is
  the published track's.
- Turning it on or off mid-call swaps the track on the existing
  publication (`replaceTrack`), which keeps the same encryption key and
  the same publication, so the other side sees no change.
- The settings meter (the probe in `voice-audio.ts`) previews the
  chain's output when an effect is chosen, so people hear themselves
  before inflicting it on the table.

## Tests

The grain scheduler as a pure function over a `Float32Array` in
`web/src/tests/voice-effects.test.ts`: a 440 Hz sine at factor 2 comes
out with its zero crossings twice as dense.

## Not in this job

Reverb, echo, presets people upload.
