# Discord's features, and which ones Scryproof wants

Asked for by Wes on 2026-09-21, after the first real session on scryproof.com:
go through everything Discord has, then ask him what we care about. The
buckets below are a first guess. He moves numbers between them; his answers get
written back into this file and the milestones in `GAMEPLAN.md` follow from it.

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

## A. Build it (the guess is that he wants these)

1. **DMs**, one to one. Asked for on 2026-09-21.
2. **Group DMs**, a handful of people outside any server.
3. **Desktop app.** Asked for on 2026-09-21. See the Electron note below.
4. **Global push-to-talk**: the key works while a game has focus. Desktop app only.
5. **Share a game window with its sound.** Desktop app only.
6. **Desktop notifications**: a popup when someone mentions or DMs you.
7. **Profile picture and a short bio.** The column exists; there is no way to set it.
8. **Status**: online, idle, do not disturb, invisible, and a custom line of text.
9. **Pinned messages.**
10. **Search** through messages.
11. **Custom emoji** the server uploads itself.
12. **Timeout** a member (mute them for ten minutes without banning).
13. **Stream quality choice** on screen share: 720p / 1080p, 30 / 60 fps.
14. **Phone**: installable from the browser, with push notifications that carry no message content.
15. **`/roll` and a few built-in slash commands.** For the D&D group. Not a bot platform.

## B. Maybe (he decides)

16. **Threads** off a message.
17. **Polls.**
18. **Soundboard** in voice.
19. **Events**: schedule a session, people mark themselves in.
20. **AFK channel**: idle people get moved out of the voice room.
21. **Voice messages** in text channels.
22. **Background blur** on camera. Possible with a model we host ourselves.
23. **Spoiler tags** on text and images.
24. **Saved GIFs.** Discord's GIF picker is Tenor, which is Google, which breaks rule 1. What we can do: upload a GIF once, star it, reuse it from a picker of your own.
25. **Block a user.**
26. **Bookmarks / forwarding** a message to another channel.
27. **"Playing X" game activity.** Desktop app only, and it is metadata we would be choosing to collect.
28. **Webhooks**, so something outside can post into a channel.

## C. Skip (the guess is that nobody here misses these)

29. Friends list. He said no on 2026-09-21: DM anyone you share a server with.
30. Link previews. Already decided: fetching the preview puts a third party in the path whichever end does it.
31. Stickers.
32. Forum channels.
33. Stage channels.
34. Bots and an app directory.
35. In-game overlay.
36. Activities (games and watch-together inside a call).
37. Server folders, discovery, templates, onboarding screens, vanity URLs, announcement channels other servers follow.
38. AutoMod. Nine friends do not need a word filter.
39. Nitro, boosts, shop, quests, avatar decorations, connected accounts.

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

Recommendation: encrypted from day one. It is the point of the project, and
moving people's existing plain DMs to encrypted later is worse than never having
had them.
