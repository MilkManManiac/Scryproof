# The small wants

Read `docs/briefs/README.md` first. Sonnet. Four small things from the
group's #ideas-suggestions channel. One commit each.

1. **Start a DM from the Direct messages list.** A "+" at the top of the
   list (`web/src/components/DirectMessages.tsx`, the "Direct messages"
   header) opens a picker of everyone who shares a server with you (from
   the store's server members, deduplicated, not yourself, not people you
   blocked), with a filter box. Picking one opens the DM the same way the
   profile card's message line does (`openWith(userId)` from the DM
   state).
2. **Interface scale.** In the theme or profile settings (pick the one
   that fits and say which), a row of steps, 90, 100, 110, 120 and 130
   percent, that sets the root font size and is remembered on this device
   (localStorage, with try/catch). Check that the app's sizes are in rem
   or em so it actually scales; where key ones are px, list them in the
   report rather than converting the whole stylesheet.
3. **The style buttons nobody saw.** Wes did not notice the B I S <>
   buttons under the message box (`web/src/components/MarkupTools.tsx`,
   styles under `.markup-tool` in `web/src/styles.css`). Make them
   visible at a glance: readable at rest, not only on hover, a size you
   can hit, and each letter styled as what it does (bold B, italic I,
   struck S, monospace <>). Small and quiet still; no text labels.
4. **The pregnant man emoji.** Add U+1FAC3 (pregnant man) and U+1FAC4
   (pregnant person) to the emoji list (`web/src/lib/emoji.ts`) as
   `pregnant_man` and `pregnant_person`, and check that both the picker
   and typing `:pregnant_man:` find them.

## Not in this job

Anything else in the DM view: another brief adds drafts to
`DirectMessages.tsx`, so keep to the header and your picker.
