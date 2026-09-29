/**
 * Cuntections' puzzles, written by hand for the game (2026-09-28). Each is
 * four groups of four, easiest (0, yellow) to hardest (3, purple), with a
 * few words in each that look like they belong somewhere they do not. Every
 * one is checked so the sixteen split only one way.
 *
 * Kept on the server only. Which puzzle a day gets is picked when that day is
 * first opened, from the ones not used yet, and remembered
 * (`cuntections_days`), so adding puzzles here never moves a day that has
 * been played, and reading this list says nothing about tomorrow. Editing a
 * puzzle's words makes it a new puzzle; a day that had the old one gets a
 * fresh pick.
 */

export interface CuntectionsGroup {
  /** What the four have in common, shown once it is found. */
  name: string;
  /** 0 is the easiest, 3 the hardest. */
  level: 0 | 1 | 2 | 3;
  words: readonly [string, string, string, string];
}

export type CuntectionsPuzzle = readonly [CuntectionsGroup, CuntectionsGroup, CuntectionsGroup, CuntectionsGroup];

export const PUZZLES: readonly CuntectionsPuzzle[] = [
  [
    { name: 'Poker moves', level: 0, words: ['CALL', 'RAISE', 'CHECK', 'FOLD'] },
    { name: 'Laundry jobs', level: 1, words: ['WASH', 'DRY', 'IRON', 'PRESS'] },
    { name: 'Golf clubs', level: 2, words: ['WOOD', 'DRIVER', 'PUTTER', 'WEDGE'] },
    { name: '___fish', level: 3, words: ['CAT', 'SWORD', 'GOLD', 'STAR'] },
  ],
  [
    { name: 'Pokémon types', level: 0, words: ['DRAGON', 'GRASS', 'GHOST', 'ROCK'] },
    { name: 'Got fired', level: 1, words: ['CANNED', 'SACKED', 'AXED', 'BOOTED'] },
    { name: 'Things you draw', level: 2, words: ['BLOOD', 'BATH', 'BREATH', 'WATER'] },
    { name: '___house', level: 3, words: ['GREEN', 'LIGHT', 'WARE', 'DOLL'] },
  ],
  [
    { name: 'Things with shells', level: 0, words: ['TURTLE', 'TACO', 'EGG', 'SNAIL'] },
    { name: 'D&D classes', level: 1, words: ['BARD', 'ROGUE', 'MONK', 'CLERIC'] },
    { name: '___ star', level: 2, words: ['ROCK', 'DEATH', 'NINJA', 'PORN'] },
    { name: 'Put an S in front for a new word', level: 3, words: ['HELL', 'WORD', 'LAUGHTER', 'PRAY'] },
  ],
  [
    { name: 'Pizza toppings', level: 0, words: ['PEPPERONI', 'SAUSAGE', 'ONION', 'MUSHROOM'] },
    { name: 'Mario Kart items', level: 1, words: ['BANANA', 'LIGHTNING', 'BOB-OMB', 'BLOOPER'] },
    { name: 'Slang for money', level: 2, words: ['BREAD', 'DOUGH', 'CHEDDAR', 'CLAMS'] },
    { name: '___ oil', level: 3, words: ['OLIVE', 'SNAKE', 'MOTOR', 'BABY'] },
  ],
  [
    { name: 'Drunk', level: 0, words: ['HAMMERED', 'WASTED', 'SMASHED', 'LIT'] },
    { name: 'Things you do to a guitar', level: 1, words: ['STRUM', 'PICK', 'TUNE', 'SHRED'] },
    { name: 'Pinball parts', level: 2, words: ['FLIPPER', 'BUMPER', 'PLUNGER', 'TILT'] },
    { name: 'Things you do with a joint', level: 3, words: ['ROLL', 'PASS', 'SPARK', 'HIT'] },
  ],
  [
    { name: 'Pasta shapes', level: 0, words: ['PENNE', 'ZITI', 'BOWTIE', 'SHELLS'] },
    { name: '___ ring', level: 1, words: ['BOXING', 'ONION', 'NOSE', 'KEY'] },
    { name: 'Zelda characters', level: 2, words: ['LINK', 'ZELDA', 'GANON', 'NAVI'] },
    { name: 'Video game horses', level: 3, words: ['EPONA', 'ROACH', 'AGRO', 'TORRENT'] },
  ],
  [
    { name: 'Things with teeth', level: 0, words: ['COMB', 'SAW', 'ZIPPER', 'GEAR'] },
    { name: 'Card games', level: 1, words: ['RUMMY', 'SPADES', 'HEARTS', 'EUCHRE'] },
    { name: 'Guitar parts', level: 2, words: ['BRIDGE', 'NECK', 'FRET', 'PICKUP'] },
    { name: '___ face', level: 3, words: ['POKER', 'BABY', 'STRAIGHT', 'DUCK'] },
  ],
  [
    { name: 'Shades of red', level: 0, words: ['CRIMSON', 'MAROON', 'CHERRY', 'BRICK'] },
    { name: 'Gemstones', level: 1, words: ['OPAL', 'TOPAZ', 'AMETHYST', 'GARNET'] },
    { name: 'Programming languages', level: 2, words: ['RUBY', 'PYTHON', 'JAVA', 'SWIFT'] },
    { name: 'Pokémon game versions', level: 3, words: ['SAPPHIRE', 'EMERALD', 'SCARLET', 'CRYSTAL'] },
  ],
  [
    { name: 'The Beatles', level: 0, words: ['JOHN', 'PAUL', 'GEORGE', 'RINGO'] },
    { name: 'The toilet', level: 1, words: ['HEAD', 'THRONE', 'LOO', 'CRAPPER'] },
    { name: 'Comes in a can', level: 2, words: ['SOUP', 'TUNA', 'SODA', 'BEANS'] },
    { name: 'Kick the ___', level: 3, words: ['CAN', 'BUCKET', 'HABIT', 'TIRES'] },
  ],
  [
    { name: 'Halloween decorations', level: 0, words: ['SKELETON', 'PUMPKIN', 'COBWEB', 'TOMBSTONE'] },
    { name: 'Minecraft mobs', level: 1, words: ['CREEPER', 'ENDERMAN', 'GHAST', 'BLAZE'] },
    { name: 'Pac-Man ghosts', level: 2, words: ['BLINKY', 'PINKY', 'INKY', 'CLYDE'] },
    { name: '___-Man', level: 3, words: ['BAT', 'SPIDER', 'IRON', 'PAC'] },
  ],
  [
    { name: 'Pirate gear', level: 0, words: ['PLANK', 'PARROT', 'CUTLASS', 'EYEPATCH'] },
    { name: 'Train cars', level: 1, words: ['CABOOSE', 'BOXCAR', 'TANKER', 'SLEEPER'] },
    { name: 'Cuts of beef', level: 2, words: ['RUMP', 'SKIRT', 'FLANK', 'BRISKET'] },
    { name: 'Your ass', level: 3, words: ['DERRIERE', 'BUNS', 'TUSH', 'BOOTY'] },
  ],
  [
    { name: 'Candy bars', level: 0, words: ['MARS', 'TWIX', 'SNICKERS', 'MILKY WAY'] },
    { name: 'Planets', level: 1, words: ['NEPTUNE', 'URANUS', 'JUPITER', 'EARTH'] },
    { name: 'Car brands that died', level: 2, words: ['SATURN', 'MERCURY', 'PONTIAC', 'PLYMOUTH'] },
    { name: 'Famous Williamses', level: 3, words: ['VENUS', 'SERENA', 'ROBIN', 'PHARRELL'] },
  ],
  [
    { name: 'Chess pieces', level: 0, words: ['ROOK', 'BISHOP', 'KNIGHT', 'PAWN'] },
    { name: 'Batman villains', level: 1, words: ['JOKER', 'PENGUIN', 'RIDDLER', 'BANE'] },
    { name: 'Playing cards', level: 2, words: ['ACE', 'KING', 'QUEEN', 'DEUCE'] },
    { name: 'Black___', level: 3, words: ['JACK', 'SMITH', 'MAIL', 'BIRD'] },
  ],
  [
    { name: 'Coffee drinks', level: 0, words: ['LATTE', 'ESPRESSO', 'AMERICANO', 'MACCHIATO'] },
    { name: 'Shades of brown', level: 1, words: ['MOCHA', 'TAN', 'UMBER', 'TAUPE'] },
    { name: 'Street Fighter fighters', level: 2, words: ['RYU', 'KEN', 'GUILE', 'BLANKA'] },
    { name: 'Hidden TEA', level: 3, words: ['STEAK', 'INSTEAD', 'TEAM', 'STEADY'] },
  ],
  [
    { name: 'Fast food chains', level: 0, words: ['POPEYES', 'SONIC', "ARBY'S", "WENDY'S"] },
    { name: 'Trains under a city', level: 1, words: ['SUBWAY', 'METRO', 'TUBE', 'UNDERGROUND'] },
    { name: 'Sonic characters', level: 2, words: ['KNUCKLES', 'TAILS', 'SHADOW', 'AMY'] },
    { name: 'Things with tails', level: 3, words: ['COIN', 'COMET', 'KITE', 'TUXEDO'] },
  ],
  [
    { name: 'Teeth', level: 0, words: ['MOLAR', 'CANINE', 'INCISOR', 'BICUSPID'] },
    { name: 'D&D ability scores', level: 1, words: ['STRENGTH', 'CHARISMA', 'DEXTERITY', 'CONSTITUTION'] },
    { name: '___ tooth', level: 2, words: ['SWEET', 'SAW', 'BLUE', 'WISDOM'] },
    { name: 'Dungeon ___', level: 3, words: ['MASTER', 'CRAWLER', 'KEEPER', 'SIEGE'] },
  ],
  [
    { name: 'Hotel staff', level: 0, words: ['PORTER', 'BELLHOP', 'CONCIERGE', 'VALET'] },
    { name: 'Beer', level: 1, words: ['LAGER', 'IPA', 'PILSNER', 'STOUT'] },
    { name: 'Chubby', level: 2, words: ['PORTLY', 'HUSKY', 'PLUMP', 'CHUNKY'] },
    { name: 'Famous Harrys', level: 3, words: ['POTTER', 'STYLES', 'HOUDINI', 'TRUMAN'] },
  ],
  [
    { name: 'Natural disasters', level: 0, words: ['DROUGHT', 'TORNADO', 'EARTHQUAKE', 'WILDFIRE'] },
    { name: 'Noah', level: 1, words: ['ARK', 'DOVE', 'RAINBOW', 'FLOOD'] },
    { name: 'Halo', level: 2, words: ['WARTHOG', 'CORTANA', 'COVENANT', 'SPARTAN'] },
    { name: '___ hog', level: 3, words: ['ROAD', 'GROUND', 'HEDGE', 'WHOLE'] },
  ],
  [
    { name: 'Places to drink', level: 0, words: ['CLUB', 'PUB', 'LOUNGE', 'TAVERN'] },
    { name: 'Sandwiches', level: 1, words: ['REUBEN', 'CUBAN', 'MELT', 'GYRO'] },
    { name: 'Golf ___', level: 2, words: ['CART', 'COURSE', 'BALL', 'TEE'] },
    { name: 'Bar ___', level: 3, words: ['STOOL', 'FIGHT', 'MITZVAH', 'CODE'] },
  ],
  [
    { name: 'Throw', level: 0, words: ['TOSS', 'LOB', 'PITCH', 'FLING'] },
    { name: 'Throw up', level: 1, words: ['HURL', 'PUKE', 'SPEW', 'HEAVE'] },
    { name: 'Kids on The Simpsons', level: 2, words: ['BART', 'LISA', 'MILHOUSE', 'RALPH'] },
    { name: '___bag', level: 3, words: ['BARF', 'BEAN', 'DOUCHE', 'PUNCHING'] },
  ],
  [
    { name: 'Keyboard keys', level: 0, words: ['ENTER', 'DELETE', 'SHIFT', 'TAB'] },
    { name: '___ room', level: 1, words: ['ESCAPE', 'BATH', 'PANIC', 'WIGGLE'] },
    { name: 'Outer ___', level: 2, words: ['SPACE', 'BANKS', 'LIMITS', 'WILDS'] },
    { name: 'Happy ___', level: 3, words: ['HOUR', 'ENDING', 'MEAL', 'CAMPER'] },
  ],
  [
    { name: 'Flowers', level: 0, words: ['DAISY', 'ROSE', 'TULIP', 'ORCHID'] },
    { name: 'Mario characters', level: 1, words: ['LUIGI', 'PEACH', 'YOSHI', 'WARIO'] },
    { name: 'Amphibians', level: 2, words: ['TOAD', 'FROG', 'NEWT', 'AXOLOTL'] },
    { name: '___ pad', level: 3, words: ['LILY', 'LAUNCH', 'KEY', 'MOUSE'] },
  ],
  [
    { name: 'Weather', level: 0, words: ['RAIN', 'SLEET', 'FOG', 'MIST'] },
    { name: 'Saying hi without talking', level: 1, words: ['WAVE', 'SALUTE', 'NOD', 'BOW'] },
    { name: '___ cone', level: 2, words: ['SNOW', 'ICE CREAM', 'PINE', 'TRAFFIC'] },
    { name: '___ Mary', level: 3, words: ['HAIL', 'BLOODY', 'PROUD', 'TYPHOID'] },
  ],
  [
    { name: 'Ways to cook an egg', level: 0, words: ['SCRAMBLED', 'BOILED', 'DEVILED', 'FRIED'] },
    { name: 'Exhausted', level: 1, words: ['WIPED', 'BEAT', 'SPENT', 'ZONKED'] },
    { name: 'Stolen', level: 2, words: ['NICKED', 'PINCHED', 'SWIPED', 'POACHED'] },
    { name: 'Fruit, rearranged', level: 3, words: ['REAP', 'MILE', 'AMONG', 'CHEAP'] },
  ],
  [
    { name: 'NFL teams', level: 0, words: ['GIANTS', 'BEARS', 'PACKERS', 'CHIEFS'] },
    { name: 'Birds', level: 1, words: ['FALCON', 'HERON', 'WREN', 'ROBIN'] },
    { name: 'In the church', level: 2, words: ['CARDINAL', 'BISHOP', 'POPE', 'DEACON'] },
    { name: 'Shades of black', level: 3, words: ['JET', 'EBONY', 'ONYX', 'RAVEN'] },
  ],
  [
    { name: 'In the toolbox', level: 0, words: ['WRENCH', 'PLIERS', 'TAPE', 'HAMMER'] },
    { name: 'Idiot', level: 1, words: ['DORK', 'DWEEB', 'DOOFUS', 'TOOL'] },
    { name: 'Slang for great', level: 2, words: ['DOPE', 'SICK', 'FIRE', 'BUSSIN'] },
    { name: 'Palindromes', level: 3, words: ['LEVEL', 'KAYAK', 'CIVIC', 'RADAR'] },
  ],
  [
    { name: 'Board games', level: 0, words: ['RISK', 'CLUE', 'MONOPOLY', 'SCRABBLE'] },
    { name: 'Said after screwing up', level: 1, words: ['WHOOPS', 'MY BAD', 'SORRY', 'OOPS'] },
    { name: 'Something to go on', level: 2, words: ['HINT', 'TIP', 'LEAD', 'POINTER'] },
    { name: '___maker', level: 3, words: ['TROUBLE', 'MATCH', 'PEACE', 'MONEY'] },
  ],
  [
    { name: 'Units of time', level: 0, words: ['HOUR', 'DAY', 'WEEK', 'YEAR'] },
    { name: 'Small', level: 1, words: ['MINUTE', 'TINY', 'PUNY', 'TEENY'] },
    { name: 'Pee', level: 2, words: ['WEE', 'TINKLE', 'WHIZ', 'LEAK'] },
    { name: '___hand', level: 3, words: ['SECOND', 'SHORT', 'UNDER', 'BACK'] },
  ],
  [
    { name: 'Crazy', level: 0, words: ['NUTS', 'BONKERS', 'LOCO', 'BANANAS'] },
    { name: 'Lab equipment', level: 1, words: ['FLASK', 'BURNER', 'PIPETTE', 'BEAKER'] },
    { name: 'Muppets', level: 2, words: ['KERMIT', 'FOZZIE', 'PIGGY', 'GONZO'] },
    { name: '___ crackers', level: 3, words: ['ANIMAL', 'CHEESE', 'GRAHAM', 'RITZ'] },
  ],
  [
    { name: 'Hairstyles', level: 0, words: ['BOB', 'BUN', 'MOHAWK', 'PERM'] },
    { name: 'In a band', level: 1, words: ['BASS', 'DRUMS', 'KEYS', 'VOCALS'] },
    { name: 'Fish', level: 2, words: ['TROUT', 'COD', 'MULLET', 'PIKE'] },
    { name: 'Complain', level: 3, words: ['CARP', 'BEEF', 'GRIPE', 'WHINE'] },
  ],
  [
    { name: 'Poker hands', level: 0, words: ['PAIR', 'FULL HOUSE', 'HIGH CARD', 'FLUSH'] },
    { name: 'Fries', level: 1, words: ['CURLY', 'WAFFLE', 'STEAK', 'CRINKLE'] },
    { name: 'Honest', level: 2, words: ['STRAIGHT', 'UPFRONT', 'FRANK', 'DIRECT'] },
    { name: 'Rich', level: 3, words: ['LOADED', 'MINTED', 'ROLLING', 'STACKED'] },
  ],
  [
    { name: 'At a wedding', level: 0, words: ['BRIDE', 'VEIL', 'BOUQUET', 'GROOM'] },
    { name: 'Horse gear', level: 1, words: ['SADDLE', 'BRIDLE', 'REINS', 'STIRRUP'] },
    { name: 'Things you cut', level: 2, words: ['CAKE', 'CORNERS', 'CLASS', 'CHEESE'] },
    { name: '___maid', level: 3, words: ['MER', 'HOUSE', 'BAR', 'NURSE'] },
  ],
  [
    { name: 'Dog breeds', level: 0, words: ['POODLE', 'BEAGLE', 'CORGI', 'HUSKY'] },
    { name: 'Athletes', level: 1, words: ['BOXER', 'DIVER', 'GOLFER', 'SPRINTER'] },
    { name: '___ nose', level: 2, words: ['PUG', 'ROMAN', 'BROWN', 'RUNNY'] },
    { name: 'Belly ___', level: 3, words: ['BUTTON', 'FLOP', 'DANCER', 'ACHE'] },
  ],
  [
    { name: 'Muscular', level: 0, words: ['RIPPED', 'JACKED', 'SHREDDED', 'SWOLE'] },
    { name: 'Gamer talk', level: 1, words: ['NOOB', 'LAG', 'CAMPER', 'SPAWN'] },
    { name: 'Naked', level: 2, words: ['NUDE', 'BARE', 'STRIPPED', 'BUFF'] },
    { name: '___ gun', level: 3, words: ['NERF', 'SQUIRT', 'RAY', 'TOP'] },
  ],
  [
    { name: 'Bread', level: 0, words: ['SOURDOUGH', 'BRIOCHE', 'PITA', 'BAGUETTE'] },
    { name: 'Whiskey', level: 1, words: ['RYE', 'BOURBON', 'MALT', 'TENNESSEE'] },
    { name: '___ tape', level: 2, words: ['SCOTCH', 'DUCT', 'MASKING', 'TICKER'] },
    { name: '___ bull', level: 3, words: ['RED', 'PIT', 'RAGING', 'SITTING'] },
  ],
  [
    { name: 'In your mouth', level: 0, words: ['TONGUE', 'LIPS', 'GUMS', 'TEETH'] },
    { name: 'Parts of a shoe', level: 1, words: ['LACE', 'EYELET', 'TOE', 'INSOLE'] },
    { name: 'Only one', level: 2, words: ['SOLE', 'LONE', 'SINGLE', 'SOLO'] },
    { name: 'Scumbag', level: 3, words: ['HEEL', 'CAD', 'RAT', 'SNAKE'] },
  ],
  [
    { name: 'Ice cream flavors', level: 0, words: ['CHOCOLATE', 'PISTACHIO', 'ROCKY ROAD', 'BUTTER PECAN'] },
    { name: 'Boring', level: 1, words: ['VANILLA', 'PLAIN', 'BLAND', 'BASIC'] },
    { name: 'Perfect condition', level: 2, words: ['MINT', 'PRISTINE', 'FLAWLESS', 'SPOTLESS'] },
    { name: '___ Fields', level: 3, words: ['STRAWBERRY', 'KILLING', 'ELYSIAN', 'POPPY'] },
  ],
  [
    { name: 'Grandma', level: 0, words: ['NANA', 'GRAN', 'MEEMAW', 'NONNA'] },
    { name: 'Sesame Street', level: 1, words: ['OSCAR', 'ELMO', 'BERT', 'ERNIE'] },
    { name: 'Awards', level: 2, words: ['GRAMMY', 'TONY', 'EMMY', 'PEABODY'] },
    { name: 'Big ___', level: 3, words: ['BIRD', 'MAC', 'BEN', 'LEBOWSKI'] },
  ],
  [
    { name: 'Parts of a lamp', level: 0, words: ['WICK', 'BULB', 'CORD', 'BASE'] },
    { name: 'John ___', level: 1, words: ['WAYNE', 'LENNON', 'CENA', 'LEGEND'] },
    { name: 'Famous Bruces', level: 2, words: ['BANNER', 'LEE', 'WILLIS', 'SPRINGSTEEN'] },
    { name: 'Throw ___', level: 3, words: ['SHADE', 'HANDS', 'FIT', 'PUNCHES'] },
  ],
  [
    { name: 'Crush it', level: 0, words: ['CRUSH', 'MASH', 'GRIND', 'POUND'] },
    { name: 'Soda', level: 1, words: ['FANTA', 'PEPSI', 'TAB', 'SPRITE'] },
    { name: 'Fairy folk', level: 2, words: ['PIXIE', 'IMP', 'ELF', 'BROWNIE'] },
    { name: 'Little kid', level: 3, words: ['SQUIRT', 'TOT', 'RUGRAT', 'MUNCHKIN'] },
  ],
];
