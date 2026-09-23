# Names just for you, a volume on the card, and the card that will not close

Read `docs/briefs/README.md` first. Sonnet. One commit per part.

## 1. The profile card does not close on an outside click

`web/src/components/ProfileCard.tsx` closes on `mousedown` outside its
box (a window listener added on the next tick), but people report that
clicking elsewhere leaves it open. Something stops the event before it
reaches `window`: a `stopPropagation` on mousedown somewhere, or pointer
handling in the voice panel. Search for `stopPropagation`,
`onMouseDown` and `onPointerDown` in components, and consider clicks on
the voice panel, the member list and the message list. The fix is most
likely listening in the capture phase (`addEventListener('mousedown',
onDown, true)`, or `pointerdown`), which nothing below can stop. Say
which click was failing.

## 2. Names just for you

Wes: "let each person rename someone even if it's just on their end". A
per-device map from user id to a name, in localStorage (a small module in
`web/src/lib/`, kept the way `voice-prefs.ts` keeps its settings, with
try/catch around storage). Set from the profile card: "Call them..."
opens a small field; empty clears it. It wins over the server nickname
and the display name **everywhere a name is shown**: member list,
messages, voice panel and tiles, mentions as displayed (not the `<@id>`
text that is sent), DMs, and the profile card itself, with the real name
under it in small text so you still know who it is. Today's helpers:
`nameOf` in `web/src/lib/mentions.ts`, `useNames()` in `VoicePanel.tsx`,
`nameOf` in `DirectMessages.tsx`, and `nickname ?? displayName` patterns
(grep `nickname ??`). Route them through one function so a local name
applies in one place. Changing a local name updates the screen without a
reload.

Server nicknames stay as they are.

## 3. Volume on the profile card

For someone in the same call as you, the card shows their volume slider:
the same per-person volume the voice panel uses (`voice-prefs.ts`
`volumes`, applied by `voice-session.ts`). Not for yourself, not for
people outside your call.

## Tests

The local-names module gets a unit test in `web/src/tests/`.

## Not in this job

Syncing local names between devices. Server nicknames.
