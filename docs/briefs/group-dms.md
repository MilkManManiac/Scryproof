# Group DMs

Read `docs/briefs/README.md` first. **This one is for the main session,
not a cheaper agent:** it touches the E2EE path and every screen that
assumes a conversation has two people. Written 2026-09-22 so the shape is
on paper before anyone starts.

## The job

A conversation between three or more people, made from a member's card or
from the DM list, encrypted the same way a pair's conversation is. Anyone
in it can add someone; leaving is allowed; nobody outside it can read it,
including the server.

## What already fits

- `dm_members` is a real table with one row per person, not a pair of
  columns. Only `dm_channels.pair_key` (unique, `a:b`) assumes two.
- `sealMessage()` in `web/src/lib/dm-crypto.ts` wraps the message key once
  per recipient device, from a list. Three people is a longer list. Nothing
  in the crypto knows the number two.
- `refreshDevices()` in `web/src/state/dms.tsx` already fetches every
  device of everyone in the conversation and assesses each one, so the
  "new device" warnings work per person.

## What assumes a pair

- `pairKeyFor()` and the `pair_key` unique index in `server/src/routes/dms.ts`.
  A group has no pair key: make the column nullable and give the row a
  `kind` (`pair` | `group`) and a `title` (nullable; drawn as the members'
  names when null).
- `api.dms.open(userId)` is the only way to make one. Add
  `api.dms.create({ userIds })` and `api.dms.addMember(dmId, userId)` and
  `leave(dmId)`. Membership checks on every DM route already go through
  `dm_members`; keep it that way.
- `otherMember(dm, selfId)` in `state/dms.tsx`, used by the DM sidebar,
  the pane header, the composer label, the notices, and the notify text.
  Replace with `othersIn(dm, selfId): PublicUser[]` and a `titleOf(dm)`.
- The header's Block button and the "cannot get messages here yet"
  notice are per person; in a group they become per row in a small
  members list, not one button.
- Blocking: a blocked person in a group still cannot write to you. Their
  messages collapse as they do in a channel. Do not drop them from the
  group on your behalf.

## Keys when someone joins or leaves

Old messages stay locked to the devices that existed when they were sent
(that is already the rule; see `sealMessage`'s comment). A newcomer reads
from their join onward. Someone who leaves is simply no longer a
recipient of anything sent after. No re-keying of history: it is not
possible without a key the server would hold, and non-negotiable 8 says
no such key.

## Files

- `server/src/db/schema.ts` and a migration; `server/src/routes/dms.ts`
- `shared/src/types.ts` (`DmChannel.kind`, `title`)
- `web/src/state/dms.tsx`, `web/src/components/DirectMessages.tsx`
- `web/src/components/ProfileCard.tsx` (a "Start a group" action)
- `web/src/lib/notify.ts` (the text of a group notification)
- `scripts/dm-check` or whatever `npm run test:dm` runs: add a three-person case

## Not the job

Calls inside a group; see `dm-calls.md`. Read receipts. Group pictures.

## 2026-09-23: handed to an Opus agent

Built alongside `dm-calls.md` by a second agent. You own `DmChannel.kind`
and `title` and the one migration. Keep header changes in
`DirectMessages.tsx` in their own small component or block, since the call
button lands in the same header. Re-read the DM code first: the recovery
phrase (`dm-recovery.ts`), vouching (`endorsedBy`) and `wrapped_by`
rewrapping landed after this was written; a new member's devices must be
assessed the same way. Blocking and `requireNotBlocked` changed too: in a
group, a block must not stop the other members talking to each other.
