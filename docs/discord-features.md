# Discord's features, and which ones Scryproof wants

Asked for by Wes on 2026-09-21, after the first real session on scryproof.com:
go through everything Discord has, then ask him what we care about. He
sorted a first guess by voice the same evening; what follows is his sort.

"Have" was checked against the routes and components on 2026-09-21, not
remembered.

## Already built

Servers, categories, text channels, drag to rearrange. Invite links with expiry
and revoke. Roles, per-channel and per-category permissions, audit log. Kick,
ban, nicknames, transfer ownership. Messages with edit, delete, replies,
reactions, mentions, uploads, typing, presence, unread marks and mention badges,
per-channel notification settings, basic text formatting. Quick switcher and
keyboard shortcuts. Voice with mute, deafen, push-to-talk (in the browser tab
only), input threshold, per-person volume, device choice, join and leave
sounds, the browser's own noise suppression, server mute / deafen / disconnect.
Video. Screen share. Two-factor sign-in. All voice and video end-to-end
encrypted, which Discord only started doing in 2024 and does not do for text at
all.

## Wes's answers (2026-09-21)

Numbers are kept from the first draft so his answers can be traced.

### Build

1. **DMs**, one to one.
2. **Group DMs.**
3. **Desktop app** (Electron, see below).
4. **Global push-to-talk.** Desktop app only.
5. **Share a game window with its sound.** Desktop app only.
6. **Desktop notifications** for mentions and DMs.
7. **Profile picture and a short bio.** The column exists; there is no way to set it.
8. **Status**: online, idle, do not disturb, invisible, and a custom line.
9. **Pinned messages.**
10. **Search** through messages.
11. **Custom emoji** the server uploads itself.
13. **Stream quality choice** on screen share.
14. **Phone**: installable, with push that carries no message content. "Phone version is a yes."
18. **Soundboard.** Moved up from maybe: "soundboard yes."

### Later (wanted, not now)

17. **Polls.** "I really care about polls", for later. First in line from this pile.
12. Timeout a member. "Not super worried."
15. `/roll` and built-in commands. "Not crazy important right now."
16. Threads.
19. Events.
20. AFK channel.
21. Voice messages.
22. Camera background blur.
23. Spoiler tags.
24. Saved GIFs. "Not right now."
25. Block a user.
26. Bookmarks and forwarding.
27. "Playing X" game activity.
28. Webhooks.
29. Friends list. "Doesn't really matter I don't think", so a maybe rather than a no.

### Skip

30. Link previews. "Who cares."
31. Stickers. 32. Forum channels. 33. Stage channels. 34. Bots and an app
directory. 35. In-game overlay. 36. Activities. 37. Server folders, discovery,
templates, onboarding. 38. AutoMod. 39. Nitro, boosts, shop, quests.

## Electron or Tauri

`GAMEPLAN.md` says Tauri. Wes said Electron. Electron is the better call here
and the plan should change. Tauri uses whatever browser engine the operating
system ships, so voice encryption and screen capture would behave differently
on Windows, Mac and Linux, and each would need testing. Electron carries its
own Chrome, the same engine the app was just proven in, and Discord is built on
it for the same reason. The cost is a 100 MB installer instead of 10 MB. What
does not change is the security requirement from GAMEPLAN 1b finding 2: the
client ships inside the installer, and updates are signed with a key that lives
on Wes's PC and never on the box.

## The one real decision inside DMs

In a channel everybody knows the server owner can read along. A DM is different:
if DMs are stored the way channel messages are, Wes can read two friends' private
conversation out of the database, and so can anyone who ever gets into the box
while it is unlocked.

- **Encrypted from day one.** The keys voice already uses are enough for two
  people. The server stores scrambled text. The cost: until key backup is built,
  signing in on a new device shows DM history as locked.
- **Plain first, encrypted later.** Faster to build, history follows you
  everywhere, and the app must not call DMs private until that changes.

Recommendation, which Wes was shown and did not argue with, so it stands unless
he says otherwise: encrypted from day one. It is the point of the project, and
moving people's existing plain DMs to encrypted later is worse than never having
had them.
