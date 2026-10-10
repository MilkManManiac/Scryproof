# Pass-along round eight: vocals that prove themselves, a longer song, UI, and the app-audio installer

## Summary (write this last, for Wes, plain English)

_Empty until the build is done. Then: what you can do now, how to try it, the screenshots, what does not work yet, three things to try, check results, and whether it ran on a real mic._

---

**Who this is for:** the model in Wes's session, building in order from this file (build-spec skill: cloud is parked, build here). Wes will not answer mid-build. Never stop to ask. Make the call and log it under "Decisions I made".

**Phase:** exploring, still. "Is this fun" beats polish. Placeholders fine, numbers are dials.

**Deploy:** NOTHING publishes without Wes's word, each time (memory `pass-along-no-deploy.md`; round six went out unasked on 2026-10-09 and he said "Ok again don't deploy till i say so"). The "Ready to publish" section at the bottom is a checklist to run only after he says go.

## His words (the spec)

2026-10-09, after trying round six in the app:
- "Ok again don't deploy till i say so."
- "I think we kinda just let people add as much as they want to the song." (built, round seven)
- "Then this next thing we wont push but we should think about how to turn this into a longer thing/song."
- "Maybe some more UI improvements."
- "Then also let the creator delete one of the projects aka songs." (built, round seven)
- "Then how does it work when multiple people are working." (built, round seven: presence, own ids, poll merge)
- "Also i don't think the vocals work"
- "also, when i stream spotify and include sound...it shows other games volumes"
- "plan the build for all these. don't deploy but get ready to"
- 2026-10-10: "Hold off on the longer song thing. Not just delete a section but also delete a song if its shit. Then deploy" (round seven published 2026-10-10 03:30 ET; part B is ON HOLD; deleting a whole song is already in: the creator's Delete on the list and in the loop)

Earlier, still binding: "make the volume significantly quieter in general", "Let people add vocals", "let people add more than one melody", "sometimes i wanna go to a lower octave", "an individual session that's like saved... over the course of the day people can jump back in and see how it's progressing."

## Ground rules

1. Work on `main`, as rounds one to seven did; the spike folder is not in the app build and the only gate that matters is the publish, which waits for his word. Push after every phase. No Co-Authored-By or Claude lines in commits.
2. **Files you may change:** `docs/spikes/passalong.js`, `docs/spikes/passalong.html`, `docs/spikes/store/store.mjs`, `docs/shots/passalong-proto-8*.png`, `docs/HANDOFF.md`, this file. For the picker text only: `web/src/lib/activities.ts` and `web/src/changelog.ts` (that is a client release later, not part of the publish script). The app-audio part has its own fence in `docs/SPEC-app-audio.md`.
3. No new dependencies. The store stays zero-dep node; the page stays one script plus Kombinat.
4. Stuck rule: two honest attempts, log it under Open problems, move on.
5. Paid-for lessons: bash heredocs with apostrophes break in this shell, write patch scripts with the Write tool and run them with python; the page runs under a CSP with no inline scripts, so Playwright `evaluate` strings are blocked, drive it with selectors and `context.request`; a stale local store process must be killed with PowerShell `Stop-Process` (pkill does nothing); no `alert`/`confirm`/`prompt` in the app frame (no allow-modals), use `say()`; localStorage may be denied in the frame (`stored()` guards it); the page must postMessage ready to its parent.
6. Old loops on the box (four as of 2026-10-10) must still open after the store restarts. Migrate on read, never by hand.

## Read first

- `docs/spikes/passalong.js`: head (TICKS 64, CHORDS, KEY, presets, KITS, FX), then `KINDS`, `makeLayer`, `tick`, `record`/`armed`, `draw`, `apply`, `openLoop`, `working`, `save`, `showLoops`, `del`.
- `docs/spikes/store/store.mjs`: the API comment at the top, `layerFrom`, `api()`.
- `scripts/activities/publish-pass-along.sh`: what a publish does (page + store + nginx + service restart).
- `docs/HANDOFF.md` top block for round seven; the scratchpad test `loops7.py` is the two-person headless run to extend.
- `docs/SPEC-app-audio.md` for part F.

## The design

### A. Vocals that prove themselves (first, because he says they do not work)

Nothing is known about what he saw. The headless fake-mic run records and plays back, so the failure is either permission (desktop app before 0.5.7, or the browser denying the frame) or something only a real mic and real ears show. Build instruments, not guesses:

- **Mic meter while armed and recording:** an AnalyserNode on the mic stream drives a small level bar on the clip row. If the bar never moves, the mic is dead or wrong. Label: `mic` with the bar.
- **Countdown at the top:** while waiting for tick 0, the clip row shows `recording at the top in 3, 2, 1`; while recording, the clip row fills left to right with the play head. After stop: `got 5.0 s` plus a `Play it` button that plays the clip alone, once, right now (not on the loop).
- **Plain failure text:** keep the orange `say()` but name the three cases: `NotAllowedError` in a frame = "the app said no to the mic; update the desktop app to 0.5.7 or newer (Settings, About)"; `NotFoundError` = "no microphone found"; anything else = the error name.
- **Headphones note** on the record button hover: "wear headphones or the loop bleeds into the recording".
- **Device choice:** if `enumerateDevices` lists more than one audioinput, a select on the vocals layer (labels only show after permission; that is fine).
- Check on this PC with the real mic (Edge, local dev page): say something, the bar moves, `got N s`, `Play it` plays it, Save it stores it, reload plays it on the loop. Then the same against the live site in Edge (vocals are already live there) to prove the published path. Record the result: if the live site fails here too, that is his bug and it is fixed before anything else in this spec.

### B. ON HOLD (Wes, 2026-10-10: "Hold off on the longer song thing"). A longer song: sections

Thinking was done on 2026-10-10 (reply to Wes): sections beat a longer loop. A song is a list of 8-count sections, each built exactly like a loop today, and an order like `A A B A`.

**Store:**
- Loop gains `sections: { [sid]: { name, chords, layers: {} } }` and `order: [sid, ...]`. `sid` is one letter a to h (eight sections at most, a dial). `layers` moves inside the section. `working` and `key` stay on the loop.
- Migration on read (`read()`): a loop with top-level `layers` and no `sections` becomes `{ sections: { a: { name: 'A', chords: 'Am F C G', layers } }, order: ['a'] }`, written back on the next write only.
- `POST loops/:id/sections { name, chords }` adds the next letter, returns the loop. `PUT loops/:id/sections/:sid/:layer` is today's layer save, same 409/429 rules, 24 layers a section. `PUT loops/:id/order { order }` anyone, last write wins, every sid must exist, 1 to 32 entries. `DELETE loops/:id/sections/:sid` creator key only, refuses the last section.
- `chords` is a string from a fixed list the page knows (see page); the store clamps to 24 chars.
- `list()` reports `sections: n`, `layers: total`, and `done` flattened across sections for the who-did-what line.
- Keep `PUT loops/:id/:layer` working for one release (writes into section `a`) so a page cached from round seven does not break the moment the store restarts.

**Page:**
- Chords become per section. `CHORDS` the constant becomes `PROGRESSIONS`, a short list in A minor the picker shows by name: `Am F C G`, `Am G F E`, `F G Am Am`, `Dm Am E Am`, `Am C G F`, `C G Am F`. `chordAt(tick)` reads the current section's progression. Pad chord rows and the tinted fitting cells follow it.
- A **section strip** above the add bar: one tab a section (`A`, `B: chorus`), the open one lit, `+ Section` on the right (name box inline, progression select, `Add`). Clicking a tab shows that section's layers; `live` is the open section's layers. Add bar, Save it, Save all mine, presence: all per open section.
- A **song line** under the strip: the order as chips `A A B A`, click a chip to remove it, a `+` after it with the section letters to append, drag not needed. Saved with `PUT order` on change. Shown to everyone, anyone can change it (same spirit as BPM).
- **Play** plays the open section looping, as today. A second button **Play the song** plays the order end to end, looping the whole thing, switching the layer set at each section boundary (the tick engine gets `songPos`; at tick 0 it loads the next section's layers into the audio set; the section tab follows along so the screen shows what is playing). Notes and clips are all TICKS long, so a boundary is just a tick-0 swap. Section tabs show a small play mark while that section plays.
- Vocals are per section (a clip lives in a section's vocals layer).
- Solo mode gets sections too (local only), so he can try it without a friend.
- Loop list: `3 sections, 11 layers: Wes: bass, melody; Matt: kicks...`.
- Old `?s=` links open at section A.

Edge cases: removing the last chip of the order leaves `order` empty and Play the song says "pick an order first"; a deleted section is dropped from the order; adding a ninth section is refused with a plain line.

### C. UI improvements (he gave no specifics: build the cheap ones, show the rest as alternatives)

Build in this round:
1. **Sticky top bar.** Play, Play the song, section strip and the add bar stay at the top while the layers scroll (position: sticky). With sections the page gets long.
2. **Copy link** button replaces the read-only link box (clipboard write; falls back to selecting the text when the frame denies clipboard).
3. **Name before save.** Saving with no name saves as "someone" today. If the name box is empty, the first Save it shows an inline name box next to the button and waits for it. No modal.
4. **Compact saved layers.** A saved, shut layer shows one row of its notes squashed into a 15 px strip (a canvas drawn from `notes`, all rows stacked), not the full grid. Knobs opens the full grid, read-only, as now.
5. **Phone width.** Under 700 px the label column drops to 90 px, the grid scrolls sideways inside its row, and the add buttons wrap. Check at 390 px in headless.
6. **Saved toast.** When the 15 s poll brings in a new layer, `say()` one line, "Matt saved a melody", cleared after 6 s.

Show as alternatives (screenshots in the summary, not built): a dark/light scheme switch; a waveform on the vocals clip; a metronome click while recording.

### D. Delete (built round seven)

Done: creator key, two-click delete on list and in loop. This round adds `DELETE sections/:sid` (creator) with the same two clicks on the section tab, and nothing else. Decision for Wes to overrule: a friend cannot remove their own saved layer. If he wants that, each save returns a layer key stored under `pa.key.<loop>.<layer>` and a `DELETE .../:layer` honours it; one phase, not built now.

### E. Several people at once (built round seven)

Done: own ids, presence line, poll merge. This round: presence names the section ("Matt is on kick & snare in B"), the saved toast from C6, and order changes merge on poll. Not building: live note-by-note editing of one layer by two people. That is a different product.

### F. Spotify and other games in a shared stream (his "it shows other games volumes")

That is `docs/SPEC-app-audio.md`, written 2026-10-06, unbuilt: a C# helper compiled by the csc.exe that ships with Windows captures one program's sound (process loopback), the desktop shell pipes it to the page, music share and screen share send only the picked program. It needs a **new installer**: the spec said bump to 0.5.6; the shell is now 0.5.7, so the bump is **0.5.8**, and `share-menu.js` must be re-read for what changed since. It is a separate run, on branch `app-audio`, after parts A to E: Phase 0 of that spec (the two facts: HWND is real, probe says ok) comes first and decides whether the rest is worth doing; stop rule three hours. The installer gets built and signed, not published, until his word.

## Phases (each ends runnable, with one check and a push)

**Phase 0: baseline.** Local store up on 8766 (`node docs/spikes/store/store.mjs --port 8766 --dir "$TEMP/pa-loops" --static docs/spikes`), `loops7.py` passes, note the time. Then part A with a real mic on this PC, local and against the live site. Shot `docs/shots/passalong-proto-8-vocals.png` (the mic bar moving, `got N s`). Push.

**Phase 1 (ON HOLD with part B): store sections** with migration and the compatibility PUT. Check: copy a round-seven loop JSON into the dev dir, GET it, see one section `a` with its layers; `loops7.py` still passes against the new store with the old page. Push.

**Phase 2 (ON HOLD with part B): page sections and the song.** Strip, song line, per-section chords, Play the song. Check: `loops8.py` (new, from loops7): A makes section A with bass, adds B "chorus" with a different progression and a melody, sets order `A A B A`, Play the song runs and the lit tab changes at the boundary (poll the `.sec.playing` selector); B jumps in, sees two sections, adds kicks to B, saves; A's poll shows it with the toast. Shot `passalong-proto-8.png`. Push.

**Phase 3: UI batch** (C1 to C6). Check: headless at 1300 and at 390 wide, shots `passalong-proto-8-phone.png`; `loops8.py` still passes; zero page errors. Push.

**Phase 4 (ON HOLD with part B): delete a section, presence per section.** Check: in `loops8.py`, A deletes section B, the order drops its chips, B's next poll says so. Push.

**Phase 5 (own run, own spec): app audio**, `docs/SPEC-app-audio.md`, version 0.5.8, branch `app-audio`, Phase 0 first.

Full checks once at the end: `loops7.py` and `loops8.py` locally; `node --check` on the store; `bash -n` on the publish script. The client is untouched unless the picker text ships, then `npm run typecheck` and the web suite.

**Must never happen:** a publish, release or installer upload without his word; a loop already on the box failing to open after the store restart; a recording started without the mic bar on screen; a note or clip of one section playing in another; the creator key leaving the box.

**Stop rule:** stop after Phase 4, or at three hours of building, or if Phase 0 shows vocals failing on the live site (fix that, write the summary, stop).

## Ready to publish (run only after Wes says go, each time)

Round seven went out 2026-10-10 03:30 ET on his "Then deploy" (release `e155a299e35b`). Lesson from that publish: the headless two-person run is flaky against the live site because `showLoops()` leaves the old list on screen while it fetches, so a test that reads the list right after Leave reads the stale one; wait for the new loop's name in the list text before asserting. The page is fine (a moment of stale list), the test was wrong.

The box as of 2026-10-10 01:00 ET, checked read-only: `pass-along-store` active, 4 loops in `/var/lib/pass-along-store`, live release `9191a93bb812` (round six), installer.json says 0.5.7.

1. `git status` clean, `bash -n scripts/activities/publish-pass-along.sh`.
2. `bash scripts/activities/publish-pass-along.sh` (page, store, nginx, service restart; prints the four 200s).
3. `python loops8.py https://activities.scryproof.com/pass-along/ docs/shots/passalong-live-8.png`, then delete the robot loop from the list with its key (the script does it).
4. Open the four old loops from the live list: each shows one section with its layers.
5. HANDOFF top block: LIVE, time, what was proven. Push.
6. Picker text (optional, client release via `scripts/release.sh`, needs a dated changelog entry): `activities.ts` description still says "five layers". Only if he says deploy the client too.
7. App audio: `cd desktop && npm run dist`, then `scripts/publish-installer.sh`, only on his word, only after its own spec summary is written.

## Decisions I made

- Sections are the longer song, not a longer loop (reasoning in the 2026-10-10 reply: 32 bars of hats is nobody's idea of fun; sections keep the 8-count unit he liked).
- Anyone can change the order and chords of a section, like BPM today; only the creator deletes.
- A friend cannot remove their own saved layer (see D).

## Open problems
