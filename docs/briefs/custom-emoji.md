# Custom emoji

Read `docs/briefs/README.md` first.

## The job

A server uploads its own emoji. `:name:` in a message draws the image
inline; the reaction picker offers the server's emoji; a reaction with one
shows the image. Someone with `MANAGE_SERVER` (see
`shared/src/permissions.ts`) adds and removes them in the server settings.

## Server

- Schema, `server/src/db/schema.ts`: table `emojis`: `id`, `serverId`
  (cascade), `name` (2 to 32 chars, `[a-z0-9_]`, unique per server),
  `uploaderId`, `storageKey`, `contentType`, `createdAt`. Generate the
  migration with `npm run db:generate` and commit what it writes under
  `server/drizzle/`. Look at the last migration and `meta/` so you commit
  the same set of files.
- Route file `server/src/routes/emojis.ts`, registered in
  `server/src/app.ts` next to the others:
  - `GET /api/servers/:serverId/emojis`: member only. List.
  - `POST /api/servers/:serverId/emojis`: `MANAGE_SERVER`. Multipart, one
    file, PNG, GIF or WebP, 256 KB at most, 50 emoji per server at most.
    The image is stored through the same `saveStream` /
    `buildStorageKey` in `server/src/services/storage.ts` that avatars use;
    read `server/src/routes/profile.ts` for how avatars are received and
    checked, and do the same (including whatever it does to strip metadata
    from the image; if it scrubs, so must this).
  - `DELETE /api/servers/:serverId/emojis/:emojiId`: `MANAGE_SERVER`.
    Removes the row and the object.
  - `GET /api/emojis/:emojiId/image`: member of that server only, streams
    the image with a long `Cache-Control` (the id never changes what it
    points at) and `X-Content-Type-Options: nosniff`.
  - Audit log entries for add and remove (`server/src/services/audit.ts`,
    the way roles do it).
  - Gateway: when the list changes, send the server's members an event so
    open clients refresh; see `server/src/gateway/` and
    `shared/src/gateway.ts` for how role changes are broadcast, and add an
    `emojisChanged` event with the server id.

## Client

- `web/src/lib/api.ts`: list, add (FormData), remove.
- Store: keep the server's emoji list in `web/src/state/store.tsx` beside
  roles, loaded with the server and refreshed on the gateway event.
- Rendering: `splitContent()` in `shared/src/validation.ts` splits a body
  into parts. Add a part kind `emoji` for `:name:` where the name matches
  the pattern; the renderer (`MessageContent` in
  `web/src/components/MessageList.tsx`) draws an `<img>` at text height
  with `alt=":name:"` when the server has one by that name and plain text
  when it does not. Add tests beside the existing `splitContent` tests.
- Composer, `web/src/components/Composer.tsx`: typing `:` and two letters
  offers the server's emoji the way `@` offers members (`mentionQueryAt` in
  `web/src/lib/mentions.ts` is the model). Picking one inserts `:name:`.
- Reactions: `web/src/components/ReactionPicker.tsx` gets a "This server"
  row of the server's emoji. A custom reaction is stored as `:name:` in
  the existing reaction emoji string (check the server-side validation of
  that string in `server/src/routes/messages.ts` and widen it to allow the
  pattern). Reactions render the image where they show the character.
- Settings: a new section in `web/src/components/settings/` for the server:
  the list with a remove button, and an add form (name, file). Only shown
  with `MANAGE_SERVER`.
- Styles in `web/src/styles.css`.

## Files

- `server/src/db/schema.ts`, `server/drizzle/`, `server/src/routes/emojis.ts`,
  `server/src/app.ts`, `server/src/routes/messages.ts` (reaction
  validation only), `server/src/gateway/`, `shared/src/gateway.ts`,
  `shared/src/validation.ts` and tests
- `web/src/lib/api.ts`, `web/src/state/store.tsx`,
  `web/src/components/MessageList.tsx`, `Composer.tsx`,
  `ReactionPicker.tsx`, `web/src/components/settings/`, `web/src/styles.css`

## Not the job

Animated emoji controls. Emoji from one server used in another. DMs.
Unicode emoji picker changes beyond the new row.
