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
    id: '2026-09-22-big-one',
    date: '2026-09-22',
    title: 'The big one',
    notes: [
      'Polls. `/poll Which night? | Friday | Saturday | Sunday` and everyone votes by clicking. `/poll*` lets people pick more than one. The author, or a moderator, can close it.',
      "Coming up. A server can plan sessions, at the top of the channel list, and everyone says Going, Maybe or Can't. An hour before, the people who said yes get a reminder in their notifications. Planning needs the new Manage events permission.",
      'Voice messages. Hold the microphone beside Send, talk, let go. It plays in place with a waveform. In a direct message the clip is locked like any other file there.',
      'Saved. Hover a message and pick Save. They are behind the Saved tab in your notifications, and nobody else knows.',
      "Invite links open a join screen now, with the server's name and a Join button, instead of dropping you on the normal screen to type the code again.",
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
