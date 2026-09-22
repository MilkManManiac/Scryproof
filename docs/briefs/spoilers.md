# Spoiler text

Read `docs/briefs/README.md` first.

## The job

`||like this||` in a channel message is a spoiler: drawn as a blacked-out
run until clicked, then shown, and it stays shown for that message until the
page reloads. Discord's rule, which people already know. A spoiler may
contain a mention or a link; those still work once revealed.

## Where content is split

`splitContent()` in `shared/src/validation.ts` turns a message body into
`ContentPart[]` (text, mention, everyone, link). Add a part kind for a
spoiler that carries its own inner parts, so the renderer can draw the same
things inside it. Keep `splitContent` a pure function; the existing tests
for it (find them with `grep -rn splitContent`) must keep passing, and add
cases: a plain spoiler, a spoiler with a mention inside, `||` with nothing
between (not a spoiler, left as text), an unclosed `||` (text), two
spoilers in one line.

The client draws parts in `MessageContent` in
`web/src/components/MessageList.tsx`. Add the spoiler rendering there, with
one class in `web/src/styles.css`. Hidden: the run's own background colour
as the text colour (nothing readable by highlighting), a hand cursor, an
`aria-label` of "Spoiler, click to show". Revealed: ordinary text. State is
per part, in the component, nothing stored.

`toPlainLine()` in `web/src/lib/mentions.ts` builds the one-line preview
used for replies and notices; a spoiler there should read as `[spoiler]`
rather than leak the text into a pop-up.

## Files

- `shared/src/validation.ts` and its tests
- `web/src/components/MessageList.tsx`
- `web/src/lib/mentions.ts`
- `web/src/styles.css`

## Not the job

DMs (`web/src/state/dms.tsx` draws those separately; leave them). Spoiler
images. A button in the composer.
