# Calls inside a DM

Read `docs/briefs/README.md` first. **Main session, not a cheaper agent:**
it changes how voice rooms are granted and how voice state is keyed.
Written 2026-09-22 so the shape is on paper before anyone starts.

## The job

A call button in a DM's header. Press it and you are in a voice room with
the people in that conversation, camera and screen share included,
encrypted the same way a channel call is. The other side sees the call in
their DM list and joins by clicking; nothing rings (there is no push yet,
and a ring with no way to decline is worse than none).

## What already fits

- `server/src/routes/voice.ts` hands out a LiveKit token for a room named
  by `roomNameForChannel(channelId)` after checking the caller may speak
  there. A DM call is the same token for a room named for the DM id,
  granted when the caller is in `dm_members`. The key exchange in
  `web/src/lib/voice-crypto.ts` is per room and per device and does not
  care what the room is for.
- `VoiceSession` in `web/src/lib/voice-session.ts` takes a channel id and a
  token. It needs a room id and a token; nothing else in it is a channel.

## What assumes a server

- `VoiceState` in `shared/src/types.ts` has `serverId` and `channelId`.
  Add `dmId`, with exactly one of `channelId` and `dmId` set. Every reader
  of `state.voiceStates` (the sidebar, the member list, the profile card,
  the user panel, notify) must treat a DM call as "in a call" without a
  channel name: say "In a call" and, in the DM list, mark the conversation.
- The gateway broadcasts voice state to a server's members. A DM call's
  state goes only to that DM's members.
- `VoiceStage` and `ConnectionPanel` live in `App.tsx` under a server's
  channel. The DM pane needs the same stage above its messages while the
  call is on, and the connection panel wherever it is now.
- Permissions: a server call checks `SPEAK`, `VIDEO`, `STREAM`. In a DM
  everyone in it may do all three; a blocked person may not join a call
  with the one who blocked them (the server refuses the token).

## Files

- `server/src/routes/voice.ts`, `server/src/services/gateway*` (whatever
  fans out `voice_state`)
- `shared/src/types.ts`
- `web/src/lib/voice-session.ts`, `web/src/state/store.tsx`
- `web/src/components/DirectMessages.tsx`, `web/src/components/VoicePanel.tsx`
- `scripts/voice-check.mjs`: a DM call between two of the three test users

## Not the job

Ringing and push. Group DMs themselves (`group-dms.md`), though a group
call is the same room with more people once both exist.
