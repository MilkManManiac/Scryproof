/**
 * Emoji by name, in the message box.
 *
 * `:+1:` and `:fire:` in a draft become the emoji before sending, so what
 * goes over the wire and into the history is the character itself, the same
 * as if it had been pasted. The names are the common ones (GitHub's, mostly),
 * chosen by hand; this is not every emoji, it is the ones people type. A
 * server's own emoji keep their `:name:` form, because that is how a custom
 * emoji is stored, and they are matched first so a server can shadow a name
 * here with its own picture.
 *
 * lamp, 2026-09-22: "using :+1: and stuff like that would be nice to work too".
 */

export const SHORTCODES: Readonly<Record<string, string>> = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎',
  heart: '❤️', orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙', purple_heart: '💜',
  black_heart: '🖤', white_heart: '🤍', broken_heart: '💔', two_hearts: '💕', sparkling_heart: '💖', heart_eyes: '😍',
  joy: '😂', rofl: '🤣', sob: '😭', cry: '😢', laughing: '😆', smile: '😄', grin: '😁', grinning: '😀', smiley: '😃',
  sweat_smile: '😅', wink: '😉', blush: '😊', innocent: '😇', slight_smile: '🙂', upside_down: '🙃', upside_down_face: '🙃',
  relaxed: '☺️', yum: '😋', stuck_out_tongue: '😛', stuck_out_tongue_winking_eye: '😜', zany_face: '🤪', zany: '🤪',
  kissing_heart: '😘', smirk: '😏', unamused: '😒', rolling_eyes: '🙄', roll_eyes: '🙄', grimacing: '😬', expressionless: '😑',
  neutral_face: '😐', no_mouth: '😶', thinking: '🤔', shushing_face: '🤫', hand_over_mouth: '🤭', lying_face: '🤥',
  relieved: '😌', pensive: '😔', sleepy: '😪', drooling_face: '🤤', sleeping: '😴', mask: '😷', face_with_thermometer: '🤒',
  nauseated_face: '🤢', vomiting_face: '🤮', sneezing_face: '🤧', hot_face: '🥵', cold_face: '🥶', woozy_face: '🥴',
  dizzy_face: '😵', exploding_head: '🤯', cowboy: '🤠', cowboy_hat_face: '🤠', partying_face: '🥳', sunglasses: '😎',
  nerd_face: '🤓', nerd: '🤓', monocle_face: '🧐', confused: '😕', worried: '😟', slightly_frowning_face: '🙁', frowning: '😦',
  open_mouth: '😮', hushed: '😯', astonished: '😲', flushed: '😳', pleading_face: '🥺', pleading: '🥺', fearful: '😨',
  cold_sweat: '😰', disappointed_relieved: '😥', scream: '😱', confounded: '😖', persevere: '😣', disappointed: '😞',
  sweat: '😓', weary: '😩', tired_face: '😫', yawning_face: '🥱', triumph: '😤', rage: '😡', angry: '😠',
  cursing_face: '🤬', smiling_imp: '😈', imp: '👿', skull: '💀', skull_and_crossbones: '☠️', poop: '💩', hankey: '💩',
  clown_face: '🤡', clown: '🤡', ogre: '👹', ghost: '👻', alien: '👽', robot: '🤖', smiley_cat: '😺', smile_cat: '😸',
  joy_cat: '😹', heart_eyes_cat: '😻', crying_cat_face: '😿', see_no_evil: '🙈', hear_no_evil: '🙉', speak_no_evil: '🙊',
  smiling_face_with_tear: '🥲', saluting_face: '🫡', salute: '🫡', melting_face: '🫠', face_holding_back_tears: '🥹',
  wave: '👋', raised_hand: '✋', ok_hand: '👌', v: '✌️', crossed_fingers: '🤞', metal: '🤘', call_me_hand: '🤙',
  point_left: '👈', point_right: '👉', point_up: '☝️', point_up_2: '👆', point_down: '👇', middle_finger: '🖕',
  fist: '✊', punch: '👊', facepunch: '👊', clap: '👏', raised_hands: '🙌', open_hands: '👐', handshake: '🤝', pray: '🙏',
  muscle: '💪', eyes: '👀', eye: '👁️', brain: '🧠', tongue: '👅', lips: '👄', shrug: '🤷', facepalm: '🤦', person_shrugging: '🤷',
  pregnant_man: '🫃', pregnant_person: '🫄',
  fire: '🔥', '100': '💯', sparkles: '✨', star: '⭐', star2: '🌟', dizzy: '💫', boom: '💥', collision: '💥', zap: '⚡',
  tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁', birthday: '🎂', cake: '🍰', trophy: '🏆', medal: '🏅',
  crown: '👑', gem: '💎', moneybag: '💰', money_with_wings: '💸', dollar: '💵', bell: '🔔', no_bell: '🔕', bulb: '💡',
  bomb: '💣', hammer: '🔨', wrench: '🔧', gear: '⚙️', lock: '🔒', unlock: '🔓', key: '🔑', pushpin: '📌', memo: '📝',
  pencil: '📝', book: '📖', books: '📚', bookmark: '🔖', calendar: '📅', clock: '🕐', hourglass: '⌛', alarm_clock: '⏰',
  warning: '⚠️', question: '❓', exclamation: '❗', bangbang: '‼️', interrobang: '⁉️', x: '❌', heavy_multiplication_x: '✖️',
  white_check_mark: '✅', check: '✅', heavy_check_mark: '✔️', ballot_box_with_check: '☑️', no_entry: '⛔', no_entry_sign: '🚫',
  o: '⭕', red_circle: '🔴', green_circle: '🟢', yellow_circle: '🟡', blue_circle: '🔵', black_circle: '⚫', white_circle: '⚪',
  arrow_up: '⬆️', arrow_down: '⬇️', arrow_left: '⬅️', arrow_right: '➡️', repeat: '🔁', recycle: '♻️', infinity: '♾️',
  wastebasket: '🗑️', hourglass_flowing_sand: '⏳', stopwatch: '⏱️', mag: '🔍', link: '🔗', paperclip: '📎', scissors: '✂️',
  game_die: '🎲', dice: '🎲', crossed_swords: '⚔️', shield: '🛡️', dagger: '🗡️', bow_and_arrow: '🏹', axe: '🪓',
  dragon: '🐉', dragon_face: '🐲', mage: '🧙', wizard: '🧙', elf: '🧝', vampire: '🧛', zombie: '🧟', fairy: '🧚',
  genie: '🧞', merperson: '🧜', crystal_ball: '🔮', scroll: '📜', world_map: '🗺️', castle: '🏰', european_castle: '🏰',
  beer: '🍺', beers: '🍻', wine_glass: '🍷', tumbler_glass: '🥃', cocktail: '🍸', coffee: '☕', tea: '🍵', pizza: '🍕',
  hamburger: '🍔', fries: '🍟', taco: '🌮', burrito: '🌯', hotdog: '🌭', popcorn: '🍿', doughnut: '🍩', cookie: '🍪',
  bread: '🍞', cheese: '🧀', egg: '🥚', bacon: '🥓', apple: '🍎', banana: '🍌', peach: '🍑', eggplant: '🍆',
  cat: '🐱', dog: '🐶', frog: '🐸', monkey: '🐒', monkey_face: '🐵', pig: '🐷', cow: '🐮', chicken: '🐔', duck: '🦆',
  rat: '🐀', mouse: '🐭', rabbit: '🐰', bear: '🐻', panda_face: '🐼', fox_face: '🦊', wolf: '🐺', lion: '🦁', tiger: '🐯',
  horse: '🐴', unicorn: '🦄', snake: '🐍', turtle: '🐢', fish: '🐟', octopus: '🐙', whale: '🐳', shark: '🦈', bird: '🐦',
  owl: '🦉', eagle: '🦅', bee: '🐝', bug: '🐛', spider: '🕷️', snail: '🐌', goat: '🐐', sheep: '🐑', giraffe: '🦒',
  rocket: '🚀', airplane: '✈️', car: '🚗', bike: '🚲', house: '🏠', tent: '⛺', evergreen_tree: '🌲', deciduous_tree: '🌳',
  cactus: '🌵', herb: '🌿', four_leaf_clover: '🍀', rose: '🌹', sunflower: '🌻', mushroom: '🍄', sunny: '☀️', cloud: '☁️',
  rainbow: '🌈', snowflake: '❄️', umbrella: '☔', ocean: '🌊', earth_americas: '🌎', moon: '🌙', crescent_moon: '🌙', full_moon: '🌕',
  video_game: '🎮', joystick: '🕹️', dart: '🎯', bowling: '🎳', soccer: '⚽', basketball: '🏀', football: '🏈', '8ball': '🎱',
  musical_note: '🎵', notes: '🎶', microphone: '🎤', headphones: '🎧', guitar: '🎸', drum: '🥁', art: '🎨', clapper: '🎬',
  tv: '📺', computer: '💻', keyboard: '⌨️', iphone: '📱', phone: '☎️', camera: '📷', speaker: '🔊', mute: '🔇', loudspeaker: '📢',
  zzz: '💤', speech_balloon: '💬', thought_balloon: '💭', anger: '💢', sweat_drops: '💦', dash: '💨', hole: '🕳️',
  kiss: '💋', cupid: '💘', heartbeat: '💓', heartpulse: '💗', revolving_hearts: '💞', heart_decoration: '💟', love_letter: '💌',
  sun_with_face: '🌞', new_moon_with_face: '🌚', full_moon_with_face: '🌝', first_quarter_moon_with_face: '🌛',
  pirate_flag: '🏴‍☠️', checkered_flag: '🏁', triangular_flag_on_post: '🚩', white_flag: '🏳️', black_flag: '🏴',
  sos: '🆘', ok: '🆗', new: '🆕', cool: '🆒', free: '🆓', up: '🆙', vs: '🆚', top: '🔝', soon: '🔜', back: '🔙', end: '🔚',
  copyright: '©️', tm: '™️', registered: '®️', hash: '#️⃣', asterisk: '*️⃣', zero: '0️⃣', one: '1️⃣', two: '2️⃣', three: '3️⃣',
};

const NAME_RE = /(^|\s):([a-z0-9_+-]{1,32}):/g;

/** Every `:name:` that is a known emoji becomes the emoji. Unknown names stay. */
export function expandShortcodes(text: string, keep: (name: string) => boolean = () => false): string {
  return text.replace(NAME_RE, (whole, before: string, name: string) => {
    if (keep(name)) return whole;
    const emoji = SHORTCODES[name];
    return emoji ? `${before}${emoji}` : whole;
  });
}

export interface EmojiOffer {
  name: string;
  emoji: string;
}

/** Names matching what was typed after the colon, best first, at most `limit`. */
export function emojiOffers(query: string, limit = 7): EmojiOffer[] {
  if (!query) return [];
  const seen = new Set<string>();
  return Object.entries(SHORTCODES)
    .filter(([name]) => name.includes(query))
    .sort((a, b) => Number(b[0].startsWith(query)) - Number(a[0].startsWith(query)) || a[0].length - b[0].length)
    .filter(([, emoji]) => (seen.has(emoji) ? false : (seen.add(emoji), true)))
    .slice(0, limit)
    .map(([name, emoji]) => ({ name, emoji }));
}

function normalizeEmojiName(name: string): string {
  return name.toLowerCase().replace(/[_\s]+/g, ' ').trim();
}

/**
 * How well `name` matches the picker's search box: `0` when the name starts
 * with what was typed, `1` when it merely contains it somewhere, `null` when
 * it does not match at all. Underscores and spaces are treated alike, so
 * "pregnant man" matches `pregnant_man`. Used for both `SHORTCODES` and a
 * server's own emoji, so the two are ranked the same way.
 */
export function emojiSearchScore(name: string, query: string): 0 | 1 | null {
  const q = normalizeEmojiName(query);
  if (!q) return null;
  const n = normalizeEmojiName(name);
  if (!n.includes(q)) return null;
  return n.startsWith(q) ? 0 : 1;
}

/**
 * Every `SHORTCODES` entry whose name contains `query`, best matches first
 * (starts with the text, then merely contains it), capped at `limit`. Empty
 * query gives nothing back, same as `emojiOffers`.
 */
export function searchShortcodes(query: string, limit = 48): EmojiOffer[] {
  return Object.entries(SHORTCODES)
    .map(([name, emoji]) => ({ name, emoji, score: emojiSearchScore(name, query) }))
    .filter((entry): entry is { name: string; emoji: string; score: 0 | 1 } => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, emoji }) => ({ name, emoji }));
}
