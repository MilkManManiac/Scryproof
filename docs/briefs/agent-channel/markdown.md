# Lane brief: markdown that agents write renders properly (spec phase 3, rendering tier 0)

Read `docs/briefs/agent-channel/preamble.md` first. Ports for this lane: API 8812, web 5182, data dir `.data-markdown`.

## The job

Agents write markdown by reflex: fenced code blocks, headings, lists, tables, block quotes. Today the client renders all of that as literal asterisks, pound signs and pipes. Teach the client's own tokenizer and renderer those blocks, for every message in every channel (people paste code too), without ever turning a message into HTML. This lane runs in parallel with the accounts lane and depends on nothing new.

## Spec sections you implement

5.7 (all). Inline images by attachment reference are in 5.7 too; build them only if the message model already gives you a stable way to name an attachment in the body. If it does not, leave them out and say so in the report (the files phase will settle it).

## Where things are

- The inline tokenizer: `splitContent` and the `ContentPart` union in `shared/src/validation.ts` (from around 200). It already handles bold, italic, strike, inline code, spoilers, links, mentions, role mentions, `@everyone` and custom emoji. Add a block-level pass above it (a new file such as `shared/src/blocks.ts` is fine) that splits a body into blocks (paragraph, fenced code with an optional language label, heading levels 1–3, ordered and unordered lists with one level of nesting, tables with a header row, block quotes) and hands each block's inline text to `splitContent`. Nothing inside a fenced code block is interpreted, exactly like inline code today.
- Mentions must agree with what renders: `parseMentions` in `shared/src/validation.ts` is what the server uses to decide who gets pinged. A mention inside a fenced code block or inline code must not render as a mention and must not ping. Check what inline code does today and make both sides agree; add the test. (The accounts lane converts agents' `@username` to `<@id>` and skips code by the same rule; if you add a shared "outside code" helper, name it in your report.)
- The renderer: `MessageContent` in `web/src/components/MessageList.tsx` (around 654–690). Put the block renderer in its own component file (for example `web/src/components/MessageBody.tsx`) and change `MessageList.tsx` only at the call site, because the accounts lane is editing that file's author line at the same time.
- Other readers of message text: `web/src/lib/mentions.ts` (`toPlainLine` and friends, used for previews and notifications) must keep producing sensible single-line text for a body with blocks (code fences and table pipes are not what a notification should show). Stream chat (`web/src/components/StreamChat.tsx`) and pinned messages use the same renderer or a plain line; check each.
- Styles: `web/src/styles.css`. Code blocks in the existing mono, scroll horizontally rather than wrap, no syntax highlighter. Tables scroll horizontally on a phone rather than squash. Use the theme variables the stylesheet already uses so every theme works.

## Decisions already made

- No HTML parsing, ever. Everything is text → parts → React elements. No `dangerouslySetInnerHTML`, no `innerHTML`, no markdown library.
- Headings are visually modest (a chat message is not a document): at most a step or two above body size.
- An unclosed fence renders as plain text up to the end of the message, not as a swallowed code block that hides the rest (the same rule spoilers follow).
- Edits re-render the same way. Encrypted channels decrypt to the same text and render the same way.

## Tests (each new one red-proofed)

- Tokenizer cases in `web/src/tests/` or a shared test: each block type, nesting limits, an unclosed fence, a fence with a language label, a table with uneven rows, a list that is really a sentence starting with a number ("2024 was a year"), Windows line endings, and a body that is only a code block.
- Mention agreement: a `<@id>` inside a fenced block and inside inline code neither renders as a mention nor appears in `parseMentions`.
- The HTML-sink test: a test that searches the client source (`web/src/**`) for `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` and `DOMParser` and fails on any hit outside an explicit, commented allowlist (there should be none). Red-proof it by adding one sink in a scratch file.
- Existing `markup.test.ts`, `mentions` and message tests keep passing.

## The walk you photograph (capture directory `docs/shots/agent-markdown/`)

Post, as a seeded user, one message containing a fenced code block with a language label, a table, a nested list, a heading and a block quote, plus a message with a mention inside a code block. Photograph the channel at laptop size and at `WINDOW=390,844`, in the default theme and one dark theme, and a notification or preview line for the long message if one shows. Look at each picture before you report.
