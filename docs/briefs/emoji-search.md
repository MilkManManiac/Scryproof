# Emoji search in the picker

Read `docs/briefs/README.md` first. Sonnet. Written 2026-09-23
(BUILD-ORDER item 15b).

Wes: "pregnant man emoji isn't in". It is, as `:pregnant_man:` in
`SHORTCODES` (`web/src/lib/emoji.ts`), but the picker
(`web/src/components/ReactionPicker.tsx`) shows only 32 chosen emoji plus
recents, so most of the list has no screen.

## The job

A search box at the top of the picker, focused when it opens. Empty: the
picker looks as it does now. Typing: the grid becomes every `SHORTCODES`
entry whose name contains what was typed (underscores and spaces treated
alike, so "pregnant man" finds it), best matches first (name starts with
the text, then contains it), capped at a sensible number. Hover or title
shows the `:name:`. Enter picks the first result; Escape clears the box,
then closes. Choosing one counts as a recent, as picking does today.

The picker is used by `Composer.tsx`, `DirectMessages.tsx` and
`MessageList.tsx` (reactions); all three get it for free. Server custom
emoji (`custom-emoji.md`), if the picker shows them, should be searchable
by name too.

Unit test the matching function. Screenshots are the main session's job.

## Not the job

Categories, skin tones, a new emoji list.
