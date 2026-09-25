/**
 * What changed, for the people using it. Shown behind "What's new" in the
 * menu under your name. Newest first. Add an entry for every release: the
 * release script refuses to ship when the top entry is not from today, so
 * this does not quietly go stale.
 *
 * Written for a friend, not a developer: what they can now do, in the words
 * they would use. No file names, no "refactor", no "fix a bug" without
 * saying what was wrong.
 */

export interface Release {
  /** Unique; what "seen" is remembered by. Date plus a word. */
  id: string;
  /** ISO date of the release. */
  date: string;
  title: string;
  notes: string[];
}

export const CHANGELOG: readonly Release[] = [
  {
    id: '2026-09-25-clipper',
    date: '2026-09-25',
    title: 'Cut any song into a sound',
    notes: [
      'Adding a sound now takes any song or audio file. Drag the orange box over the part you want, up to 15 seconds, and only that part is uploaded.',
      'Press Play to hear exactly your pick, and set its volume before you add it. That becomes the volume everyone hears it at; each person can still turn all sounds down for themselves.',
      'There is a short tour of how Scryproof works. It shows once, and you can open it again any time from the menu under your name: "How Scryproof works".',
    ],
  },
  {
    id: '2026-09-25-soundboard',
    date: '2026-09-25',
    title: 'Soundboard: your volume, longer clips',
    notes: [
      'The soundboard has its own volume now, at the top of the board and in Voice settings. Turn it all the way down and nobody\'s sounds reach you.',
      'Sounds can be up to 15 seconds long.',
      'If you can manage a server, add a sound straight from the board: the last tile is "Add sound".',
      'Encryption got stricter against a server that lies. A fake message the server slips into an encrypted channel shows as fake, and a channel key only ever goes to devices someone here let in. The desktop app has an update for this; install it when it asks.',
      'This card is new too. It shows up here after each update until you open it or close it.',
    ],
  },
  {
    id: '2026-09-24-expiry',
    date: '2026-09-24',
    title: 'Messages that do not last',
    notes: [
      'A channel can now keep its messages for 1 day, 7 days, 30 days or 90 days instead of forever. Pick it under "Messages last" in the channel settings.',
      'Past that, messages are deleted from the server for good, pictures and files too. Nightly backups still hold them for up to a month.',
      'A channel set this way says so under the message box.',
    ],
  },
  {
    id: '2026-09-24-waiting',
    date: '2026-09-24',
    title: 'See who messaged you',
    notes: [
      'When someone DMs you, their picture shows up under the @ button on the left with how many messages are waiting. Click it to go straight to the conversation.',
      'In a server, the member list shows the same count next to anyone who has messaged you. Click the number to open the conversation.',
      'Clicking someone opens their card ready to type: just start writing and press Enter to send them a message.',
    ],
  },
  {
    id: '2026-09-23-calls',
    date: '2026-09-23',
    title: 'Calls like Discord, and it rings',
    notes: [
      'Calls look like Discord now: everyone is a big tile with their profile picture, and the buttons along the bottom are mute, deafen, camera, screen, quality and hang up.',
      'When two people share their screens, both play side by side. Click one to watch it big; the grid button puts everyone back.',
      'The sliders button in a call sets your screen share quality and how sharp the streams you watch are, without leaving the call. It changes a share that is already running.',
      'Calling someone in a DM rings them: a card pops up in the corner with a soft ring, and they can answer or ignore it. On Do not disturb it shows but stays quiet.',
      'Messages use the whole width of the window instead of stopping halfway.',
      'Only the host can make new servers for now. Use an invite to join one.',
    ],
  },
  {
    id: '2026-09-23-notes',
    date: '2026-09-23',
    title: 'Screen share picker, every emoji, and your notes',
    notes: [
      'Sharing your screen in the desktop app shows live pictures of each screen and window to pick from, with a sound switch, like Discord. (The app updates itself to get this.)',
      'The emoji picker has every emoji now, in categories you can scroll through, with skin tones. Search still works.',
      'A channel or DM always opens at the newest message. Before, pictures loading late could push you back up.',
      'Right-click someone in a voice channel for their volume and "Mute for me". Only you hear the difference.',
      'The picture viewer: clicking the picture no longer zooms it. Scroll to zoom, double-click to fit it back, click outside to close.',
      'The emoji and Tang buttons in the message box line up with the rest.',
      'Hitting the limit on jumping characters now says so, and how long to wait, instead of doing nothing.',
      "In a group DM, one member can no longer post a message that shows up under another member's name. Older group messages, from before this, are marked \"sender not proven\".",
      'Leaving a group DM takes you out of its call.',
      'The house rule got a lot harder to dodge. Spaces, dots, numbers for letters, accents and look-alike letters are all caught, in names too.',
    ],
  },
  {
    id: '2026-09-23-sealed',
    date: '2026-09-23',
    title: 'Encrypted channels',
    notes: [
      "A text channel can now be end-to-end encrypted, like DMs. Tick \"End-to-end encrypted\" when you make one. Messages are locked on your device, and the server keeps only scrambled bytes it has no key for. Anyone looking at the server's database, Wes included, sees gibberish.",
      'Everyone in the channel reads everything, history included. Someone new is handed the key by whoever is online. Someone who leaves or is removed gets nothing written after they go.',
      'The Encrypted button at the top of the channel shows who holds the key. If a friend signs in on a new phone or computer, it says so there, and they get the key once you (or anyone else in the channel) press Accept.',
      'Pictures, files and voice messages work in an encrypted channel too, locked on your device before they are sent. The server holds only scrambled bytes; even the file name is inside the lock.',
      'A channel that already exists can be switched on: Channel settings, "Turn on encryption". It cannot be switched off again. Messages from before stay as they were, and a line in the channel marks where encryption started. Editing an old message locks it.',
      'What an encrypted channel cannot do: search, polls, /roll and initiative. The server would have to read them. Who posted, when, reactions and who was mentioned are not hidden.',
      'Every message is signed by the device that sent it, so nobody, in the channel or on the server, can post in your name.',
      'Editing a message now updates the quote above every reply to it.',
    ],
  },
  {
    id: '2026-09-23-fifth',
    date: '2026-09-23',
    title: 'Group DMs, calls in a DM, and an app that updates itself',
    notes: [
      "Group DMs: pick two or more people with the + at the top of Direct messages, or \"Start a group\" on someone's card. Still end-to-end encrypted. Anyone in it can add someone, and you can leave. Someone added later reads from when they joined, not before.",
      "A Call button at the top of any DM, with camera and screen share, encrypted like a channel call. Nothing rings: the others see the call marked in their list and click to join. Starting a DM call takes you out of any voice channel you are in.",
      "The emoji picker has a search box. Type part of a name to find one.",
      "The desktop app now updates itself. When a new version is out it downloads in the background, checks it really came from us, and offers \"Restart to install\". This is the last installer anyone has to run by hand.",
      "The desktop app is also locked down against other programs on your computer borrowing it, and your saved sign-in is now encrypted on disk. You stay signed in.",
    ],
  },
  {
    id: '2026-09-22-fourth',
    date: '2026-09-22',
    title: 'Drafts, names of your own, and better screen sharing',
    notes: [
      "Half a message is no longer lost when you click another channel or DM. It is waiting when you come back, until you close the app. It is never saved to disk.",
      'Call someone whatever you like, just for you: click their name, then "Call them...". Everywhere you see them, you see your name for them. Nobody else sees it, and they are not told.',
      'Sharing your screen now asks whether to include sound, and it starts off. In the desktop app, "with sound" means everything your computer plays, the call included, so two people sharing with sound can echo.',
      "If your share stops without you pressing Stop, it now says why. If someone's screen freezes, their picture says so instead of just sitting there.",
      'A Screen sound slider on a shared screen, separate from their voice. On a camera, "Hide for me" stops it coming to you at all.',
      'The green ring for whoever is talking follows the sound itself now, so it lights and lets go right away instead of lagging behind.',
      'Account, in the menu under your name: change your password, and turn on two-factor (a code from an app on your phone when you sign in).',
      'If you forget your password, ask Wes. He can give you a temporary one, and the app asks you to choose a new one straight away. Your DMs are not affected.',
      'The + at the top of Direct messages starts a conversation with anyone you share a server with. Their profile card has their volume slider when you are in a call together.',
      'In the desktop app: right-click for spelling suggestions, copy and paste, and Copy image or Save image. Themes has an interface scale, 90 to 130 percent.',
      'The B, I, S and <> buttons under the message box are easier to see. And the pregnant man is here.',
      'Clicking away from a profile card closes it, including while a settings window is open.',
      '"again" on a jump now sends it across for everyone looking, not just you.',
    ],
  },
  {
    id: '2026-09-22-big-one',
    date: '2026-09-22',
    title: 'The big one',
    notes: [
      'Polls. `/poll Which night? | Friday | Saturday | Sunday` and everyone votes by clicking. `/poll*` lets people pick more than one. The author, or a moderator, can close it.',
      "Coming up. A server can plan sessions, at the top of the channel list, and everyone says Going, Maybe or Can't. An hour before, the people who said yes get a reminder in their notifications. Planning needs the new Manage events permission.",
      'Voice messages. Hold the microphone beside Send, talk, let go. It plays in place with a waveform. In a direct message the clip is locked like any other file there.',
      'Saved. Hover a message and pick Save. They are behind the Saved tab in your notifications, and nobody else knows.',
      'Initiative. `/init` in a channel puts a turn order above the box that everyone sees: add yourself with a number or a roll, Next moves the turn, and whoever started it (or a moderator) runs the fight.',
      'Soundboard. A server uploads short sounds under Settings, Sounds. In a call, the speaker button beside mute plays one for everyone, encrypted like your voice.',
      'Voice changer. Robot, Chipmunk and Deep, in the voice settings. It changes your voice on your own device before anything is sent.',
      "Invite links open a join screen now, with the server's name and a Join button, instead of dropping you on the normal screen to type the code again.",
      'A character jumping across now shows for everyone in the server, whichever channel or voice room they are on. Before, anyone who had joined voice only saw the first one, because joining put the voice channel in front of them and the rest went quietly into the history of the text channel.',
      'Typing `/` or `:` in a direct message shows the same list as in a channel. Right-click a channel for Delete channel, if you may manage channels; it asks once more before it goes.',
    ],
  },
  {
    id: '2026-09-22-commands',
    date: '2026-09-22',
    title: 'Commands, and the characters',
    notes: [
      'Type `/` at the start of a message to see the commands. `/tang-jump` sends Tang jumping across the room for everyone in the channel, and every character from the Meepo game is there. The little face button beside Send opens the whole board, one click each.',
      '`/shrug`, `/tableflip` and `/unflip` do what they say. `/roll 2d6+3` was already here.',
      'Emoji by name: `:+1:`, `:fire:`, `:skull:` and a few hundred more turn into the emoji when you send. A list appears as you type the name. The smiley button beside Send opens the picker to put one in.',
      'A small `+` after the reactions on a message adds another one without hunting for the hover menu.',
      'Editing a message has the same style buttons and keys (Ctrl+B and friends) as writing one.',
      'The dusk theme is now called Ham. Same theme, same clouds; if you had it picked, you still do.',
    ],
  },
  {
    id: '2026-09-22-loaf',
    date: '2026-09-22',
    title: 'Loaf and Forg',
    notes: [
      'Two themes made for two people. Loaf: a hundred of his face, cut out and glued down like a five-year-old did it, and a few of them float around. Forg: a pond at dusk with fireflies, ripples on the water, and a frog who is very pleased with himself.',
    ],
  },
  {
    id: '2026-09-22-dusk',
    date: '2026-09-22',
    title: 'The dusk, and this list',
    notes: [
      'A new theme, The dusk: pink clouds under a night sky, with stars, a moon, shooting stars now and then, and a little glitter in the clouds. Themes are in the menu under your name.',
      'This list. A dot on your name means there is something here you have not read.',
      'After joining a server, the people already in it sometimes showed as "Someone" until you reloaded. Fixed.',
    ],
  },
  {
    id: '2026-09-22-evening',
    date: '2026-09-22',
    title: "Lamp's list",
    notes: [
      'Click any name or picture and a card opens beside it: who they are, their roles, where they are in voice, and a line to send them a message. Clicking your own opens your profile.',
      'Click a picture in chat to see it full screen. Scroll to zoom, drag to look around, and there are Copy and Save buttons.',
      'Text styles: **bold**, *italic*, ~~struck~~ and `code`. Buttons under the box, or Ctrl+B, Ctrl+I, Ctrl+Shift+X and Ctrl+E on what you have selected.',
      'It works on a phone. The lines button opens the servers and channels, the member count opens the members. "Install on this device" in your menu puts it on your home screen.',
      'The ridge, alive has brighter stars, and each one flares once in a while.',
    ],
  },
  {
    id: '2026-09-22-afternoon',
    date: '2026-09-22',
    title: 'Bigger words and a ring around whoever is talking',
    notes: [
      'Text is a step larger and whiter everywhere, and nothing gets cut off at the edges of the panels.',
      'A green ring on whoever is talking, and a mark on whoever is sharing a screen or camera, in every list.',
      'While someone is sharing, you choose how much video you receive: full, medium or low. Handy on a slow connection.',
      'The ridge, alive: a theme where sparks rise from the fire and stars breathe. Under Themes.',
      'A house rule: anyone who sets their name to "bigballer" posts as "I\'m an idiot".',
    ],
  },
  {
    id: '2026-09-22-morning',
    date: '2026-09-22',
    title: 'Paintings behind everything',
    notes: [
      'Themes. The ridge (a campfire on a high ridge at night) is the default; the hall, the chamber and plain are in the menu under your name. Your choice stays on this device.',
      'The line you type into says where the message is going.',
      'Notification sounds have a volume slider, and both start a step louder.',
      'Firefox users are told in fewer words why the site needs Chrome or the desktop app, with the download one click under it.',
    ],
  },
  {
    id: '2026-09-21-desktop',
    date: '2026-09-21',
    title: 'The desktop app, and a busy day of small things',
    notes: [
      'A Windows app. Install it once; it updates itself from then on.',
      'Block a person. They are not told. Their messages fold away and they cannot message you.',
      'A moderator can time a member out for a while.',
      '/roll rolls dice on the server and shows the result as its own kind of message.',
      'Search the messages in a server. Pins and search results jump to the message however old it is.',
      'A server can upload its own emoji. ||Spoiler|| text stays hidden until clicked.',
    ],
  },
];

export const LATEST_RELEASE = CHANGELOG[0]!;
