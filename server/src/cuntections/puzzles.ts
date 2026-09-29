/**
 * Cuntections' puzzles, written by hand for the game (2026-09-28, and 65 more the day after). Each is
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
  [
    { name: 'Breakfast', level: 0, words: ['PANCAKE', 'WAFFLE', 'BACON', 'OATMEAL'] },
    { name: 'Wrestling moves', level: 1, words: ['SUPLEX', 'CLOTHESLINE', 'PILEDRIVER', 'CHOKESLAM'] },
    { name: 'Give up the secret', level: 2, words: ['SQUEAL', 'SING', 'SNITCH', 'BLAB'] },
    { name: '___ roll', level: 3, words: ['EGG', 'BARREL', 'DRUM', 'RICK'] },
  ],
  [
    { name: 'On the farm', level: 0, words: ['COW', 'PIG', 'SHEEP', 'HEN'] },
    { name: 'Coward', level: 1, words: ['CHICKEN', 'WIMP', 'WUSS', 'PANSY'] },
    { name: 'Eat like a slob', level: 2, words: ['GORGE', 'SCARF', 'WOLF', 'INHALE'] },
    { name: '___shit', level: 3, words: ['BULL', 'HORSE', 'HOLY', 'APE'] },
  ],
  [
    { name: 'At the taco place', level: 0, words: ['SALSA', 'QUESO', 'GUAC', 'CARNITAS'] },
    { name: 'Dances', level: 1, words: ['MAMBO', 'WALTZ', 'CONGA', 'TWERK'] },
    { name: 'Radio alphabet', level: 2, words: ['FOXTROT', 'SIERRA', 'WHISKEY', 'BRAVO'] },
    { name: 'Mountain ___', level: 3, words: ['DEW', 'LION', 'GOAT', 'BIKE'] },
  ],
  [
    { name: 'Camping', level: 0, words: ['TENT', 'LANTERN', 'COOLER', 'TARP'] },
    { name: 'Arcade games', level: 1, words: ['GALAGA', 'FROGGER', 'CENTIPEDE', 'ASTEROIDS'] },
    { name: 'Creepy crawlies', level: 2, words: ['ROACH', 'TICK', 'EARWIG', 'MAGGOT'] },
    { name: 'Fire___', level: 3, words: ['FLY', 'CRACKER', 'PLACE', 'WALL'] },
  ],
  [
    { name: 'Condiments', level: 0, words: ['RANCH', 'MAYO', 'MUSTARD', 'RELISH'] },
    { name: 'Places to live', level: 1, words: ['COTTAGE', 'CABIN', 'CONDO', 'BUNGALOW'] },
    { name: 'Clue suspects', level: 2, words: ['PLUM', 'SCARLET', 'PEACOCK', 'WHITE'] },
    { name: 'Full ___', level: 3, words: ['HOUSE', 'MOON', 'MONTY', 'THROTTLE'] },
  ],
  [
    { name: 'At the gym', level: 0, words: ['BARBELL', 'TREADMILL', 'KETTLEBELL', 'BENCH'] },
    { name: 'In court', level: 1, words: ['JUDGE', 'JURY', 'GAVEL', 'BAILIFF'] },
    { name: 'Tear into', level: 2, words: ['ROAST', 'SLAM', 'BASH', 'PAN'] },
    { name: 'Hot ___', level: 3, words: ['TUB', 'POCKET', 'TAKE', 'MESS'] },
  ],
  [
    { name: 'At the sushi bar', level: 0, words: ['WASABI', 'GINGER', 'NIGIRI', 'EDAMAME'] },
    { name: 'Spice Girls', level: 1, words: ['SPORTY', 'SCARY', 'POSH', 'BABY'] },
    { name: "Snow White's dwarfs", level: 2, words: ['DOPEY', 'GRUMPY', 'SLEEPY', 'BASHFUL'] },
    { name: 'Hiding a body part', level: 3, words: ['CHARM', 'SHIPS', 'BEARD', 'CHINA'] },
  ],
  [
    { name: 'Metals', level: 0, words: ['COPPER', 'TIN', 'ZINC', 'NICKEL'] },
    { name: 'The cops', level: 1, words: ['FUZZ', 'PIGS', 'HEAT', 'FIVE-O'] },
    { name: 'Coins', level: 2, words: ['PENNY', 'DIME', 'QUARTER', 'HALF DOLLAR'] },
    { name: 'Michael ___', level: 3, words: ['JORDAN', 'JACKSON', 'SCOTT', 'CERA'] },
  ],
  [
    { name: 'In your pocket', level: 0, words: ['KEYS', 'WALLET', 'PHONE', 'LINT'] },
    { name: 'Generations', level: 1, words: ['ZOOMER', 'MILLENNIAL', 'SILENT', 'ALPHA'] },
    { name: 'Left 4 Dead infected', level: 2, words: ['BOOMER', 'HUNTER', 'SMOKER', 'TANK'] },
    { name: 'Dodges', level: 3, words: ['CHARGER', 'VIPER', 'RAM', 'DART'] },
  ],
  [
    { name: 'Soups', level: 0, words: ['CHOWDER', 'BISQUE', 'GUMBO', 'RAMEN'] },
    { name: 'Cartoon dogs', level: 1, words: ['SCOOBY', 'PLUTO', 'GOOFY', 'BLUEY'] },
    { name: 'Silly', level: 2, words: ['WACKY', 'ZANY', 'DAFFY', 'KOOKY'] },
    { name: '___dog', level: 3, words: ['CORN', 'HOT', 'TOP', 'UNDER'] },
  ],
  [
    { name: 'At the casino', level: 0, words: ['ROULETTE', 'BLACKJACK', 'SLOTS', 'BACCARAT'] },
    { name: 'Poop', level: 1, words: ['TURD', 'DOOKIE', 'DUMP', 'LOG'] },
    { name: 'By the fireplace', level: 2, words: ['POKER', 'MANTEL', 'GRATE', 'BELLOWS'] },
    { name: '___ stick', level: 3, words: ['SELFIE', 'POGO', 'FISH', 'JOY'] },
  ],
  [
    { name: 'Pets', level: 0, words: ['HAMSTER', 'PARROT', 'GOLDFISH', 'FERRET'] },
    { name: 'Cigarettes', level: 1, words: ['KOOL', 'SALEM', 'NEWPORT', 'MARLBORO'] },
    { name: 'Overwatch heroes', level: 2, words: ['TRACER', 'MERCY', 'REAPER', 'WINSTON'] },
    { name: '___toe', level: 3, words: ['CAMEL', 'TIP', 'MISTLE', 'TIC-TAC'] },
  ],
  [
    { name: 'Thanksgiving', level: 0, words: ['TURKEY', 'STUFFING', 'GRAVY', 'YAMS'] },
    { name: 'Bowling', level: 1, words: ['STRIKE', 'SPARE', 'GUTTER', 'SPLIT'] },
    { name: 'Countries', level: 2, words: ['CHAD', 'JORDAN', 'GEORGIA', 'CHILE'] },
    { name: 'Banana ___', level: 3, words: ['BREAD', 'PEEL', 'HAMMOCK', 'REPUBLIC'] },
  ],
  [
    { name: 'Dog noises', level: 0, words: ['BARK', 'GROWL', 'WHINE', 'HOWL'] },
    { name: 'Parts of a tree', level: 1, words: ['TRUNK', 'BRANCH', 'ROOT', 'LEAF'] },
    { name: 'Parts of a car', level: 2, words: ['HOOD', 'BUMPER', 'FENDER', 'DASH'] },
    { name: 'Guitar makers', level: 3, words: ['GIBSON', 'IBANEZ', 'MARTIN', 'EPIPHONE'] },
  ],
  [
    { name: 'Avengers', level: 0, words: ['THOR', 'HULK', 'HAWKEYE', 'VISION'] },
    { name: 'Senses', level: 1, words: ['SIGHT', 'SMELL', 'TASTE', 'TOUCH'] },
    { name: 'Norse gods', level: 2, words: ['ODIN', 'LOKI', 'FREYA', 'TYR'] },
    { name: 'Common ___', level: 3, words: ['SENSE', 'COLD', 'GROUND', 'LAW'] },
  ],
  [
    { name: 'In the shower', level: 0, words: ['SOAP', 'LOOFAH', 'SHAMPOO', 'RAZOR'] },
    { name: 'Kinds of TV show', level: 1, words: ['SITCOM', 'DRAMA', 'REALITY', 'WESTERN'] },
    { name: 'Swords', level: 2, words: ['RAPIER', 'SABER', 'KATANA', 'CLAYMORE'] },
    { name: '___ opera', level: 3, words: ['SPACE', 'ROCK', 'HORSE', 'LIGHT'] },
  ],
  [
    { name: 'Candy', level: 0, words: ['SKITTLES', 'NERDS', 'SMARTIES', 'AIRHEADS'] },
    { name: 'High school cliques', level: 1, words: ['JOCKS', 'GOTHS', 'PREPS', 'STONERS'] },
    { name: 'Weed', level: 2, words: ['POT', 'GRASS', 'HERB', 'REEFER'] },
    { name: 'Pot___', level: 3, words: ['LUCK', 'HOLE', 'ROAST', 'BELLY'] },
  ],
  [
    { name: 'Cheese', level: 0, words: ['BRIE', 'GOUDA', 'SWISS', 'FETA'] },
    { name: 'Cheesy', level: 1, words: ['CORNY', 'SAPPY', 'SCHMALTZY', 'HOKEY'] },
    { name: 'Smash Bros. fighters', level: 2, words: ['KIRBY', 'FOX', 'NESS', 'SAMUS'] },
    { name: 'The boss', level: 3, words: ['HONCHO', 'KINGPIN', 'BRASS', 'CHIEF'] },
  ],
  [
    { name: 'Winter clothes', level: 0, words: ['SCARF', 'MITTENS', 'PARKA', 'BEANIE'] },
    { name: 'At the ski hill', level: 1, words: ['LIFT', 'LODGE', 'SLOPE', 'GONDOLA'] },
    { name: 'Toy crazes', level: 2, words: ['FURBY', 'TAMAGOTCHI', 'POGS', 'SLINKY'] },
    { name: 'Face___', level: 3, words: ['PALM', 'PLANT', 'BOOK', 'TIME'] },
  ],
  [
    { name: 'Peppers', level: 0, words: ['JALAPENO', 'HABANERO', 'POBLANO', 'SERRANO'] },
    { name: 'Dr. ___', level: 1, words: ['PEPPER', 'DRE', 'WHO', 'EVIL'] },
    { name: 'Call of Duty characters', level: 2, words: ['GHOST', 'SOAP', 'PRICE', 'GAZ'] },
    { name: '___ sauce', level: 3, words: ['HOT', 'SOY', 'WEAK', 'AWESOME'] },
  ],
  [
    { name: 'Baseball', level: 0, words: ['BAT', 'GLOVE', 'MOUND', 'DUGOUT'] },
    { name: 'Vampire stuff', level: 1, words: ['FANGS', 'COFFIN', 'CAPE', 'GARLIC'] },
    { name: 'Diablo classes', level: 2, words: ['BARBARIAN', 'NECROMANCER', 'SORCERER', 'DRUID'] },
    { name: 'Home ___', level: 3, words: ['RUN', 'BOY', 'WORK', 'ALONE'] },
  ],
  [
    { name: 'At the beach', level: 0, words: ['SAND', 'TOWEL', 'UMBRELLA', 'SUNSCREEN'] },
    { name: 'Enemy', level: 1, words: ['RIVAL', 'FOE', 'ADVERSARY', 'OPPONENT'] },
    { name: 'Resident Evil', level: 2, words: ['JILL', 'LEON', 'NEMESIS', 'WESKER'] },
    { name: 'Paper ___', level: 3, words: ['CUT', 'CLIP', 'WEIGHT', 'TIGER'] },
  ],
  [
    { name: 'Pixar movies', level: 0, words: ['UP', 'CARS', 'COCO', 'BRAVE'] },
    { name: 'Ballsy', level: 1, words: ['BOLD', 'GUTSY', 'DARING', 'PLUCKY'] },
    { name: 'Taylor Swift albums', level: 2, words: ['RED', 'LOVER', 'REPUTATION', 'FOLKLORE'] },
    { name: '___light', level: 3, words: ['BUD', 'GREEN', 'FLASH', 'MOON'] },
  ],
  [
    { name: 'Fruit', level: 0, words: ['MANGO', 'PLUM', 'PAPAYA', 'GUAVA'] },
    { name: 'Birds that cannot fly', level: 1, words: ['KIWI', 'EMU', 'OSTRICH', 'PENGUIN'] },
    { name: 'Where you are from', level: 2, words: ['AUSSIE', 'YANK', 'BRIT', 'CANUCK'] },
    { name: 'One player on a hockey team', level: 3, words: ['OILER', 'BRUIN', 'FLAME', 'SABRE'] },
  ],
  [
    { name: 'Parts of a castle', level: 0, words: ['MOAT', 'TOWER', 'DRAWBRIDGE', 'DUNGEON'] },
    { name: 'Tarot cards', level: 1, words: ['FOOL', 'HERMIT', 'LOVERS', 'DEVIL'] },
    { name: 'Magic: The Gathering card types', level: 2, words: ['LAND', 'CREATURE', 'INSTANT', 'SORCERY'] },
    { name: '___ crab', level: 3, words: ['KING', 'SPIDER', 'FIDDLER', 'HORSESHOE'] },
  ],
  [
    { name: 'Donuts', level: 0, words: ['GLAZED', 'JELLY', 'SPRINKLE', 'CRULLER'] },
    { name: 'High', level: 1, words: ['BAKED', 'BLAZED', 'TOASTED', 'FADED'] },
    { name: 'Grown-ups on The Simpsons', level: 2, words: ['HOMER', 'MOE', 'APU', 'NED'] },
    { name: 'Home run', level: 3, words: ['DINGER', 'TATER', 'MOONSHOT', 'BLAST'] },
  ],
  [
    { name: 'Holds things together', level: 0, words: ['RIVET', 'STAPLE', 'TACK', 'CLIP'] },
    { name: 'Run off', level: 1, words: ['BOLT', 'FLEE', 'BAIL', 'SCRAM'] },
    { name: 'Do it', level: 2, words: ['SCREW', 'SHAG', 'HUMP', 'BOINK'] },
    { name: 'Finger___', level: 3, words: ['NAIL', 'TIP', 'PRINT', 'BANG'] },
  ],
  [
    { name: 'Seafood', level: 0, words: ['SHRIMP', 'LOBSTER', 'CRAB', 'SCALLOP'] },
    { name: 'Star signs', level: 1, words: ['LEO', 'VIRGO', 'ARIES', 'LIBRA'] },
    { name: 'Grouch', level: 2, words: ['GRUMP', 'SOURPUSS', 'CRANK', 'CURMUDGEON'] },
    { name: '___ call', level: 3, words: ['BOOTY', 'PRANK', 'CURTAIN', 'ROLL'] },
  ],
  [
    { name: 'Greek letters', level: 0, words: ['ALPHA', 'BETA', 'DELTA', 'OMEGA'] },
    { name: 'Airlines', level: 1, words: ['UNITED', 'FRONTIER', 'SOUTHWEST', 'JETBLUE'] },
    { name: 'Watches', level: 2, words: ['ROLEX', 'CASIO', 'SEIKO', 'FOSSIL'] },
    { name: 'School ___', level: 3, words: ['SPIRIT', 'BUS', 'LUNCH', 'NIGHT'] },
  ],
  [
    { name: 'In a salad', level: 0, words: ['LETTUCE', 'CROUTON', 'DRESSING', 'TOMATO'] },
    { name: 'Spices', level: 1, words: ['NUTMEG', 'CUMIN', 'CLOVE', 'PAPRIKA'] },
    { name: 'Medieval weapons', level: 2, words: ['MACE', 'FLAIL', 'HALBERD', 'LANCE'] },
    { name: '___ days', level: 3, words: ['SALAD', 'DOG', 'GLORY', 'SICK'] },
  ],
  [
    { name: 'Office supplies', level: 0, words: ['STAPLER', 'TONER', 'BINDER', 'SHARPIE'] },
    { name: 'People on The Office', level: 1, words: ['DWIGHT', 'STANLEY', 'KEVIN', 'PAM'] },
    { name: 'Tool brands', level: 2, words: ['DEWALT', 'MAKITA', 'RYOBI', 'CRAFTSMAN'] },
    { name: 'Butt rock bands', level: 3, words: ['CREED', 'STAIND', 'SEETHER', 'DAUGHTRY'] },
  ],
  [
    { name: 'In the garden shed', level: 0, words: ['HOSE', 'RAKE', 'SHOVEL', 'MULCH'] },
    { name: 'Rip off', level: 1, words: ['SCAM', 'FLEECE', 'SWINDLE', 'STIFF'] },
    { name: 'Womanizer', level: 2, words: ['CASANOVA', 'HORNDOG', 'LOTHARIO', 'PLAYBOY'] },
    { name: 'Record ___', level: 3, words: ['PLAYER', 'DEAL', 'STORE', 'LABEL'] },
  ],
  [
    { name: 'Racket sports', level: 0, words: ['TENNIS', 'SQUASH', 'BADMINTON', 'PICKLEBALL'] },
    { name: 'Vegetables', level: 1, words: ['ZUCCHINI', 'RADISH', 'TURNIP', 'LEEK'] },
    { name: 'Flatten', level: 2, words: ['SMUSH', 'STOMP', 'TRAMPLE', 'SQUISH'] },
    { name: 'Emojis that mean something dirty', level: 3, words: ['EGGPLANT', 'PEACH', 'TACO', 'CHERRIES'] },
  ],
  [
    { name: 'Out in space', level: 0, words: ['COMET', 'NEBULA', 'ASTEROID', 'QUASAR'] },
    { name: 'Times of day', level: 1, words: ['DUSK', 'NOON', 'MIDNIGHT', 'TWILIGHT'] },
    { name: 'Cleaning brands', level: 2, words: ['AJAX', 'TIDE', 'DAWN', 'WINDEX'] },
    { name: 'Guardians of the Galaxy', level: 3, words: ['GROOT', 'ROCKET', 'DRAX', 'GAMORA'] },
  ],
  [
    { name: 'Cereal', level: 0, words: ['TRIX', 'CHEERIOS', 'KIX', 'LIFE'] },
    { name: 'Magazines', level: 1, words: ['TIME', 'PEOPLE', 'VOGUE', 'WIRED'] },
    { name: 'Too much coffee', level: 2, words: ['JITTERY', 'BUZZED', 'AMPED', 'TWEAKING'] },
    { name: 'Half-___', level: 3, words: ['BAKED', 'WIT', 'PIPE', 'ASSED'] },
  ],
  [
    { name: 'Birthday party', level: 0, words: ['CAKE', 'BALLOONS', 'CANDLES', 'PINATA'] },
    { name: 'Clowns', level: 1, words: ['BOZO', 'KRUSTY', 'PENNYWISE', 'RONALD'] },
    { name: 'Stephen King books', level: 2, words: ['CARRIE', 'MISERY', 'CUJO', 'CHRISTINE'] },
    { name: '___walk', level: 3, words: ['MOON', 'PERP', 'SPACE', 'JAY'] },
  ],
  [
    { name: 'Kitchen gadgets', level: 0, words: ['WHISK', 'LADLE', 'TONGS', 'GRATER'] },
    { name: 'Spank', level: 1, words: ['PADDLE', 'SWAT', 'SMACK', 'WHIP'] },
    { name: 'Indiana Jones', level: 2, words: ['FEDORA', 'ARK', 'GRAIL', 'BOULDER'] },
    { name: 'Holy ___', level: 3, words: ['COW', 'MOLY', 'SMOKES', 'WATER'] },
  ],
  [
    { name: 'Reptiles', level: 0, words: ['GECKO', 'IGUANA', 'COBRA', 'GATOR'] },
    { name: 'Chaos', level: 1, words: ['HAVOC', 'BEDLAM', 'ANARCHY', 'PANDEMONIUM'] },
    { name: 'Mortal Kombat fighters', level: 2, words: ['SCORPION', 'RAIDEN', 'KITANA', 'GORO'] },
    { name: 'In insurance ads', level: 3, words: ['FLO', 'MAYHEM', 'JAKE', 'DUCK'] },
  ],
  [
    { name: 'At the pool', level: 0, words: ['FLOATIES', 'DIVING BOARD', 'LIFEGUARD', 'NOODLE'] },
    { name: 'The other kind of pool', level: 1, words: ['CUE', 'RACK', 'CHALK', 'POCKET'] },
    { name: 'Your head', level: 2, words: ['NOGGIN', 'DOME', 'BEAN', 'SKULL'] },
    { name: 'Boobs', level: 3, words: ['MELONS', 'JUGS', 'KNOCKERS', 'HOOTERS'] },
  ],
  [
    { name: 'Trees', level: 0, words: ['OAK', 'MAPLE', 'BIRCH', 'WILLOW'] },
    { name: 'Volleyball', level: 1, words: ['SERVE', 'SET', 'BUMP', 'DIG'] },
    { name: 'Buffy the Vampire Slayer', level: 2, words: ['BUFFY', 'XANDER', 'SPIKE', 'GILES'] },
    { name: 'Things with rings', level: 3, words: ['SATURN', 'BATHTUB', 'CIRCUS', 'BINDER'] },
  ],
  [
    { name: 'Martial arts', level: 0, words: ['KARATE', 'JUDO', 'SUMO', 'KUNG FU'] },
    { name: 'Told to a dog', level: 1, words: ['SIT', 'STAY', 'HEEL', 'FETCH'] },
    { name: 'Mean Girls', level: 2, words: ['REGINA', 'KAREN', 'GRETCHEN', 'JANIS'] },
    { name: '___ chop', level: 3, words: ['PORK', 'LAMB', 'SLAP', 'MUTTON'] },
  ],
  [
    { name: 'On the bed', level: 0, words: ['PILLOW', 'SHEET', 'QUILT', 'DUVET'] },
    { name: 'Mattress sizes', level: 1, words: ['TWIN', 'FULL', 'QUEEN', 'KING'] },
    { name: 'A lot of paper', level: 2, words: ['REAM', 'PAD', 'ROLL', 'STACK'] },
    { name: 'Drag ___', level: 3, words: ['RACE', 'STRIP', 'NET', 'SHOW'] },
  ],
  [
    { name: 'Drum kit', level: 0, words: ['SNARE', 'CYMBAL', 'KICK', 'HI-HAT'] },
    { name: 'Trap', level: 1, words: ['AMBUSH', 'PITFALL', 'DECOY', 'LURE'] },
    { name: 'Singers with one name', level: 2, words: ['STING', 'CHER', 'BONO', 'PRINCE'] },
    { name: '___stand', level: 3, words: ['HAND', 'NIGHT', 'GRAND', 'BAND'] },
  ],
  [
    { name: 'The Lord of the Rings', level: 0, words: ['FRODO', 'GANDALF', 'GOLLUM', 'LEGOLAS'] },
    { name: 'Wizards', level: 1, words: ['MERLIN', 'DUMBLEDORE', 'RAISTLIN', 'OZ'] },
    { name: 'Prisons', level: 2, words: ['ALCATRAZ', 'AZKABAN', 'SHAWSHANK', 'ARKHAM'] },
    { name: 'Things you cast', level: 3, words: ['SPELL', 'SHADOW', 'VOTE', 'LINE'] },
  ],
  [
    { name: 'Chips', level: 0, words: ['DORITOS', 'FRITOS', 'PRINGLES', 'RUFFLES'] },
    { name: 'Gets on your nerves', level: 1, words: ['IRKS', 'NAGS', 'PESTERS', 'NEEDLES'] },
    { name: 'Sewing', level: 2, words: ['THREAD', 'THIMBLE', 'BOBBIN', 'PINS'] },
    { name: 'On a forum', level: 3, words: ['MOD', 'LURKER', 'TROLL', 'REPOST'] },
  ],
  [
    { name: 'Star Wars', level: 0, words: ['YODA', 'CHEWBACCA', 'LANDO', 'LEIA'] },
    { name: 'Dairy', level: 1, words: ['BUTTER', 'CREAM', 'KEFIR', 'CUSTARD'] },
    { name: 'Spaceballs', level: 2, words: ['BARF', 'YOGURT', 'VESPA', 'SKROOB'] },
    { name: '___ cheese', level: 3, words: ['COTTAGE', 'STRING', 'BLUE', 'NACHO'] },
  ],
  [
    { name: 'Shoes', level: 0, words: ['SNEAKER', 'LOAFER', 'SANDAL', 'CLOG'] },
    { name: 'Lazy bum', level: 1, words: ['SLACKER', 'COUCH POTATO', 'SLUG', 'DEADBEAT'] },
    { name: 'Stop up', level: 2, words: ['PLUG', 'JAM', 'BLOCK', 'DAM'] },
    { name: 'Toe ___', level: 3, words: ['NAIL', 'RING', 'TAG', 'CURLING'] },
  ],
  [
    { name: 'School subjects', level: 0, words: ['MATH', 'HISTORY', 'GYM', 'ART'] },
    { name: 'In your browser', level: 1, words: ['BOOKMARK', 'COOKIE', 'CACHE', 'EXTENSION'] },
    { name: 'Monster ___', level: 2, words: ['MASH', 'TRUCK', 'HUNTER', 'ENERGY'] },
    { name: '___ rat', level: 3, words: ['MALL', 'PACK', 'LAB', 'RUG'] },
  ],
  [
    { name: 'Halloween costumes', level: 0, words: ['WITCH', 'MUMMY', 'VAMPIRE', 'PIRATE'] },
    { name: 'Twilight', level: 1, words: ['BELLA', 'EDWARD', 'JACOB', 'ALICE'] },
    { name: 'One player on a baseball team', level: 2, words: ['CUB', 'MET', 'ROYAL', 'BREWER'] },
    { name: 'Royal ___', level: 3, words: ['FLUSH', 'FAMILY', 'RUMBLE', 'PAIN'] },
  ],
  [
    { name: 'Yard games', level: 0, words: ['CORNHOLE', 'HORSESHOES', 'BOCCE', 'CROQUET'] },
    { name: 'Drinking games', level: 1, words: ['FLIP CUP', 'BEER PONG', 'QUARTERS', 'KINGS'] },
    { name: 'NBA teams', level: 2, words: ['HEAT', 'JAZZ', 'MAGIC', 'NETS'] },
    { name: 'Kinds of music', level: 3, words: ['BLUES', 'METAL', 'FUNK', 'PUNK'] },
  ],
  [
    { name: 'Bar snacks', level: 0, words: ['PEANUTS', 'PRETZELS', 'WINGS', 'NACHOS'] },
    { name: 'Parts of a plane', level: 1, words: ['COCKPIT', 'RUDDER', 'FUSELAGE', 'FLAPS'] },
    { name: 'Comic strips', level: 2, words: ['GARFIELD', 'DILBERT', 'ZIGGY', 'MARMADUKE'] },
    { name: 'Famous cats', level: 3, words: ['FELIX', 'SALEM', 'TOM', 'SYLVESTER'] },
  ],
  [
    { name: 'Cocktails', level: 0, words: ['MOJITO', 'MARGARITA', 'NEGRONI', 'DAIQUIRI'] },
    { name: 'Seinfeld', level: 1, words: ['KRAMER', 'ELAINE', 'GEORGE', 'NEWMAN'] },
    { name: 'South Park', level: 2, words: ['CARTMAN', 'KENNY', 'BUTTERS', 'STAN'] },
    { name: 'The Fairly OddParents', level: 3, words: ['COSMO', 'WANDA', 'TIMMY', 'VICKY'] },
  ],
  [
    { name: 'Inside Out feelings', level: 0, words: ['JOY', 'ANGER', 'DISGUST', 'FEAR'] },
    { name: 'Metal bands', level: 1, words: ['ANTHRAX', 'SLAYER', 'MEGADETH', 'PANTERA'] },
    { name: 'Ailments', level: 2, words: ['MUMPS', 'SCURVY', 'GOUT', 'RABIES'] },
    { name: '___ management', level: 3, words: ['WASTE', 'MIDDLE', 'MICRO', 'RISK'] },
  ],
  [
    { name: 'At the carnival', level: 0, words: ['FERRIS WHEEL', 'CAROUSEL', 'FUNHOUSE', 'DUNK TANK'] },
    { name: 'Fair food', level: 1, words: ['FUNNEL CAKE', 'CORN DOG', 'COTTON CANDY', 'ELEPHANT EAR'] },
    { name: 'Famous Davids', level: 2, words: ['BOWIE', 'BECKHAM', 'LETTERMAN', 'HASSELHOFF'] },
    { name: '___ knife', level: 3, words: ['BUTTER', 'POCKET', 'PUTTY', 'UTILITY'] },
  ],
  [
    { name: 'At the gas station', level: 0, words: ['PUMP', 'SLUSHIE', 'JERKY', 'LOTTO'] },
    { name: 'Noises from a crowd', level: 1, words: ['CHEER', 'HISS', 'CHANT', 'JEER'] },
    { name: 'Mario enemies', level: 2, words: ['GOOMBA', 'KOOPA', 'BOO', 'THWOMP'] },
    { name: 'Sweetheart', level: 3, words: ['BABE', 'BAE', 'HONEY', 'SUGAR'] },
  ],
  [
    { name: 'Pants', level: 0, words: ['JEANS', 'CHINOS', 'SLACKS', 'KHAKIS'] },
    { name: 'Underwear', level: 1, words: ['BRIEFS', 'BOXERS', 'THONG', 'JOCKSTRAP'] },
    { name: 'Blue ___', level: 2, words: ['MOON', 'BALLS', 'CHEESE', 'PRINT'] },
    { name: 'Pants, the other kind', level: 3, words: ['GASPS', 'HUFFS', 'WHEEZES', 'PUFFS'] },
  ],
  [
    { name: 'From a pig', level: 0, words: ['HAM', 'BACON', 'LOIN', 'CHOP'] },
    { name: 'Knife work', level: 1, words: ['SLICE', 'DICE', 'MINCE', 'CARVE'] },
    { name: 'Kevin ___', level: 2, words: ['HART', 'COSTNER', 'DURANT', 'SMITH'] },
    { name: '___cloth', level: 3, words: ['WASH', 'DISH', 'TABLE', 'SACK'] },
  ],
  [
    { name: 'Big cats', level: 0, words: ['LION', 'TIGER', 'JAGUAR', 'PANTHER'] },
    { name: 'Horses', level: 1, words: ['STALLION', 'MARE', 'COLT', 'FOAL'] },
    { name: 'Cars named for animals', level: 2, words: ['MUSTANG', 'BRONCO', 'IMPALA', 'BEETLE'] },
    { name: 'Pistols', level: 3, words: ['GLOCK', 'LUGER', 'RUGER', 'BERETTA'] },
  ],
  [
    { name: 'Trash', level: 0, words: ['GARBAGE', 'RUBBISH', 'JUNK', 'WASTE'] },
    { name: 'In the mail', level: 1, words: ['LETTER', 'POSTCARD', 'FLYER', 'BILL'] },
    { name: 'Presidents', level: 2, words: ['GRANT', 'FORD', 'BUSH', 'CARTER'] },
    { name: 'Your junk', level: 3, words: ['PACKAGE', 'JOHNSON', 'MEMBER', 'UNIT'] },
  ],
  [
    { name: 'Monopoly', level: 0, words: ['BOARDWALK', 'JAIL', 'GO', 'CHANCE'] },
    { name: 'Rappers', level: 1, words: ['DRAKE', 'LUDACRIS', 'NAS', 'COMMON'] },
    { name: 'How good the loot is', level: 2, words: ['RARE', 'EPIC', 'LEGENDARY', 'UNCOMMON'] },
    { name: 'How you want your steak', level: 3, words: ['MEDIUM', 'WELL DONE', 'BLUE', 'PITTSBURGH'] },
  ],
  [
    { name: 'At the dentist', level: 0, words: ['DRILL', 'FLOSS', 'CAVITY', 'CROWN'] },
    { name: 'Dance crazes', level: 1, words: ['DAB', 'DOUGIE', 'MACARENA', 'GRIDDY'] },
    { name: 'For royalty', level: 2, words: ['THRONE', 'SCEPTER', 'ORB', 'TIARA'] },
    { name: 'Drill ___', level: 3, words: ['SERGEANT', 'BIT', 'PRESS', 'TEAM'] },
  ],
  [
    { name: 'Restaurant staff', level: 0, words: ['SERVER', 'HOST', 'BUSSER', 'CHEF'] },
    { name: 'Final Fantasy VII', level: 1, words: ['CLOUD', 'TIFA', 'SEPHIROTH', 'AERITH'] },
    { name: 'Network gear', level: 2, words: ['ROUTER', 'MODEM', 'SWITCH', 'FIREWALL'] },
    { name: 'Nintendo consoles', level: 3, words: ['WII', 'GAMECUBE', 'DS', 'SNES'] },
  ],
  [
    { name: 'Indian food', level: 0, words: ['CURRY', 'NAAN', 'SAMOSA', 'TIKKA'] },
    { name: 'No', level: 1, words: ['NOPE', 'NAH', 'NEGATIVE', 'NEVER'] },
    { name: 'NBA stars', level: 2, words: ['LEBRON', 'JOKIC', 'GIANNIS', 'DURANT'] },
    { name: 'Sound like numbers', level: 3, words: ['ATE', 'WON', 'FOR', 'TOO'] },
  ],
  [
    { name: "Santa's reindeer", level: 0, words: ['DASHER', 'COMET', 'CUPID', 'BLITZEN'] },
    { name: 'Christmas movies', level: 1, words: ['ELF', 'DIE HARD', 'HOME ALONE', 'KRAMPUS'] },
    { name: 'D&D races', level: 2, words: ['DWARF', 'GNOME', 'HALFLING', 'TIEFLING'] },
    { name: 'Garden ___', level: 3, words: ['HOSE', 'PARTY', 'VARIETY', 'STATE'] },
  ],
  [
    { name: 'Snow day', level: 0, words: ['SLED', 'SNOWMAN', 'SHOVEL', 'ICICLE'] },
    { name: 'Frozen', level: 1, words: ['OLAF', 'ELSA', 'ANNA', 'SVEN'] },
    { name: 'Ice ___', level: 2, words: ['CUBE', 'AGE', 'PICK', 'BREAKER'] },
    { name: 'Give the cold shoulder', level: 3, words: ['GHOST', 'SHUN', 'SNUB', 'BLANK'] },
  ],
];
