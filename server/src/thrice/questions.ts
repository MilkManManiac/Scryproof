/**
 * Threeway's questions, written by hand. Five to a day. The three clues go
 * hardest first: the first should stump most people, the last should be a
 * gift. `accept` is whatever else counts as the answer; case, punctuation
 * and a leading "the" never matter, and a long answer forgives a typo.
 *
 * To add a day, add five to the end. Which day gets which is decided when
 * the day comes (`thrice.ts`), so nothing here says what tomorrow is.
 */

export interface ThriceQuestion {
  category: string;
  clues: readonly [string, string, string];
  answer: string;
  accept?: readonly string[];
}

export type ThriceSet = readonly [ThriceQuestion, ThriceQuestion, ThriceQuestion, ThriceQuestion, ThriceQuestion];

export const SETS: readonly ThriceSet[] = [
  [
    {
      category: 'Video games',
      clues: [
        'Its earliest builds, in May 2009, went by the working name Cave Game.',
        'Microsoft bought its studio, Mojang, for $2.5 billion.',
        'You punch trees, dig for diamonds and run from Creepers.',
      ],
      answer: 'Minecraft',
    },
    {
      category: 'Food',
      clues: [
        'It is named for a town on the coast of Thailand.',
        'The best-known American version is made by Huy Fong Foods.',
        'Red hot sauce in a squeeze bottle with a rooster on it and a green cap.',
      ],
      answer: 'Sriracha',
    },
    {
      category: 'Animals',
      clues: [
        'It has three hearts and blue blood.',
        'Most of its neurons are not in its head but in its arms.',
        'It has eight of those arms.',
      ],
      answer: 'Octopus',
      accept: ['octopi', 'octopuses'],
    },
    {
      category: 'Movies',
      clues: [
        'Chris Farley had recorded most of the lead role before he died, and it was all redone.',
        'It won the first Oscar ever given for Best Animated Feature.',
        'An ogre, a talking donkey and a swamp.',
      ],
      answer: 'Shrek',
    },
    {
      category: 'Geography',
      clues: [
        'Its parliament, the Althing, first met in the year 930.',
        'Its capital is the northernmost capital of any sovereign country.',
        'That capital is Reykjavik.',
      ],
      answer: 'Iceland',
    },
  ],
  [
    {
      category: 'Music',
      clues: [
        'Its video was shot in about four hours for roughly £4,500.',
        'A headbanging scene in Wayne’s World put it back on the charts in 1992.',
        'Queen, six minutes: “Is this the real life? Is this just fantasy?”',
      ],
      answer: 'Bohemian Rhapsody',
    },
    {
      category: 'D&D',
      clues: [
        'Its central eye throws a cone in which no magic works.',
        'It has ten eyestalks, and each one fires a different ray.',
        'A floating ball of a monster that is mostly one huge eye and a mouth.',
      ],
      answer: 'Beholder',
    },
    {
      category: 'The body',
      clues: [
        'Its full name has the word “vermiform” in it, meaning shaped like a worm.',
        'It hangs off the start of the large intestine.',
        'It gets taken out when it swells up and threatens to burst.',
      ],
      answer: 'Appendix',
    },
    {
      category: 'History',
      clues: [
        'Its sister ships were the Olympic and the Britannic.',
        'It left Southampton on April 10, 1912.',
        'It hit an iceberg, and later James Cameron made a lot of money.',
      ],
      answer: 'Titanic',
      accept: ['rms titanic'],
    },
    {
      category: 'The internet',
      clues: [
        'This 1987 single was produced by Stock Aitken Waterman.',
        'Its video passed a billion views on YouTube in 2021.',
        'Rick Astley sings it. You have been tricked into clicking on it.',
      ],
      answer: 'Never Gonna Give You Up',
      accept: ['rickroll', 'rick roll', 'rickrolling', 'never going to give you up'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'Its world is called Lordran.',
        '“Praise the Sun” comes from a knight in it named Solaire.',
        'FromSoftware, 2011. Every hard game since has been called “the ___ of” something.',
      ],
      answer: 'Dark Souls',
      accept: ['dark souls 1', 'darksouls'],
    },
    {
      category: 'Food',
      clues: [
        'Hormel introduced it in 1937.',
        'Hawaii eats more of it per person than any other state, often on rice wrapped in seaweed.',
        'Canned meat that gave its name to junk email.',
      ],
      answer: 'Spam',
    },
    {
      category: 'Science',
      clues: [
        'It was spotted in the light of the Sun in 1868, years before anyone found it on Earth.',
        'It is the second most common element in the universe.',
        'It fills party balloons and makes your voice squeak.',
      ],
      answer: 'Helium',
    },
    {
      category: 'Movies',
      clues: [
        'Its lead was based on a real film producer named Jeff Dowd.',
        'John Goodman pulls a gun over a foot fault at a bowling alley.',
        '“The Dude abides.”',
      ],
      answer: 'The Big Lebowski',
      accept: ['big lebowski', 'lebowski'],
    },
    {
      category: 'Geography',
      clues: [
        'Its capital was built from nothing because its two biggest cities could not agree which should be it.',
        'In 1932 its army went to war against emus, and lost.',
        'Kangaroos, the Outback, Sydney.',
      ],
      answer: 'Australia',
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'The first episode of the American version was nearly a word-for-word copy of the British one.',
        'It is set at a paper company in Scranton, Pennsylvania.',
        'Michael Scott, Dwight, Jim and Pam.',
      ],
      answer: 'The Office',
    },
    {
      category: 'Animals',
      clues: [
        'The male has a venomous spur on each back leg.',
        'It is one of the very few mammals that lay eggs.',
        'It has a duck’s bill and a beaver’s tail.',
      ],
      answer: 'Platypus',
      accept: ['duck billed platypus'],
    },
    {
      category: 'The body',
      clues: [
        'Benjamin Franklin wrote an essay asking scientists to find a way to make these smell nice.',
        'The average person lets out around fourteen a day.',
        '“Pull my finger.”',
      ],
      answer: 'Fart',
      accept: ['farts', 'farting', 'flatulence', 'gas', 'passing gas', 'toot'],
    },
    {
      category: 'Games',
      clues: [
        'Its name joins the Greek word for four with its maker’s favorite sport, tennis.',
        'Alexey Pajitnov made it in Moscow in 1984.',
        'Blocks fall. You turn them and clear lines.',
      ],
      answer: 'Tetris',
    },
    {
      category: 'History',
      clues: [
        'He was born on Corsica, a year after France took it over.',
        'He was exiled to Elba, came back, and was exiled again to Saint Helena.',
        'French emperor who lost at Waterloo.',
      ],
      answer: 'Napoleon',
      accept: ['napoleon bonaparte', 'bonaparte', 'napoleon i'],
    },
  ],
  [
    {
      category: 'Music',
      clues: [
        'The name comes from a member’s job at a coffee shop, handing back five cents in change.',
        'They are from Hanna, Alberta, and fronted by Chad Kroeger.',
        '“Look at this photograph.”',
      ],
      answer: 'Nickelback',
    },
    {
      category: 'Food',
      clues: [
        'In the 1700s, English hosts would rent one for the evening as a centerpiece.',
        'It has an enzyme that breaks down protein, which is why it stings your mouth.',
        'The fruit people fight about putting on pizza.',
      ],
      answer: 'Pineapple',
    },
    {
      category: 'Video games',
      clues: [
        'Its name joins the Japanese sound of a spark with the sound of a mouse squeaking.',
        'It is number 25 in the Pokédex.',
        'Ash’s yellow electric mouse.',
      ],
      answer: 'Pikachu',
    },
    {
      category: 'Geography',
      clues: [
        'Tibetans call it Chomolungma.',
        'Edmund Hillary and Tenzing Norgay were first to the top, in 1953.',
        'The tallest mountain on Earth.',
      ],
      answer: 'Mount Everest',
      accept: ['everest', 'mt everest'],
    },
    {
      category: 'Movies',
      clues: [
        'Its mechanical star was nicknamed Bruce, after the director’s lawyer.',
        'John Williams wrote its theme, which is mostly two notes.',
        '“You’re gonna need a bigger boat.”',
      ],
      answer: 'Jaws',
    },
  ],
  [
    {
      category: 'D&D',
      clues: [
        'It is ten feet on every side, so that it exactly fills a dungeon corridor.',
        'It is see-through, and the gear of the last party floats inside it.',
        'A monster that is a big cube of jelly.',
      ],
      answer: 'Gelatinous Cube',
      accept: ['gelatinous cubes', 'jelly cube'],
    },
    {
      category: 'Science',
      clues: [
        'It was named by an eleven-year-old girl from Oxford, Venetia Burney.',
        'New Horizons flew past it in 2015 and found a plain shaped like a heart.',
        'It stopped being a planet in 2006.',
      ],
      answer: 'Pluto',
    },
    {
      category: 'The internet',
      clues: [
        'It started as a side project to feed an encyclopedia written by experts, called Nupedia.',
        'Jimmy Wales and Larry Sanger launched it in January 2001.',
        'The free encyclopedia anyone can edit.',
      ],
      answer: 'Wikipedia',
    },
    {
      category: 'Animals',
      clues: [
        'It climbs down from its tree about once a week, to poop.',
        'Algae grows in its fur and turns it green.',
        'The slowest mammal there is, and one of the seven deadly sins.',
      ],
      answer: 'Sloth',
      accept: ['sloths'],
    },
    {
      category: 'TV',
      clues: [
        'Its creator pitched it as turning Mr. Chips into Scarface.',
        'The owners of a real house in Albuquerque put up a fence because fans kept throwing pizzas on the roof.',
        'A chemistry teacher starts cooking meth.',
      ],
      answer: 'Breaking Bad',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Its filling was banana cream until bananas were rationed in the Second World War.',
        'Woody Harrelson spends all of Zombieland looking for one.',
        'A yellow sponge cake full of cream that supposedly never goes bad.',
      ],
      answer: 'Twinkie',
      accept: ['twinkies'],
    },
    {
      category: 'Video games',
      clues: [
        'Its name came from a line Tom Cruise says in The Color of Money.',
        'People have got it running on tractors, calculators and cash machines.',
        'id Software, 1993: shooting demons on the moons of Mars.',
      ],
      answer: 'Doom',
    },
    {
      category: 'Music',
      clues: [
        'He has a degree in architecture from Cal Poly.',
        'His instrument is the accordion.',
        '“Eat It”, “Amish Paradise”, “White & Nerdy”.',
      ],
      answer: 'Weird Al Yankovic',
      accept: ['weird al', 'al yankovic', 'weird al yankovich'],
    },
    {
      category: 'History',
      clues: [
        'It started going up overnight on August 13, 1961.',
        'Checkpoint Charlie was a way through it.',
        'It came down in 1989 and a German city was one city again.',
      ],
      answer: 'The Berlin Wall',
      accept: ['berlin wall'],
    },
    {
      category: 'The body',
      clues: [
        'Its print is as much your own as a fingerprint.',
        'It is eight muscles working together.',
        'You taste with it.',
      ],
      answer: 'Tongue',
      accept: ['tongues'],
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'It cost about six million dollars and took in about $1,800 when it first ran.',
        'Audiences throw plastic spoons at the screen.',
        'Tommy Wiseau: “You’re tearing me apart, Lisa!”',
      ],
      answer: 'The Room',
    },
    {
      category: 'Animals',
      clues: [
        'Its poop comes out in cubes.',
        'It is a marsupial whose pouch opens backward, so dirt stays out when it digs.',
        'A stocky Australian burrower. Rhymes with “combat”.',
      ],
      answer: 'Wombat',
      accept: ['wombats'],
    },
    {
      category: 'Geography',
      clues: [
        'It has the shortest national railway in the world.',
        'Its army is Swiss.',
        'The smallest country in the world. The Pope lives there.',
      ],
      answer: 'Vatican City',
      accept: ['vatican', 'the vatican', 'holy see'],
    },
    {
      category: 'Video games',
      clues: [
        'Its creator got the idea after losing his house in the Oakland firestorm of 1991.',
        'Everyone in it speaks a made-up language with no meaning.',
        'Put them in the pool and take away the ladder.',
      ],
      answer: 'The Sims',
      accept: ['sims'],
    },
    {
      category: 'Food',
      clues: [
        'A joke unit of radiation dose is named after it.',
        'Nearly every one in the shop is a clone of one variety, the Cavendish.',
        'Yellow, and cartoon characters slip on the peel.',
      ],
      answer: 'Banana',
      accept: ['bananas'],
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'Its creator, Stephen Hillenburg, used to teach marine biology.',
        'He is a fry cook at the Krusty Krab.',
        'Who lives in a pineapple under the sea?',
      ],
      answer: 'SpongeBob SquarePants',
      accept: ['spongebob', 'sponge bob', 'sponge bob square pants'],
    },
    {
      category: 'Music',
      clues: [
        'It was an old campfire chant until a South Korean company recorded it in 2016.',
        'It was the first video on YouTube to reach ten billion views.',
        'Doo doo doo doo doo doo.',
      ],
      answer: 'Baby Shark',
    },
    {
      category: 'History',
      clues: [
        'A Siberian peasant who won over a royal family by seeming to ease their son’s bleeding.',
        'His killers are said to have poisoned him, shot him, and then put him in a river.',
        'Boney M. called him Russia’s greatest love machine.',
      ],
      answer: 'Rasputin',
      accept: ['grigori rasputin'],
    },
    {
      category: 'Food',
      clues: [
        'The real thing is a plant stem grated on sharkskin.',
        'Most of what is sold under its name is horseradish and green dye.',
        'The green paste next to your sushi.',
      ],
      answer: 'Wasabi',
    },
    {
      category: 'Games',
      clues: [
        'It comes from The Landlord’s Game, made by Lizzie Magie to show how bad landlords are.',
        'Its mascot was first named Rich Uncle Pennybags.',
        'Boardwalk, Park Place, go directly to jail.',
      ],
      answer: 'Monopoly',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'Researchers swabbed sixty of them and found more than two thousand kinds of bacteria.',
        'About one in ten sticks out instead of in.',
        'It is where the lint collects, and where your umbilical cord was.',
      ],
      answer: 'Belly button',
      accept: ['navel', 'bellybutton', 'belly buttons', 'umbilicus'],
    },
    {
      category: 'Video games',
      clues: [
        'Its hero is called the Dovahkiin.',
        'It came out in 2011 and has been sold again on nearly everything since.',
        '“I used to be an adventurer like you. Then I took an arrow in the knee.”',
      ],
      answer: 'Skyrim',
      accept: ['elder scrolls skyrim', 'the elder scrolls v skyrim', 'elder scrolls v', 'elder scrolls 5'],
    },
    {
      category: 'Movies',
      clues: [
        'Born a Coppola, he took his stage name from a Marvel hero.',
        'He bought a dinosaur skull at auction and later had to give it back.',
        'He stole the Declaration of Independence in National Treasure.',
      ],
      answer: 'Nicolas Cage',
      accept: ['nic cage', 'nicholas cage', 'nick cage', 'cage'],
    },
    {
      category: 'Geography',
      clues: [
        'It has more lakes than any other country.',
        'It has the longest coastline of any country.',
        'Maple syrup, Mounties, “sorry”.',
      ],
      answer: 'Canada',
    },
    {
      category: 'Science',
      clues: [
        'In 2007 some of them spent ten days in open space and lived.',
        'It can dry out to a husk, wait for years, and walk off when it gets wet again.',
        'The microscopic eight-legged animal that almost nothing can kill. It looks like a fat little bear.',
      ],
      answer: 'Tardigrade',
      accept: ['tardigrades', 'water bear', 'water bears', 'moss piglet'],
    },
  ],
  [
    {
      category: 'Music',
      clues: [
        'She says she once entered a lookalike contest for herself, and lost.',
        'Her Imagination Library mails free books to children.',
        '“Jolene” and “9 to 5”.',
      ],
      answer: 'Dolly Parton',
      accept: ['dolly'],
    },
    {
      category: 'Food',
      clues: [
        'Its ancestor was a fermented fish sauce from southern China.',
        'In the 1830s it was sold in America as medicine, in pills.',
        'Heinz. It goes on fries.',
      ],
      answer: 'Ketchup',
      accept: ['catsup', 'tomato ketchup'],
    },
    {
      category: 'Animals',
      clues: [
        'A group of them is called a flamboyance.',
        'They hatch gray and turn their color from what they eat.',
        'A pink bird that stands on one leg, and on lawns.',
      ],
      answer: 'Flamingo',
      accept: ['flamingos', 'flamingoes'],
    },
    {
      category: 'D&D',
      clues: [
        'It has been in the Monster Manual since 1977, and it holds on to you with its own glue.',
        'Dark Souls taught players to hit these before opening them.',
        'A monster that looks like a treasure chest.',
      ],
      answer: 'Mimic',
      accept: ['mimics'],
    },
    {
      category: 'History',
      clues: [
        'She lived closer in time to the Moon landing than to the building of the Great Pyramid.',
        'She was Greek by descent, the last ruler of the Ptolemies.',
        'Queen of Egypt, with Julius Caesar and then Mark Antony.',
      ],
      answer: 'Cleopatra',
      accept: ['cleopatra vii'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'It came out in 2018 and almost nobody noticed for two years.',
        'It was made by a studio called Innersloth.',
        'Red is sus.',
      ],
      answer: 'Among Us',
      accept: ['amogus', 'amongus'],
    },
    {
      category: 'Movies',
      clues: [
        'It is based on a novel called Nothing Lasts Forever.',
        'It takes place in Nakatomi Plaza.',
        'Bruce Willis, no shoes. People argue every December about whether it is a Christmas movie.',
      ],
      answer: 'Die Hard',
    },
    {
      category: 'The body',
      clues: [
        'An American named Charles Osborne had them for 68 years.',
        'Each one is your diaphragm jerking.',
        'People tell you to hold your breath, or try to scare you.',
      ],
      answer: 'Hiccups',
      accept: ['hiccup', 'hiccough', 'hiccoughs', 'the hiccups'],
    },
    {
      category: 'Geography',
      clues: [
        'Its name is Spanish, for the flowers of the Easter season.',
        'It is the only place in the world where alligators and crocodiles live side by side in the wild.',
        'The state with Disney World and a Man who is always in the news.',
      ],
      answer: 'Florida',
    },
    {
      category: 'The internet',
      clues: [
        'The dog in the picture was a Shiba Inu named Kabosu.',
        'A cryptocurrency started as a joke in 2013 is named for it.',
        'Much wow. Very meme. Such comic sans.',
      ],
      answer: 'Doge',
      accept: ['doge meme'],
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'It began as short cartoons on The Tracey Ullman Show.',
        'Its town has the same name as towns in dozens of states, on purpose.',
        '“D’oh!”',
      ],
      answer: 'The Simpsons',
      accept: ['simpsons'],
    },
    {
      category: 'Science',
      clues: [
        'Its symbol comes from a Latin name meaning “water-silver”.',
        'Hat makers breathed it in at work, and went mad.',
        'The liquid metal in old thermometers.',
      ],
      answer: 'Mercury',
      accept: ['quicksilver'],
    },
    {
      category: 'Food',
      clues: [
        'Kellogg’s rushed it out in 1964 after a rival announced one called Country Squares.',
        'The first ones had no frosting.',
        'A pastry that goes in the toaster.',
      ],
      answer: 'Pop-Tarts',
      accept: ['pop tart', 'pop tarts', 'poptart', 'poptarts'],
    },
    {
      category: 'Games',
      clues: [
        'The word that ends it comes from the Persian for “the king is helpless”.',
        'A computer called Deep Blue beat the world champion at it in 1997.',
        'Kings, queens, bishops, pawns.',
      ],
      answer: 'Chess',
    },
    {
      category: 'Music',
      clues: [
        'The words are about a woman who cheats on her boyfriend while he is being sworn into the army.',
        'Los del Río spent fourteen weeks at number one with it in 1996.',
        'A dance: hands out, hands on your head, hands on your hips, “Heeey…”',
      ],
      answer: 'Macarena',
      accept: ['the macarena', 'macarana'],
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'The falling green code on screen was made from sushi recipes.',
        'Will Smith turned down the lead.',
        'Red pill or blue pill.',
      ],
      answer: 'The Matrix',
      accept: ['matrix'],
    },
    {
      category: 'Animals',
      clues: [
        'The Church is said to have once ruled it a fish, so that it could be eaten during Lent.',
        'It is the largest rodent in the world.',
        'A giant, calm guinea pig that every other animal likes to sit on.',
      ],
      answer: 'Capybara',
      accept: ['capybaras', 'capibara'],
    },
    {
      category: 'History',
      clues: [
        'His real name was probably Edward Teach.',
        'He went into fights with lit fuses smoking under his hat.',
        'The most famous pirate there is, named for what grew on his face.',
      ],
      answer: 'Blackbeard',
      accept: ['black beard', 'edward teach', 'edward thatch'],
    },
    {
      category: 'Video games',
      clues: [
        'You play three men: a retired bank robber, a repo man and a maniac.',
        'It came out in 2013, is still selling, and sells Shark Cards online.',
        'Rockstar’s one set in Los Santos.',
      ],
      answer: 'Grand Theft Auto V',
      accept: ['gta 5', 'gta v', 'gta5', 'gtav', 'grand theft auto 5', 'grand theft auto five'],
    },
    {
      category: 'Food',
      clues: [
        'They were first made at a restaurant in Disneyland, from tortillas that would have been thrown out.',
        'The name means, more or less, “little golden things”.',
        'Nacho Cheese, Cool Ranch, orange dust on your fingers.',
      ],
      answer: 'Doritos',
      accept: ['dorito'],
    },
  ],
  [
    {
      category: 'The bathroom',
      clues: [
        'Joseph Gayetty first sold it in America in 1857, as “medicated paper”.',
        'A patent drawing from 1891 settles the argument: it goes over, not under.',
        'People filled their garages with it in March 2020.',
      ],
      answer: 'Toilet paper',
      accept: ['tp', 'toilet roll', 'toilet tissue', 'bog roll', 'loo roll'],
    },
    {
      category: 'TV',
      clues: [
        'Its first pilot was never aired, and nearly all of it was shot again.',
        'A coffee cup was left on a table in a scene in its last season.',
        '“Winter is coming.”',
      ],
      answer: 'Game of Thrones',
      accept: ['got', 'a game of thrones'],
    },
    {
      category: 'Geography',
      clues: [
        'Its shore is the lowest dry land on Earth.',
        'It is close to ten times as salty as the ocean.',
        'You float in it. It lies between Israel and Jordan.',
      ],
      answer: 'The Dead Sea',
      accept: ['dead sea'],
    },
    {
      category: 'Music',
      clues: [
        'He was born in St. Joseph, Missouri, not in the city he is known for.',
        'One of his songs fits 1,560 words into six minutes.',
        'Slim Shady. Mom’s spaghetti.',
      ],
      answer: 'Eminem',
      accept: ['marshall mathers', 'slim shady'],
    },
    {
      category: 'Science',
      clues: [
        'It moves about an inch and a half further from us every year.',
        'Twelve people have walked on it.',
        'It pulls the tides. It is not made of cheese.',
      ],
      answer: 'The Moon',
      accept: ['moon', 'luna'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'His shape is said to have come from a pizza with a slice gone.',
        'He is chased by Blinky, Pinky, Inky and Clyde.',
        'Yellow, round, eats dots. Wakka wakka.',
      ],
      answer: 'Pac-Man',
      accept: ['pacman', 'pac man'],
    },
    {
      category: 'Food',
      clues: [
        'It came out in 1912 as a copy of a cookie called Hydrox.',
        'It comes in Double Stuf, with one f.',
        'Twist it, lick it, dunk it.',
      ],
      answer: 'Oreo',
      accept: ['oreos'],
    },
    {
      category: 'Movies',
      clues: [
        'One man wore the suit, David Prowse, and another did the voice.',
        'The voice was James Earl Jones.',
        '“No. I am your father.”',
      ],
      answer: 'Darth Vader',
      accept: ['vader', 'anakin skywalker', 'anakin', 'lord vader'],
    },
    {
      category: 'Animals',
      clues: [
        'Its pupils are rectangles lying on their side.',
        'One breed goes stiff and falls over when startled.',
        'Its young are kids. It will eat your shirt.',
      ],
      answer: 'Goat',
      accept: ['goats'],
    },
    {
      category: 'History',
      clues: [
        'It destroyed 342 chests.',
        'Some of the men who did it dressed as Mohawks.',
        'Boston, 1773. No taxation without representation.',
      ],
      answer: 'The Boston Tea Party',
      accept: ['boston tea party', 'tea party'],
    },
  ],
  [
    {
      category: 'The internet',
      clues: [
        'Its founders made piles of fake accounts at the start so that it would look busy.',
        'Its alien mascot is named Snoo.',
        'Upvotes, downvotes, and a sub for everything.',
      ],
      answer: 'Reddit',
    },
    {
      category: 'Music',
      clues: [
        'He was banned from San Antonio for ten years for peeing on a monument at the Alamo.',
        'He bit the head off a bat on stage in 1982.',
        'The Prince of Darkness, out of Black Sabbath.',
      ],
      answer: 'Ozzy Osbourne',
      accept: ['ozzy', 'ozzie osbourne', 'ozzy osborne', 'ozzy osborn'],
    },
    {
      category: 'Games',
      clues: [
        'It was first published in 1974 by a company called Tactical Studies Rules.',
        'Gary Gygax and Dave Arneson made it.',
        '“Roll for initiative.”',
      ],
      answer: 'Dungeons & Dragons',
      accept: ['dnd', 'd&d', 'd and d', 'dungeons and dragons', 'd n d'],
    },
    {
      category: 'Food',
      clues: [
        'The fear of it sticking to the roof of your mouth has a name: arachibutyrophobia.',
        'A twelve-ounce jar takes about 540 of the nuts.',
        'It goes with jelly.',
      ],
      answer: 'Peanut butter',
      accept: ['pb'],
    },
    {
      category: 'Geography',
      clues: [
        'Its name is Spanish for “the meadows”.',
        'Its most famous street is not inside the city limits.',
        'What happens there, stays there.',
      ],
      answer: 'Las Vegas',
      accept: ['vegas'],
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'The real animal was found dead in Georgia in 1985, near a duffel bag a smuggler dropped from a plane.',
        'Elizabeth Banks directed it, in 2023.',
        'A bear finds a great deal of cocaine.',
      ],
      answer: 'Cocaine Bear',
    },
    {
      category: 'Science',
      clues: [
        'It was being tried out as a heart drug when the men in the trial reported a side effect.',
        'Pfizer got it approved in 1998.',
        'The little blue pill.',
      ],
      answer: 'Viagra',
      accept: ['sildenafil'],
    },
    {
      category: 'TV',
      clues: [
        'Before MTV took it, its makers turned down an offer from Saturday Night Live.',
        'Viva La Bam and Wildboyz came out of it.',
        '“Hi, I’m Johnny Knoxville, and welcome to…”',
      ],
      answer: 'Jackass',
    },
    {
      category: 'Video games',
      clues: [
        'Outside Japan it came in the box with its console, which made it one of the best-selling games ever.',
        'Retirement homes ran bowling leagues on it.',
        'Nintendo, 2006: tennis, bowling and boxing with a remote in your hand.',
      ],
      answer: 'Wii Sports',
      accept: ['wii sport', 'wiisports'],
    },
    {
      category: 'Animals',
      clues: [
        'The male’s penis is shaped like a corkscrew.',
        'There is a myth that the noise it makes does not echo. It does.',
        'Donald and Daffy.',
      ],
      answer: 'Duck',
      accept: ['ducks'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'It reached the Netherlands from the Ottoman Empire, and its name may come from the word for a turban.',
        'In 1637 the Dutch were paying the price of a house for one bulb, and then the price fell through the floor.',
        'The flower Holland is known for.',
      ],
      answer: 'Tulip',
      accept: ['tulips'],
    },
    {
      category: 'Food',
      clues: [
        'Frankfurt and Vienna both say they invented it.',
        'Joey Chestnut once ate 76 of them in ten minutes.',
        'A sausage in a bun. People argue about whether it is a sandwich.',
      ],
      answer: 'Hot dog',
      accept: ['hotdog', 'hot dogs', 'hotdogs', 'frankfurter', 'wiener'],
    },
    {
      category: 'Video games',
      clues: [
        'It came out in 2017 as a game about building forts against zombies. The famous part came months later.',
        'Epic Games makes it, and sells V-Bucks.',
        'You jump out of a flying bus, and then you floss.',
      ],
      answer: 'Fortnite',
      accept: ['fortnight'],
    },
    {
      category: 'Music',
      clues: [
        'It is on an album from 1999 called Astro Lounge.',
        'It plays over the opening of Shrek.',
        '“Somebody once told me the world is gonna roll me.”',
      ],
      answer: 'All Star',
      accept: ['allstar', 'all star by smash mouth'],
    },
    {
      category: 'The body',
      clues: [
        'Some people do it when they walk out into bright sunlight.',
        'You cannot do it while you are fast asleep.',
        '“Achoo!” “Bless you.”',
      ],
      answer: 'Sneeze',
      accept: ['sneezing', 'sneezes', 'a sneeze'],
    },
  ],
  [
    {
      category: 'Geography',
      clues: [
        'Its flag was designed by a schoolboy named Benny Benson.',
        'The United States bought it from Russia in 1867 for $7.2 million.',
        'The biggest state, and the coldest.',
      ],
      answer: 'Alaska',
    },
    {
      category: 'Movies',
      clues: [
        'Pink Floyd and Led Zeppelin helped pay for it.',
        'There are coconuts in it because there was no money for horses.',
        '“’Tis but a scratch.” The Knights Who Say Ni.',
      ],
      answer: 'Monty Python and the Holy Grail',
      accept: ['holy grail', 'the holy grail', 'monty python', 'monty python holy grail', 'monty python and the holy grail'],
    },
    {
      category: 'Animals',
      clues: [
        'Its fingerprints are close enough to a person’s to be mistaken for them.',
        'It eats eucalyptus and sleeps most of the day.',
        'Gray, Australian, lives in trees, and is not a bear.',
      ],
      answer: 'Koala',
      accept: ['koalas', 'koala bear'],
    },
    {
      category: 'Video games',
      clues: [
        'In his first game, in 1981, he was called Jumpman.',
        'He is named after the landlord of Nintendo’s American office.',
        'A plumber. “It’s-a me!”',
      ],
      answer: 'Mario',
      accept: ['super mario'],
    },
    {
      category: 'Drinks',
      clues: [
        'It is named for a town northwest of Guadalajara.',
        'It is made from blue agave, mostly in Jalisco.',
        'A shot, with salt and lime.',
      ],
      answer: 'Tequila',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Its national day in the US honors Salvation Army volunteers of the First World War.',
        'It is what Homer Simpson drools over.',
        'A fried ring of dough with a hole, sold by Dunkin and Krispy Kreme.',
      ],
      answer: 'Donut',
      accept: ['doughnut', 'donuts', 'doughnuts'],
    },
    {
      category: 'TV',
      clues: [
        "The restaurant sits next door to a funeral home called It's Your Funeral.",
        'H. Jon Benjamin voices the dad, and daughter Tina writes erotic friend fiction.',
        'A cartoon about the Belcher family and their struggling hamburger restaurant.',
      ],
      answer: "Bob's Burgers",
      accept: ['bobs burgers'],
    },
    {
      category: 'Video games',
      clues: [
        'It began as an idea for a game starring Jean-Claude Van Damme.',
        'Outrage over its violence helped lead to the ESRB ratings board.',
        'It is the fighting game with Fatalities and the line Finish Him.',
      ],
      answer: 'Mortal Kombat',
      accept: ['mk', 'mortal combat'],
    },
    {
      category: 'Video games',
      clues: [
        "The first game's dialogue includes the phrase Jill sandwich.",
        'In Japan the series is called Biohazard.',
        "Capcom's zombie series with the Umbrella Corporation.",
      ],
      answer: 'Resident Evil',
    },
    {
      category: 'Geography',
      clues: [
        "It was built as the entrance to the 1889 World's Fair.",
        'It grows slightly taller in summer heat as the iron expands.',
        'The iron landmark that stands over Paris.',
      ],
      answer: 'Eiffel Tower',
    },
  ],
  [
    {
      category: 'Music',
      clues: [
        'The single copy of one of their albums was sold to Martin Shkreli.',
        'They come from Staten Island, which they call Shaolin.',
        'The rap group with RZA, Method Man and Ghostface Killah.',
      ],
      answer: 'Wu-Tang Clan',
      accept: ['wu tang', 'wutang', 'wutang clan', 'the wu'],
    },
    {
      category: 'Video games',
      clues: [
        'It opens with a long tram ride into the Black Mesa Research Facility.',
        'Fans have been waiting for its third numbered entry since the 2000s.',
        'The Valve shooter starring Gordon Freeman and his crowbar.',
      ],
      answer: 'Half-Life',
      accept: ['half life 1', 'half life 2'],
    },
    {
      category: 'Animals',
      clues: [
        'It sleeps with half of its brain at a time.',
        'The orca is the largest member of its family.',
        'Flipper was one.',
      ],
      answer: 'Dolphin',
      accept: ['dolphins', 'bottlenose dolphin'],
    },
    {
      category: 'Video games',
      clues: [
        'In Japan he is called Rockman.',
        'He was built by Dr. Light and fights Dr. Wily.',
        "He is Capcom's blue robot who takes the weapons of the bosses he beats.",
      ],
      answer: 'Mega Man',
      accept: ['megaman', 'rockman'],
    },
    {
      category: 'Tech',
      clues: [
        'Its logo is two Norse runes joined together.',
        'It is named after a tenth century Danish king called Harald.',
        'It connects wireless earbuds and controllers to your phone or console.',
      ],
      answer: 'Bluetooth',
    },
  ],
  [
    {
      category: 'Space',
      clues: [
        'Its discoverer wanted to name it after King George III.',
        'It spins tipped over on its side.',
        'The seventh planet, and the one everyone makes butt jokes about.',
      ],
      answer: 'Uranus',
    },
    {
      category: 'Geography',
      clues: [
        'It sits beside the dry bed of Groom Lake.',
        'In 2019 a joke Facebook event invited people to storm it.',
        'The secret Nevada air base where people think the government hides aliens.',
      ],
      answer: 'Area 51',
      accept: ['area fifty one'],
    },
    {
      category: 'Video games',
      clues: [
        'He was created by Masahiro Sakurai, who went on to direct Super Smash Bros.',
        'His first game was set in Dream Land, on the Game Boy in 1992.',
        'The pink Nintendo puffball who swallows enemies and copies their powers.',
      ],
      answer: 'Kirby',
    },
    {
      category: 'Drinks',
      clues: [
        'It was created at a drug store in Waco, Texas in the 1880s.',
        'It is said to be a blend of 23 flavors.',
        'The dark soda with a medical title in its name.',
      ],
      answer: 'Dr Pepper',
      accept: ['doctor pepper'],
    },
    {
      category: 'D&D',
      clues: [
        'In the fifth edition rules it only guarantees success on attack rolls.',
        'On an attack it is a critical hit.',
        'It is the top number showing on the die you roll most, before modifiers.',
      ],
      answer: 'Natural 20',
      accept: ['nat 20', 'nat20', 'natural twenty', 'nat twenty'],
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'Its theme song was performed by The Rembrandts.',
        'Much of it takes place in a coffee shop called Central Perk.',
        'Ross, Rachel, Monica, Chandler, Joey and Phoebe.',
      ],
      answer: 'Friends',
    },
    {
      category: 'TV',
      clues: [
        'Its recurring numbers are 4, 8, 15, 16, 23 and 42.',
        'A smoke monster and a buried hatch kept viewers guessing.',
        'Oceanic Flight 815 crashes on a mysterious island.',
      ],
      answer: 'Lost',
    },
    {
      category: 'The body',
      clues: [
        'Its parts are called ascending, transverse, descending and sigmoid.',
        'It absorbs water from what is left of your food.',
        'It shares its name with the punctuation mark made of two dots.',
      ],
      answer: 'Colon',
      accept: ['large intestine', 'large bowel'],
    },
    {
      category: 'Music',
      clues: [
        'John Landis directed its video after making An American Werewolf in London.',
        'The horror actor Vincent Price performs its spoken section.',
        'Michael Jackson dances with zombies in a red leather jacket.',
      ],
      answer: 'Thriller',
    },
    {
      category: 'Holidays',
      clues: [
        "In France the traditional prank is sticking a paper fish on someone's back.",
        'In 1957 the BBC marked it with a report on the Swiss spaghetti harvest.',
        'The day of pranks on the first day of the fourth month.',
      ],
      answer: "April Fools' Day",
      accept: ['april fools', 'april fool', 'april fools day', 'april 1', 'april 1st', 'april first'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'Rare made it, and its multiplayer mode was added late in development.',
        'Picking Oddjob in multiplayer is considered cheating.',
        'The 1997 James Bond shooter on the Nintendo 64.',
      ],
      answer: 'GoldenEye 007',
      accept: ['goldeneye', 'golden eye', 'golden eye 007', 'goldeneye 64'],
    },
    {
      category: 'People',
      clues: [
        'He trained as a dancer, which he shows off in the Weapon of Choice video.',
        'He won an Oscar for The Deer Hunter.',
        'On Saturday Night Live he demands more cowbell.',
      ],
      answer: 'Christopher Walken',
      accept: ['walken', 'chris walken'],
    },
    {
      category: 'Words',
      clues: [
        'The term comes from Greek for running back again.',
        'A man, a plan, a canal, Panama is a long one.',
        'It is a word that reads the same backwards, like racecar or kayak.',
      ],
      answer: 'Palindrome',
    },
    {
      category: 'Geography',
      clues: [
        'It was an independent republic for nearly ten years before joining the United States.',
        'Its capital is Austin.',
        'The Lone Star State, where everything is said to be bigger.',
      ],
      answer: 'Texas',
    },
    {
      category: 'Games',
      clues: [
        'A starting ace and ten card traditionally pays three to two.',
        'The dealer has to keep hitting until reaching at least 17.',
        'The casino card game where you try to get to 21 without going bust.',
      ],
      answer: 'Blackjack',
      accept: ['21', 'twenty one', 'black jack'],
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'An Edith Piaf song is the signal that it is time to wake up.',
        'It ends on a shot of a spinning top.',
        'Leonardo DiCaprio goes into a dream within a dream within a dream.',
      ],
      answer: 'Inception',
    },
    {
      category: 'The body',
      clues: [
        'It is a dome shaped sheet of muscle under the lungs.',
        'Hiccups happen when it spasms.',
        'It is the main muscle of breathing, and singers are told to sing from it.',
      ],
      answer: 'Diaphragm',
    },
    {
      category: 'Games',
      clues: [
        'It was a pencil and paper game long before Milton Bradley sold it with plastic pegs.',
        'The smallest piece covers two holes and the largest covers five.',
        'You call out a grid square and hear hit or miss. Then someone says you sunk theirs.',
      ],
      answer: 'Battleship',
    },
    {
      category: 'Sports',
      clues: [
        'When it fills up with names, the oldest band is removed and kept at the Hall of Fame.',
        'Each player on the winning team gets a day with it.',
        'The trophy for winning the NHL playoffs.',
      ],
      answer: 'Stanley Cup',
      accept: ['the stanley cup', 'lord stanleys cup'],
    },
    {
      category: 'The bathroom',
      clues: [
        'Its brown colour comes from stercobilin, which is made from bile.',
        'The Bristol chart sorts it into seven types.',
        'It is what you leave in the toilet after a number two.',
      ],
      answer: 'Poop',
      accept: ['shit', 'feces', 'poo', 'crap', 'turd', 'stool', 'faeces'],
    },
  ],
  [
    {
      category: 'Sports',
      clues: [
        'Its highest rank is yokozuna.',
        'Competitors throw salt before a bout to purify the ring.',
        'Japanese wrestling between very large men in loincloths.',
      ],
      answer: 'Sumo',
      accept: ['sumo wrestling'],
    },
    {
      category: 'The internet',
      clues: [
        'It began in 1995 as an email list of San Francisco events.',
        'It shut down its personals section in 2018.',
        'The plain looking classifieds site where you find a used couch.',
      ],
      answer: 'Craigslist',
      accept: ['craigs list'],
    },
    {
      category: 'TV',
      clues: [
        'Its characters once appeared in ads for Winston cigarettes.',
        'It was modelled on The Honeymooners.',
        'The stone age cartoon family. Yabba dabba doo.',
      ],
      answer: 'The Flintstones',
      accept: ['flintstones', 'flinstones', 'the flinstones'],
    },
    {
      category: 'Movies',
      clues: [
        "The ship's cat, Jones, makes it out alive.",
        'Ridley Scott directed it. The tagline says in space no one can hear you scream.',
        "Sigourney Weaver plays Ripley, and a creature bursts out of a crewmate's chest.",
      ],
      answer: 'Alien',
    },
    {
      category: 'Video games',
      clues: [
        'Allan Alcorn built it as a training exercise at Atari.',
        'The test unit in a bar stopped working because it was jammed full of quarters.',
        'It is the 1972 arcade game with two paddles and a square ball.',
      ],
      answer: 'Pong',
    },
  ],
  [
    {
      category: 'Tech',
      clues: [
        'Percy Spencer came up with it while working on radar at Raytheon.',
        'Early models were sold under the name Radarange.',
        'It is the kitchen box that reheats leftovers and cooks bagged popcorn.',
      ],
      answer: 'Microwave',
      accept: ['microwave oven'],
    },
    {
      category: 'Geography',
      clues: [
        'Rocks at its Racetrack Playa slide across the ground and leave trails.',
        'Its Badwater Basin is the lowest point in North America.',
        'A California desert national park known for extreme heat and a grim name.',
      ],
      answer: 'Death Valley',
    },
    {
      category: 'Drinks',
      clues: [
        'Its traditional flavouring, sassafras, was banned in the US because it contains safrole.',
        'A pharmacist named Charles Hires sold an early commercial version.',
        "A&W, Barq's and Mug are brands. It goes over ice cream in a float.",
      ],
      answer: 'Root beer',
      accept: ['rootbeer'],
    },
    {
      category: 'Video games',
      clues: [
        'Its city was founded by a businessman named Andrew Ryan.',
        'The phrase "Would you kindly" turns out to matter a lot.',
        'You fight Big Daddies in the underwater city of Rapture.',
      ],
      answer: 'BioShock',
    },
    {
      category: 'Food',
      clues: [
        'It is named after a German port city.',
        'White Castle has sold small ones, now called sliders, since 1921.',
        'A ground beef patty in a bun.',
      ],
      answer: 'Hamburger',
      accept: ['burger', 'hamburgers', 'burgers'],
    },
  ],
  [
    {
      category: 'Tech',
      clues: [
        'It went on sale in Japan in 1979.',
        'Star-Lord carries one in Guardians of the Galaxy.',
        "Sony's portable cassette player.",
      ],
      answer: 'Walkman',
      accept: ['sony walkman'],
    },
    {
      category: 'The internet',
      clues: [
        'Justin Timberlake was part of a group that bought it in 2011.',
        'Users ranked their friends in a Top 8.',
        'It was the social network where Tom was your first friend.',
      ],
      answer: 'MySpace',
    },
    {
      category: 'Comics',
      clues: [
        'He was grey in his first issue.',
        'Stan Lee and Jack Kirby created him in 1962.',
        'Bruce Banner gets angry and turns big and green.',
      ],
      answer: 'Hulk',
      accept: ['incredible hulk', 'the incredible hulk'],
    },
    {
      category: 'Movies',
      clues: [
        'Filming stopped for a year so the lead could lose weight and grow a beard.',
        'The main character is a FedEx employee.',
        'Tom Hanks is stranded on an island with a volleyball named Wilson.',
      ],
      answer: 'Cast Away',
      accept: ['castaway'],
    },
    {
      category: 'Movies',
      clues: [
        'It borrows its plot from a serious 1957 film called Zero Hour.',
        'Kareem Abdul-Jabbar plays the co-pilot.',
        "Leslie Nielsen says I am serious, and don't call me Shirley.",
      ],
      answer: 'Airplane',
      accept: ['airplane!', 'flying high'],
    },
  ],
  [
    {
      category: 'Games',
      clues: [
        'It is a solved game. With perfect play, whoever goes first wins.',
        'Milton Bradley sold it with an upright blue grid.',
        'Drop red and yellow discs and try to line them up.',
      ],
      answer: 'Connect Four',
      accept: ['connect 4'],
    },
    {
      category: 'TV',
      clues: [
        'Its main villain chain smokes a made up brand called Morley.',
        "A poster in the lead character's office says I Want to Believe.",
        'Mulder and Scully investigate aliens and monsters for the FBI.',
      ],
      answer: 'The X-Files',
      accept: ['x files', 'xfiles'],
    },
    {
      category: 'Animals',
      clues: [
        'In the emperor kind, the male balances the egg on his feet through the winter.',
        'Almost every species lives in the Southern Hemisphere.',
        'It is a flightless black and white bird that waddles on ice.',
      ],
      answer: 'Penguin',
      accept: ['penguins'],
    },
    {
      category: 'Movies',
      clues: [
        'Dinner guests are possessed into dancing to the Banana Boat Song.',
        'Tim Burton directed it and Winona Ryder plays the goth daughter Lydia.',
        'Michael Keaton plays a ghost who appears when you say his name three times.',
      ],
      answer: 'Beetlejuice',
      accept: ['betelgeuse', 'beetle juice'],
    },
    {
      category: 'Drinks',
      clues: [
        'Its founder signed a 9,000 year lease on the brewery site in 1759.',
        'Cans of it have a small plastic widget inside.',
        'The dark Irish stout from Dublin.',
      ],
      answer: 'Guinness',
    },
  ],
  [
    {
      category: 'Books',
      clues: [
        'The first book has a different title in the US than in Britain.',
        'He has an owl named Hedwig.',
        'The boy wizard with a lightning bolt scar.',
      ],
      answer: 'Harry Potter',
    },
    {
      category: 'Geography',
      clues: [
        'Greenland and the Faroe Islands are part of its kingdom.',
        'Lego was founded there.',
        'Its capital is Copenhagen.',
      ],
      answer: 'Denmark',
    },
    {
      category: 'Movies',
      clues: [
        'A dog named Baxter gets punted off a bridge.',
        'Rival news teams have a street brawl, and Brick kills a guy with a trident.',
        'Will Ferrell plays San Diego newsreader Ron Burgundy.',
      ],
      answer: 'Anchorman',
      accept: ['anchorman the legend of ron burgundy'],
    },
    {
      category: 'Cars',
      clues: [
        "It was unveiled at the New York World's Fair in 1964.",
        'Steve McQueen drove one through San Francisco in Bullitt.',
        "It is Ford's pony car with a running horse badge.",
      ],
      answer: 'Mustang',
      accept: ['ford mustang'],
    },
    {
      category: 'Animals',
      clues: [
        'A contagious facial cancer has killed much of its wild population.',
        'It is the largest living meat eating marsupial.',
        'The Looney Tunes version, Taz, spins like a tornado.',
      ],
      answer: 'Tasmanian devil',
      accept: ['tasmanian devils'],
    },
  ],
  [
    {
      category: 'D&D',
      clues: [
        'The Shield spell blocks it completely.',
        'It needs no attack roll and deals force damage.',
        'It is the first level wizard spell that fires three glowing darts that always hit.',
      ],
      answer: 'Magic Missile',
    },
    {
      category: 'D&D',
      clues: [
        'With no armor on, it adds its Constitution modifier to its Armor Class.',
        'It rolls a d12 for hit points.',
        'The class that flies into a rage and hits things with a greataxe.',
      ],
      answer: 'Barbarian',
    },
    {
      category: 'Money',
      clues: [
        'The Canadian one has a caribou on it.',
        'From 1999 to 2008 the US made a different design for each of the 50 states.',
        'The 25 cent coin.',
      ],
      answer: 'Quarter',
      accept: ['quarters'],
    },
    {
      category: 'The internet',
      clues: [
        'Luis von Ahn, who later founded Duolingo, helped invent it.',
        'One version used your answers to help digitize old books.',
        'The test that makes you click every square with a traffic light.',
      ],
      answer: 'Captcha',
      accept: ['recaptcha'],
    },
    {
      category: 'Animals',
      clues: [
        'Its closest living relatives are whales and dolphins.',
        'Its skin oozes a reddish fluid that works like sunscreen.',
        'The huge African river animal that is hungry, hungry in a kids board game.',
      ],
      answer: 'Hippopotamus',
      accept: ['hippo', 'hippos'],
    },
  ],
  [
    {
      category: 'Drinks',
      clues: [
        'It is named after a beach and mine near Santiago de Cuba.',
        'Hemingway drank them at El Floridita in Havana.',
        'Rum, lime juice and sugar, often served frozen with strawberry.',
      ],
      answer: 'Daiquiri',
      accept: ['daquiri', 'dacquiri'],
    },
    {
      category: 'Video games',
      clues: [
        'The first one, in 1992, used the Mode 7 effect on the Super Nintendo for its tracks.',
        'Rainbow Road is its best known track.',
        'It is the Nintendo racing series with blue shells and banana peels.',
      ],
      answer: 'Mario Kart',
      accept: ['super mario kart', 'mariokart'],
    },
    {
      category: 'The internet',
      clues: [
        'It bought Instagram in 2012 for about a billion dollars.',
        'It began in 2004 and was open only to Harvard students.',
        'The social network Mark Zuckerberg started, where your aunt posts.',
      ],
      answer: 'Facebook',
      accept: ['fb', 'the facebook'],
    },
    {
      category: 'Movies',
      clues: [
        'Its star wrote the script and refused to sell it unless he could play the lead.',
        'It won Best Picture over Taxi Driver and Network.',
        'A Philadelphia boxer runs up the museum steps and yells for Adrian.',
      ],
      answer: 'Rocky',
    },
    {
      category: 'History',
      clues: [
        'His horse was named Bucephalus.',
        'Aristotle was his tutor.',
        'The Macedonian king who conquered from Greece to India and named a city in Egypt after himself.',
      ],
      answer: 'Alexander the Great',
      accept: ['alexander'],
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'It is named after Xalapa, a city in Veracruz, Mexico.',
        'When it is smoked and dried it is called a chipotle.',
        'The green pepper sliced on nachos and stuffed with cheese to make poppers.',
      ],
      answer: 'Jalapeno',
      accept: ['jalapeño', 'jalapenos', 'jalapeños', 'jalapeno pepper'],
    },
    {
      category: 'The body',
      clues: [
        'Its medical name is the laryngeal prominence.',
        'It is made of thyroid cartilage, and it grows more in males at puberty.',
        "The lump on the front of a man's throat, named after the first man in Genesis.",
      ],
      answer: "Adam's apple",
      accept: ['adams apple'],
    },
    {
      category: 'Space',
      clues: [
        'On average it is less dense than water.',
        'Its largest moon is Titan.',
        'The planet with the big bright rings.',
      ],
      answer: 'Saturn',
    },
    {
      category: 'Video games',
      clues: [
        'The 1986 original showed who was under the armor only if you finished fast enough.',
        'It gives half of a genre name, shared with Castlevania.',
        'Its hero is the armored bounty hunter Samus Aran.',
      ],
      answer: 'Metroid',
    },
    {
      category: 'Holidays',
      clues: [
        'It marks a victory over French forces at the Battle of Puebla in 1862.',
        "It is not Mexico's Independence Day, which is in September.",
        'The fifth of May, when Americans drink margaritas.',
      ],
      answer: 'Cinco de Mayo',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'In the wild it lives only in the waterways of Xochimilco in Mexico City.',
        'It stays in its larval form for life, keeps its feathery gills and can regrow limbs.',
        'This pink smiling salamander was added to Minecraft in 2021.',
      ],
      answer: 'Axolotl',
      accept: ['axolotls'],
    },
    {
      category: 'Games',
      clues: [
        'Its maker says a Canadian couple invented it to play on their boat.',
        'You get up to three rolls on each turn.',
        'The game with five dice, where you shout its name when all five match.',
      ],
      answer: 'Yahtzee',
    },
    {
      category: 'Video games',
      clues: [
        'Nintendo gave him his own year in 2013.',
        'He hunts ghosts in a haunted mansion with a vacuum cleaner.',
        'He is the taller brother in green, with an L on his cap.',
      ],
      answer: 'Luigi',
    },
    {
      category: 'Tech',
      clues: [
        'It was introduced on stage as three devices in one, with a music player listed first.',
        'The first model, in 2007, had no App Store.',
        'The smartphone made by Apple.',
      ],
      answer: 'iPhone',
    },
    {
      category: 'Video games',
      clues: [
        'Its Japanese title is Akumajo Dracula.',
        'It lends half its name to a genre, along with Metroid.',
        'The Belmont family hunts Dracula with a whip.',
      ],
      answer: 'Castlevania',
    },
  ],
  [
    {
      category: 'Comics',
      clues: [
        'He was created by Joe Simon and Jack Kirby.',
        'On the cover of his first issue he punches Hitler.',
        'Steve Rogers, the super soldier with the round shield.',
      ],
      answer: 'Captain America',
      accept: ['steve rogers', 'cap'],
    },
    {
      category: 'People',
      clues: [
        'A species of snapping turtle he found with his father is named after him.',
        'His family runs Australia Zoo in Queensland.',
        'The Crocodile Hunter, who said crikey a lot.',
      ],
      answer: 'Steve Irwin',
    },
    {
      category: 'TV',
      clues: [
        'Ron Howard is its narrator.',
        'The family runs a frozen banana stand, and there is always money in it.',
        'Jason Bateman plays Michael Bluth, the one sane son of a rich family that lost everything.',
      ],
      answer: 'Arrested Development',
    },
    {
      category: 'Space',
      clues: [
        'Mark Twain was born in a year it appeared and died in the next year it appeared.',
        'It was last seen from Earth in 1986.',
        'The best known ball of ice with a tail. It comes back about every 76 years.',
      ],
      answer: "Halley's Comet",
      accept: ['halley', 'halleys', 'comet halley'],
    },
    {
      category: 'Drinks',
      clues: [
        'Its name was old slang for moonshine.',
        'It was first made in Tennessee as a mixer for whiskey.',
        'It is the neon yellow citrus soda with flavors like Code Red and Baja Blast.',
      ],
      answer: 'Mountain Dew',
      accept: ['mtn dew', 'mt dew'],
    },
  ],
  [
    {
      category: 'Holidays',
      clues: [
        'It grew out of the Celtic festival of Samhain.',
        'In Ireland its lanterns were once carved from turnips instead of pumpkins.',
        'October 31. Costumes and trick or treating.',
      ],
      answer: 'Halloween',
    },
    {
      category: 'Drinks',
      clues: [
        'A Bavarian purity law from 1516 allowed only water, barley and hops in it.',
        'Hops give it its bitterness.',
        'Lager, ale, stout and IPA are all kinds of it.',
      ],
      answer: 'Beer',
    },
    {
      category: 'History',
      clues: [
        'None of the accused were burned. They were hanged, and one man was crushed under stones.',
        'The play The Crucible is about them.',
        'In 1692 a Massachusetts town executed neighbours accused of sorcery.',
      ],
      answer: 'Salem witch trials',
      accept: ['salem witch trial', 'the salem witch trials', 'salem witch hunt', 'salem'],
    },
    {
      category: 'TV',
      clues: [
        'Its crash test dummy was named Buster.',
        'Its build team was Kari, Tory and Grant.',
        'Adam and Jamie test whether urban legends are true, often with explosions.',
      ],
      answer: 'MythBusters',
      accept: ['myth busters'],
    },
    {
      category: 'History',
      clues: [
        'George Orwell used the term in a 1945 essay about the atomic bomb.',
        'It included the Berlin Airlift and the Cuban Missile Crisis.',
        'The decades long standoff between the United States and the Soviet Union.',
      ],
      answer: 'The Cold War',
    },
  ],
  [
    {
      category: 'Tech',
      clues: [
        'Its maker also built bomb disposal robots for the military.',
        'Cats ride around on it in online videos.',
        'The disc shaped robot vacuum.',
      ],
      answer: 'Roomba',
    },
    {
      category: 'Animals',
      clues: [
        'Its name comes from old words meaning thorn pig.',
        'It cannot shoot its quills, whatever people say.',
        'It is the large rodent covered in sharp quills.',
      ],
      answer: 'Porcupine',
    },
    {
      category: 'Geography',
      clues: [
        'Engineers reversed the flow of its river.',
        'It is nicknamed the Windy City.',
        'Deep dish pizza, the Bean and the Bulls.',
      ],
      answer: 'Chicago',
    },
    {
      category: 'Toys',
      clues: [
        'The NSA banned it from its offices in 1999 over fears it could record speech.',
        'It starts out speaking its own language and slowly switches to English.',
        'The furry, big eyed robot toy that everyone wanted for Christmas 1998.',
      ],
      answer: 'Furby',
      accept: ['furbie', 'furbies', 'furbys'],
    },
    {
      category: 'Animals',
      clues: [
        'There are only two living species, one in the United States and one in China.',
        'The temperature of the nest decides the sex of its young.',
        'The big Florida reptile with a wider snout than a crocodile.',
      ],
      answer: 'Alligator',
      accept: ['gator', 'alligators', 'american alligator', 'gators'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'He died at his Florida home in 1947, his mind damaged by syphilis.',
        'He was finally sent to prison for tax evasion, not murder.',
        'The Chicago gangster of the Prohibition era, nicknamed Scarface.',
      ],
      answer: 'Al Capone',
      accept: ['capone', 'alphonse capone'],
    },
    {
      category: 'TV',
      clues: [
        'Its first episode aired in 1963, the day after the Kennedy assassination.',
        'The lead role changes actors through a process called regeneration.',
        'A Time Lord travels in a blue police box called the TARDIS.',
      ],
      answer: 'Doctor Who',
      accept: ['dr who'],
    },
    {
      category: 'Space',
      clues: [
        'Its moon Ganymede is bigger than the planet Mercury.',
        'It has a giant storm called the Great Red Spot.',
        'The biggest planet in the solar system.',
      ],
      answer: 'Jupiter',
    },
    {
      category: 'Video games',
      clues: [
        'Its codename during development was Project Reality.',
        'Its controller has three handles and one analog stick.',
        'It is the cartridge console that was home to GoldenEye 007 and Ocarina of Time.',
      ],
      answer: 'Nintendo 64',
      accept: ['n64'],
    },
    {
      category: 'D&D',
      clues: [
        'Its name is borrowed from a beast of French legend said to have been tamed by Saint Martha.',
        'Its carapace can bounce a magic missile back at the caster.',
        'The colossal Godzilla-like monster that dungeon masters threaten high level parties with.',
      ],
      answer: 'Tarrasque',
      accept: ['tarasque', 'the tarrasque'],
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'For its hospital explosion the crew blew up an old candy factory in Chicago.',
        'The actor playing its villain won an Oscar after his death.',
        'Heath Ledger asks why so serious.',
      ],
      answer: 'The Dark Knight',
    },
    {
      category: 'Holidays',
      clues: [
        'Philadelphia police used the name for the traffic and crowds it brought.',
        'It is followed a few days later by Cyber Monday.',
        'The big shopping day right after American Thanksgiving.',
      ],
      answer: 'Black Friday',
    },
    {
      category: 'Animals',
      clues: [
        'Studies suggest its coat pattern keeps biting flies from landing.',
        'A group of them can be called a dazzle.',
        'The African horse with black and white stripes.',
      ],
      answer: 'Zebra',
      accept: ['zebras'],
    },
    {
      category: 'Geography',
      clues: [
        'Most of the parts tourists visit were built during the Ming dynasty.',
        'Despite the common claim, you cannot see it from the Moon with the naked eye.',
        'The fortification, thousands of miles long, built to keep invaders out of Beijing.',
      ],
      answer: 'Great Wall of China',
      accept: ['great wall', 'the great wall'],
    },
    {
      category: 'Games',
      clues: [
        'Its name is a trademark owned by Hasbro.',
        'Its pointer is called a planchette.',
        'It has the alphabet, YES, NO and GOODBYE, and is used to talk to spirits.',
      ],
      answer: 'Ouija board',
      accept: ['ouija'],
    },
  ],
  [
    {
      category: 'The internet',
      clues: [
        'Its makers first built a mobile game called Fates Forever, which failed.',
        'Its mascot is a creature named Wumpus.',
        'The chat app for gamers with servers, channels and Nitro.',
      ],
      answer: 'Discord',
    },
    {
      category: 'Food',
      clues: [
        'Pancetta is its Italian cousin, cured but usually not smoked.',
        'The American kind is cured pork belly cut in strips.',
        'It is the B in a BLT.',
      ],
      answer: 'Bacon',
    },
    {
      category: 'Drinks',
      clues: [
        'It was developed in 1965 by a team led by Dr. Robert Cade.',
        'It is named after the University of Florida football team.',
        'The sports drink that gets dumped on winning coaches.',
      ],
      answer: 'Gatorade',
    },
    {
      category: 'The body',
      clues: [
        'Its name comes from the Latin for little grape.',
        'It helps close off the nose when you swallow.',
        'The dangly bit hanging at the back of your throat.',
      ],
      answer: 'Uvula',
    },
    {
      category: 'Food',
      clues: [
        'Each kernel bursts when the water inside it turns to steam.',
        'Orville Redenbacher built a brand on it.',
        'It is the movie theater snack sold in buckets with butter.',
      ],
      answer: 'Popcorn',
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'Its first episode was animated with real construction paper cutouts.',
        'Each episode is usually written and animated in about six days.',
        'Four foul mouthed boys in Colorado, one of whom kept getting killed.',
      ],
      answer: 'South Park',
    },
    {
      category: 'People',
      clues: [
        'He spent twenty years in the US Air Force and retired as a master sergeant.',
        'He painted with a wet on wet oil technique and finished a canvas in under half an hour.',
        'He had a big perm and painted happy little trees on PBS.',
      ],
      answer: 'Bob Ross',
    },
    {
      category: 'Movies',
      clues: [
        'It was filmed in Preston, Idaho.',
        "The hero's brother Kip spends his days chatting online with babes.",
        'It is the 2004 comedy with Vote for Pedro shirts and a llama named Tina.',
      ],
      answer: 'Napoleon Dynamite',
    },
    {
      category: 'Drinks',
      clues: [
        'The wire cage that holds its cork in is called a muselet.',
        'It is named after the region of France it comes from.',
        "The sparkling wine people pop on New Year's Eve.",
      ],
      answer: 'Champagne',
    },
    {
      category: 'Video games',
      clues: [
        'It was first shown to the public at a Macworld event in 1999.',
        'Bungie made it before making Destiny.',
        'Master Chief fights the Covenant on a ring shaped world.',
      ],
      answer: 'Halo',
      accept: ['halo combat evolved', 'halo ce', 'halo 1'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'His Spartan tag is 117.',
        'His first name is John and his AI companion is Cortana.',
        'He is the green armored hero of Halo.',
      ],
      answer: 'Master Chief',
      accept: ['john 117', 'the chief'],
    },
    {
      category: 'Food',
      clues: [
        'A franchisee named Jim Delligatti created it near Pittsburgh in the 1960s.',
        'The Economist uses its price to compare currencies.',
        'Two all beef patties, special sauce, lettuce, cheese, pickles, onions on a sesame seed bun.',
      ],
      answer: 'Big Mac',
      accept: ['bigmac'],
    },
    {
      category: 'Drinks',
      clues: [
        'It was invented by an Atlanta pharmacist named John Pemberton.',
        'In 1985 it changed its formula, and the backlash brought the old one back.',
        'The soda in the red can whose rival is Pepsi.',
      ],
      answer: 'Coca-Cola',
      accept: ['coke', 'coca cola', 'cocacola'],
    },
    {
      category: 'Geography',
      clues: [
        'It sits on top of a supervolcano.',
        'In 1872 it became the first national park in the United States.',
        'The park where the geyser Old Faithful erupts.',
      ],
      answer: 'Yellowstone',
      accept: ['yellowstone national park'],
    },
    {
      category: 'Music',
      clues: [
        'The band is named after slang for a day spent doing nothing but smoking weed.',
        'Their album Dookie came out in 1994.',
        'The band behind American Idiot and Wake Me Up When September Ends.',
      ],
      answer: 'Green Day',
    },
  ],
  [
    {
      category: 'People',
      clues: [
        'In his will he left his wife his second best bed.',
        'His company performed at the Globe Theatre in London.',
        'He wrote Hamlet and Romeo and Juliet.',
      ],
      answer: 'Shakespeare',
      accept: ['william shakespeare'],
    },
    {
      category: 'Animals',
      clues: [
        'A baby one is called a hoglet.',
        'It is covered in spines and rolls into a ball when threatened.',
        'The small spiny animal that Sonic is.',
      ],
      answer: 'Hedgehog',
      accept: ['hedgehogs'],
    },
    {
      category: 'D&D',
      clues: [
        'Gary Gygax based it on a cheap plastic toy he used as a miniature.',
        "Lore usually blames a wizard's experiment for its creation.",
        'It has the body of a grizzly and the head of a nocturnal bird.',
      ],
      answer: 'Owlbear',
    },
    {
      category: 'Movies',
      clues: [
        'Eric Stoltz was filmed in the lead role for weeks before being replaced.',
        'The magic speed is 88 miles per hour.',
        'Marty McFly travels to 1955 in a DeLorean.',
      ],
      answer: 'Back to the Future',
    },
    {
      category: 'Animals',
      clues: [
        'Puppies often have a soft spot on the skull called a molera.',
        'It is named after a Mexican state and one starred in Taco Bell ads.',
        'The tiny dog that shakes and fits in a purse.',
      ],
      answer: 'Chihuahua',
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'France last used one in 1977.',
        'It is named after a doctor who argued for a quicker and more humane method.',
        'The falling blade of the French Revolution.',
      ],
      answer: 'Guillotine',
    },
    {
      category: 'Music',
      clues: [
        'She won the Best Actress Oscar for Moonstruck.',
        'Her song Believe turned Auto-Tune into a pop effect.',
        'She started out in a duo with her husband Sonny.',
      ],
      answer: 'Cher',
    },
    {
      category: 'Books',
      clues: [
        'In the original stories he never says "Elementary, my dear Watson".',
        'His author killed him off at the Reichenbach Falls and later brought him back.',
        'The detective who lives at 221B Baker Street.',
      ],
      answer: 'Sherlock Holmes',
      accept: ['sherlock', 'holmes'],
    },
    {
      category: 'Holidays',
      clues: [
        'Its parades are run by social clubs called krewes.',
        'A king cake with a small plastic baby inside is eaten in the weeks before it.',
        'It is the New Orleans party with beads, held the day before Lent starts.',
      ],
      answer: 'Mardi Gras',
      accept: ['fat tuesday'],
    },
    {
      category: 'People',
      clues: [
        'He was born in San Francisco and raised in Hong Kong.',
        'He played Kato in The Green Hornet.',
        'The martial arts star of Enter the Dragon, who died in 1973 at age 32.',
      ],
      answer: 'Bruce Lee',
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'In his first game, naming your save file after the princess starts the second quest.',
        'He is left handed in most of his games.',
        'He is the hero in the green tunic who people keep calling Zelda.',
      ],
      answer: 'Link',
    },
    {
      category: 'Animals',
      clues: [
        'With its mouth shut you can still see the fourth tooth of its lower jaw.',
        'The saltwater kind is the largest living reptile.',
        'It looks like an alligator but has a narrower, V shaped snout.',
      ],
      answer: 'Crocodile',
      accept: ['croc', 'crocodiles'],
    },
    {
      category: 'D&D',
      clues: [
        'Their name comes from a sprite in German folklore, which also gave cobalt its name.',
        'In fifth edition they have Pack Tactics and are weakened by sunlight.',
        'The small scaly monsters who build traps and serve dragons.',
      ],
      answer: 'Kobold',
      accept: ['kobolds'],
    },
    {
      category: 'The bathroom',
      clues: [
        'The old clawfoot kind was cast iron coated in porcelain enamel.',
        'Archimedes is said to have shouted Eureka while getting into one.',
        'You fill it with hot water and soak. Rubber ducks live there.',
      ],
      answer: 'Bathtub',
      accept: ['bath', 'tub', 'bath tub'],
    },
    {
      category: 'The body',
      clues: [
        'It sits under the left ribs and can rupture in a car crash.',
        'It filters out old red blood cells, and you can live without it.',
        'To vent it is to let your anger out. It rhymes with green.',
      ],
      answer: 'Spleen',
    },
  ],
  [
    {
      category: 'D&D',
      clues: [
        'They reproduce by putting a tadpole in a host, a process called ceremorphosis.',
        'They are also called illithids and answer to elder brains.',
        'It is the squid faced monster that eats brains.',
      ],
      answer: 'Mind Flayer',
      accept: ['illithid', 'mindflayer', 'mind flayers'],
    },
    {
      category: 'D&D',
      clues: [
        'In fifth edition its material component is a tiny ball of bat guano and sulfur.',
        'It deals 8d6 damage in a 20 foot radius.',
        'The 3rd level wizard spell that blows up the room and often the party.',
      ],
      answer: 'Fireball',
    },
    {
      category: 'Drinks',
      clues: [
        'It was adapted from a Thai tonic called Krating Daeng.',
        'It sponsored a skydive from the stratosphere in 2012.',
        'The energy drink that says it gives you wings.',
      ],
      answer: 'Red Bull',
      accept: ['redbull'],
    },
    {
      category: 'Video games',
      clues: [
        'Rovio, a Finnish studio, released it in 2009.',
        'The enemies are green pigs who stole some eggs.',
        'You slingshot furious feathered things at rickety towers on your phone.',
      ],
      answer: 'Angry Birds',
      accept: ['angry bird'],
    },
    {
      category: 'Cars',
      clues: [
        'It was built in a factory near Belfast in Northern Ireland.',
        'It has gull-wing doors and an unpainted stainless steel body.',
        'The time machine in Back to the Future.',
      ],
      answer: 'DeLorean',
      accept: ['dmc-12', 'dmc 12', 'dmc delorean', 'delorean dmc-12'],
    },
  ],
  [
    {
      category: 'Money',
      clues: [
        'Since 1982 the American one has been mostly zinc.',
        'Canada stopped handing out its own in 2013.',
        'It is the one cent coin.',
      ],
      answer: 'Penny',
      accept: ['pennies'],
    },
    {
      category: 'Cars',
      clues: [
        'Its first car, the Roadster, used a chassis based on the Lotus Elise.',
        'Its four main model names were chosen to spell out S3XY.',
        'The electric car brand named after the inventor Nikola.',
      ],
      answer: 'Tesla',
    },
    {
      category: 'D&D',
      clues: [
        'Champion fighters can get one on a 19.',
        'In fifth edition it lets you roll the damage dice twice.',
        'What you get when you roll a natural 20 on an attack.',
      ],
      answer: 'Critical hit',
      accept: ['crit', 'critical', 'critical strike'],
    },
    {
      category: 'D&D',
      clues: [
        'In fifth edition its Nimble Escape lets it Disengage or Hide as a bonus action.',
        'They are often bossed around by bugbears.',
        'Small, green and nasty. In Harry Potter they run the bank.',
      ],
      answer: 'Goblin',
      accept: ['goblins'],
    },
    {
      category: 'Music',
      clues: [
        'They share their name with a Swedish canned fish company and asked its permission.',
        'They won the Eurovision Song Contest in 1974 with Waterloo.',
        'They sang Dancing Queen and Mamma Mia.',
      ],
      answer: 'ABBA',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'The right one has three lobes and the left has two.',
        'Gas exchange happens in their tiny sacs, called alveoli.',
        'They are the pair of organs you breathe with.',
      ],
      answer: 'Lungs',
      accept: ['lung'],
    },
    {
      category: 'Music',
      clues: [
        'It has a chanter for the melody and drones for the constant note.',
        'The player blows into it and squeezes it under one arm.',
        'The loud Scottish instrument played by people in kilts.',
      ],
      answer: 'Bagpipes',
      accept: ['bagpipe', 'pipes', 'the pipes'],
    },
    {
      category: 'Comics',
      clues: [
        'Its two leads are named after a theologian and a philosopher.',
        'Its creator, Bill Watterson, refused to license merchandise.',
        'A newspaper strip about a boy and his stuffed tiger.',
      ],
      answer: 'Calvin and Hobbes',
      accept: ['calvin & hobbes', 'calvin and hobbs'],
    },
    {
      category: 'Drinks',
      clues: [
        'Its name comes from a Gaelic phrase meaning water of life.',
        'The bourbon kind must be aged in new charred oak barrels.',
        "Jack Daniel's and Jameson are brands of it.",
      ],
      answer: 'Whiskey',
      accept: ['whisky'],
    },
    {
      category: 'The internet',
      clues: [
        'Its first name was BackRub.',
        'Its name is a play on the word for a 1 followed by 100 zeros.',
        'The search engine whose name became a verb.',
      ],
      answer: 'Google',
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'Its first game, in 1997, was a spiritual successor to Wasteland.',
        'Its mascot is a smiling cartoon man giving a thumbs up.',
        'The post nuclear RPG series with Vaults, Pip-Boys and bottle caps for money.',
      ],
      answer: 'Fallout',
      accept: ['fallout 3', 'fallout 4', 'fallout new vegas', 'fallout 2', 'fallout 1'],
    },
    {
      category: 'Music',
      clues: [
        'Dave Mustaine was fired from it before the first album and went on to form Megadeth.',
        'Its drummer is Lars Ulrich.',
        'It is the band behind Enter Sandman and Master of Puppets.',
      ],
      answer: 'Metallica',
    },
    {
      category: 'Animals',
      clues: [
        'Its German name means wash bear, because it dunks its food in water.',
        'Its English name comes from a Powhatan word about using its hands.',
        'A masked animal with a ringed tail that raids garbage cans at night.',
      ],
      answer: 'Raccoon',
      accept: ['racoon', 'trash panda'],
    },
    {
      category: 'Sports',
      clues: [
        "On film, Patches O'Houlihan teaches it by throwing wrenches.",
        "In a 2004 comedy Vince Vaughn's gym plays it against Ben Stiller's.",
        'The gym class game where you throw rubber balls at the other team.',
      ],
      answer: 'Dodgeball',
      accept: ['dodge ball'],
    },
    {
      category: 'Geography',
      clues: [
        'Its name comes from an old Spanish word for a seabird.',
        'Native American activists occupied it from 1969 to 1971.',
        'The island prison in San Francisco Bay.',
      ],
      answer: 'Alcatraz',
      accept: ['alcatraz island', 'the rock'],
    },
  ],
  [
    {
      category: 'Geography',
      clues: [
        'It is the largest island in the Caribbean.',
        'A failed invasion landed at its Bay of Pigs in 1961.',
        'Havana, cigars and old American cars.',
      ],
      answer: 'Cuba',
    },
    {
      category: 'Holidays',
      clues: [
        'Its date is set by the first full moon on or after the spring equinox.',
        'Its date moves every year but it always lands on a Sunday.',
        'Chocolate eggs and a bunny.',
      ],
      answer: 'Easter',
      accept: ['easter sunday'],
    },
    {
      category: 'The body',
      clues: [
        'It makes bile, which is then stored in the gallbladder.',
        'It can regrow after a large part of it is removed.',
        'Heavy drinking scars this organ, which is called cirrhosis.',
      ],
      answer: 'Liver',
    },
    {
      category: 'Music',
      clues: [
        'The band is said to have taken its name from a label on a sewing machine.',
        'Brian Johnson replaced singer Bon Scott, who died in 1980.',
        'Guitarist Angus Young wears a schoolboy uniform. They did Thunderstruck and Back in Black.',
      ],
      answer: 'AC/DC',
      accept: ['acdc', 'ac dc'],
    },
    {
      category: 'D&D',
      clues: [
        'In the earliest editions this class was called the thief.',
        "In fifth edition it starts with expertise and a secret language called thieves' cant.",
        'The sneak attack class that picks locks and checks for traps.',
      ],
      answer: 'Rogue',
    },
  ],
  [
    {
      category: 'Toys',
      clues: [
        'Its name comes from the Danish words for play well.',
        'The company started out making wooden toys in the town of Billund.',
        'These plastic bricks hurt when you step on them barefoot.',
      ],
      answer: 'Lego',
      accept: ['legos'],
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in Fantastic Four number 52 in 1966.',
        'His suit is made with vibranium.',
        "T'Challa, king of Wakanda, played on film by Chadwick Boseman.",
      ],
      answer: 'Black Panther',
    },
    {
      category: 'Movies',
      clues: [
        'Mario Puzo wrote the novel and co-wrote the screenplay.',
        'Marlon Brando turned down the Oscar he won for it.',
        'A man wakes up next to a horse head. An offer he cannot refuse.',
      ],
      answer: 'The Godfather',
    },
    {
      category: 'Science',
      clues: [
        'It is pure carbon and will burn if you get it hot enough.',
        'It scores 10 on the Mohs scale of hardness.',
        'The gem in most engagement rings.',
      ],
      answer: 'Diamond',
      accept: ['diamonds'],
    },
    {
      category: 'Tech',
      clues: [
        'Its name does not stand for anything. A branding firm made it up.',
        'Its technical standards are numbered 802.11.',
        "What you ask for the password to at a friend's house.",
      ],
      answer: 'Wi-Fi',
      accept: ['wifi', 'wi fi'],
    },
  ],
  [
    {
      category: 'Books',
      clues: [
        'After many rejections it was published by Chilton, known for car repair manuals.',
        'It is set on the desert planet Arrakis.',
        'Spice, sandworms and Paul Atreides.',
      ],
      answer: 'Dune',
    },
    {
      category: 'Geography',
      clues: [
        'Its Tibetan name is Chomolungma.',
        'Edmund Hillary and Tenzing Norgay reached the top in 1953.',
        'The highest mountain on Earth.',
      ],
      answer: 'Everest',
      accept: ['mount everest', 'mt everest'],
    },
    {
      category: 'History',
      clues: [
        'He wrote an essay about farting, addressed to a royal academy.',
        'He invented bifocals and the lightning rod.',
        'His face is on the US hundred dollar bill. He is the kite and key guy.',
      ],
      answer: 'Benjamin Franklin',
      accept: ['ben franklin', 'franklin'],
    },
    {
      category: 'Movies',
      clues: [
        'The author of the novel disliked the film and later backed a TV miniseries version.',
        'A boy rides a tricycle through hotel hallways and meets twin girls.',
        "Jack Nicholson chops through a door with an axe and says here's Johnny.",
      ],
      answer: 'The Shining',
    },
    {
      category: 'The body',
      clues: [
        'Its islets of Langerhans contain beta cells.',
        'It sits behind the stomach and makes digestive enzymes.',
        'It is the organ that makes insulin.',
      ],
      answer: 'Pancreas',
    },
  ],
  [
    {
      category: 'Sports',
      clues: [
        'The lane is 60 feet long from the foul line to the head pin.',
        'A perfect game scores 300.',
        'You rent shoes and roll a heavy ball at ten pins.',
      ],
      answer: 'Bowling',
      accept: ['ten pin bowling', 'tenpin bowling'],
    },
    {
      category: 'Books',
      clues: [
        "It was William Golding's first novel, published in 1954.",
        'A boy called Piggy has his glasses used to start fires.',
        'Schoolboys stranded on an island turn savage and fight over a conch.',
      ],
      answer: 'Lord of the Flies',
    },
    {
      category: 'Animals',
      clues: [
        'Males fight by swinging their heads at each other, which is called necking.',
        'It has seven neck bones, the same number as a human.',
        'The tallest animal on land, with a very long neck.',
      ],
      answer: 'Giraffe',
      accept: ['giraffes'],
    },
    {
      category: 'Video games',
      clues: [
        'It started as a Half-Life mod by Minh Le and Jess Cliffe.',
        'Its maps include Dust II, Inferno and Nuke.',
        'Terrorists plant the bomb and the other team tries to defuse it.',
      ],
      answer: 'Counter-Strike',
      accept: ['counter strike', 'counterstrike', 'cs', 'csgo', 'cs go', 'cs2', 'counter-strike 2', 'counter-strike global offensive'],
    },
    {
      category: 'Music',
      clues: [
        'Its title comes from a 1968 film that George Harrison wrote the music for.',
        "It is on the album (What's the Story) Morning Glory?",
        'The Oasis song that every guy with an acoustic guitar plays at parties.',
      ],
      answer: 'Wonderwall',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'The al pastor kind is carved off a vertical spit, a method brought to Mexico by Lebanese immigrants.',
        'Americans are told to eat them on Tuesdays.',
        'A folded tortilla with filling, in a hard or soft shell.',
      ],
      answer: 'Taco',
      accept: ['tacos'],
    },
    {
      category: 'Food',
      clues: [
        'Belgium and France both claim to have invented them.',
        'In Britain the thick ones are called chips.',
        'Deep fried potato sticks that come with a burger.',
      ],
      answer: 'French fries',
      accept: ['fries', 'french fry'],
    },
    {
      category: 'Video games',
      clues: [
        'Its hero has the default first name John or Jane.',
        "Fans were angry enough at the third game's ending that an extended cut was released.",
        'It is the BioWare space trilogy starring Commander Shepard.',
      ],
      answer: 'Mass Effect',
    },
    {
      category: 'Music',
      clues: [
        'They added a number to their name after an Irish band with the same name objected.',
        "The members run naked through the streets in the video for What's My Age Again.",
        'The pop punk trio with Travis Barker on drums who did All the Small Things.',
      ],
      answer: 'Blink-182',
      accept: ['blink 182', 'blink182', 'blink'],
    },
    {
      category: 'D&D',
      clues: [
        "For most of the game's history they would not wear metal armor.",
        'Their signature ability is Wild Shape.',
        'The nature class that turns into a bear.',
      ],
      answer: 'Druid',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'One species can revert to its juvenile stage and is nicknamed immortal.',
        'It has no brain, no heart and no bones.',
        'The see through sea creature with stinging tentacles.',
      ],
      answer: 'Jellyfish',
      accept: ['jelly fish', 'jellies'],
    },
    {
      category: 'Animals',
      clues: [
        'It has an enlarged wrist bone that works like a thumb.',
        'Its newborns are pink and about the size of a stick of butter.',
        'It is the black and white bear from China that eats bamboo.',
      ],
      answer: 'Panda',
      accept: ['giant panda', 'panda bear'],
    },
    {
      category: 'Movies',
      clues: [
        'It was shot in black and white in the store where its director worked.',
        'The lead keeps saying he is not even supposed to be here today.',
        "Kevin Smith's first film, which introduced Jay and Silent Bob.",
      ],
      answer: 'Clerks',
    },
    {
      category: 'The body',
      clues: [
        'Some people never grow any of them.',
        'They usually come in between the ages of 17 and 25.',
        'The third molars at the very back, which many people get pulled.',
      ],
      answer: 'Wisdom teeth',
      accept: ['wisdom tooth'],
    },
    {
      category: 'Drinks',
      clues: [
        'By US law it must be aged in new charred oak containers.',
        'Its mash must be at least 51 percent corn.',
        'The American whiskey most tied to Kentucky.',
      ],
      answer: 'Bourbon',
      accept: ['bourbon whiskey', 'bourbon whisky'],
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'Its tusk is a tooth that grows out through the upper lip.',
        'Its tusks were once sold in Europe as unicorn horns.',
        'It is the Arctic whale with one long spiral tusk.',
      ],
      answer: 'Narwhal',
    },
    {
      category: 'Animals',
      clues: [
        'In German, the verb for hoarding or panic buying is taken from its name.',
        'It carries food in cheek pouches that stretch back to its shoulders.',
        'The small pet rodent that runs on a wheel all night.',
      ],
      answer: 'Hamster',
      accept: ['hamsters'],
    },
    {
      category: 'Music',
      clues: [
        'He dropped the surname Jones to avoid being confused with one of the Monkees.',
        'He played the Goblin King in Labyrinth.',
        'Ziggy Stardust, Space Oddity and a lightning bolt across the face.',
      ],
      answer: 'David Bowie',
      accept: ['bowie'],
    },
    {
      category: 'Geography',
      clues: [
        'Its name means the land beyond the forest.',
        'It is a region of Romania bordered by the Carpathian Mountains.',
        'The home of Count Dracula.',
      ],
      answer: 'Transylvania',
    },
    {
      category: 'Games',
      clues: [
        'British callers use nicknames like two fat ladies for 88.',
        'The North American card is five by five with a free space in the middle.',
        'You mark off called numbers and shout the name of the game when you get a line.',
      ],
      answer: 'Bingo',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'It descends from a paste made in Piedmont when cocoa was scarce after World War II.',
        'It is made by Ferrero, the Italian company behind Tic Tac and Kinder.',
        'It is the chocolate hazelnut spread sold in a jar with a white lid.',
      ],
      answer: 'Nutella',
    },
    {
      category: 'TV',
      clues: [
        'Its music is by Yoko Kanno and her band Seatbelts.',
        'The crew includes a corgi named Ein.',
        'An anime about Spike Spiegel and other bounty hunters in space, set to jazz.',
      ],
      answer: 'Cowboy Bebop',
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in issue 39 of Tales of Suspense.',
        'He built his first suit of armour while held captive in a cave.',
        'Tony Stark.',
      ],
      answer: 'Iron Man',
      accept: ['ironman'],
    },
    {
      category: 'TV',
      clues: [
        'It was first pitched under the title Montauk.',
        'Its monsters are named after D&D creatures, such as the Demogorgon.',
        'The Netflix show with Eleven and the Upside Down.',
      ],
      answer: 'Stranger Things',
    },
    {
      category: 'People',
      clues: [
        'She played Sue Ann Nivens on The Mary Tyler Moore Show.',
        'She hosted Saturday Night Live at 88 after a Facebook campaign.',
        'She was Rose on The Golden Girls and died a few weeks before turning 100.',
      ],
      answer: 'Betty White',
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'Mark Hamill voices its main villain, Fire Lord Ozai.',
        'A cabbage merchant keeps having his cart destroyed.',
        'Aang is a bald kid with an arrow on his head who controls all four elements.',
      ],
      answer: 'Avatar: The Last Airbender',
      accept: ['avatar', 'the last airbender', 'last airbender', 'atla', 'avatar the last airbender'],
    },
    {
      category: 'Science',
      clues: [
        'Its symbol comes from the Latin name for Cyprus.',
        'It turns green with age, as on the Statue of Liberty.',
        'The reddish metal in electrical wire and on pennies.',
      ],
      answer: 'Copper',
    },
    {
      category: 'Food',
      clues: [
        'It takes about 40 gallons of sap to make one gallon of it.',
        "Quebec makes most of the world's supply and keeps a strategic reserve.",
        'It is the sweet tree product you pour on pancakes.',
      ],
      answer: 'Maple syrup',
    },
    {
      category: 'Video games',
      clues: [
        'South Korea had television channels that broadcast professional matches of it.',
        'Its three races are Terran, Protoss and Zerg.',
        "Blizzard's sci-fi strategy game from 1998, where losing fast to a swarm is called getting rushed.",
      ],
      answer: 'StarCraft',
      accept: ['star craft', 'starcraft brood war'],
    },
    {
      category: 'Music',
      clues: [
        'He served in the US Army in Germany when he was already a star.',
        'His home in Memphis is called Graceland.',
        'The King of Rock and Roll.',
      ],
      answer: 'Elvis Presley',
      accept: ['elvis'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'Pliny the Younger wrote an eyewitness account of what destroyed it.',
        'It was buried in the year 79 and dug up centuries later, graffiti and all.',
        'It is the Roman city buried by the eruption of Mount Vesuvius.',
      ],
      answer: 'Pompeii',
    },
    {
      category: 'Games',
      clues: [
        'Its name comes from a Swahili word meaning to build.',
        'A full set has 54 wooden blocks.',
        'You pull blocks out of a tower and stack them on top until it falls.',
      ],
      answer: 'Jenga',
    },
    {
      category: 'Food',
      clues: [
        'They were first made in Britain and share their name with a British pub bowling game.',
        'The green one was switched from lime to green apple in 2013, and later switched back.',
        'The candy that tells you to taste the rainbow.',
      ],
      answer: 'Skittles',
    },
    {
      category: 'Books',
      clues: [
        'A cart horse named Boxer works himself to collapse and is sold to the knacker.',
        'Its rule ends up saying all are equal, but some are more equal than others.',
        "George Orwell's short novel where pigs led by Napoleon overthrow Mr. Jones and take over.",
      ],
      answer: 'Animal Farm',
    },
    {
      category: 'D&D',
      clues: [
        'The fifth edition guide written for this person has a lich on its cover.',
        'They sit behind a screen and roll where you cannot see.',
        'The person who runs the game, voices the monsters and tells the story.',
      ],
      answer: 'Dungeon Master',
      accept: ['dm', 'game master', 'gm'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'Its combo system began as an unintended quirk that the developers left in.',
        'One bonus stage has you wreck a car with your bare hands.',
        'The 1991 arcade hit where Ryu and Ken throw hadoukens.',
      ],
      answer: 'Street Fighter II',
      accept: ['street fighter', 'street fighter 2', 'sf2'],
    },
    {
      category: 'Animals',
      clues: [
        'One named Koko was taught a version of sign language.',
        'Older adult males are called silverbacks.',
        'The largest living ape. Donkey Kong is one.',
      ],
      answer: 'Gorilla',
      accept: ['gorillas'],
    },
    {
      category: 'Science',
      clues: [
        'An X-ray image called Photo 51, taken under Rosalind Franklin, helped reveal its shape.',
        'Its four bases are written A, T, C and G.',
        'The double helix that carries your genes.',
      ],
      answer: 'DNA',
      accept: ['deoxyribonucleic acid'],
    },
    {
      category: 'Video games',
      clues: [
        'It was first written in 1971 by three student teachers in Minnesota.',
        'You can start as a banker from Boston, a carpenter or a farmer.',
        'It is the classroom computer game where your wagon party dies of dysentery.',
      ],
      answer: 'The Oregon Trail',
    },
    {
      category: 'Sports',
      clues: [
        'Its modern rules are named after the Marquess of Queensberry.',
        'Title fights are scheduled for twelve three minute rounds.',
        'Two people in padded gloves punch each other in a ring. Muhammad Ali did it.',
      ],
      answer: 'Boxing',
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'It is loosely based on The Snow Queen by Hans Christian Andersen.',
        'It is set in the kingdom of Arendelle.',
        'Elsa sings Let It Go.',
      ],
      answer: 'Frozen',
    },
    {
      category: 'D&D',
      clues: [
        'In the original game this class was called the magic-user.',
        'It learns spells by copying them into a book.',
        'The robed, pointy hat class. Gandalf and Merlin are called this.',
      ],
      answer: 'Wizard',
    },
    {
      category: 'Music',
      clues: [
        'Before they settled on their name they were called Starfish.',
        'Their debut album was Parachutes.',
        "Chris Martin's band, of Yellow, Clocks and Viva la Vida.",
      ],
      answer: 'Coldplay',
    },
    {
      category: 'Geography',
      clues: [
        'Flight 19, five Navy bombers, vanished there in 1945.',
        'Its corners are usually given as Miami, San Juan and an island in the Atlantic.',
        'Ships and planes are said to vanish in this three sided patch of ocean.',
      ],
      answer: 'Bermuda Triangle',
      accept: ['the devils triangle'],
    },
    {
      category: 'Movies',
      clues: [
        'Two of its cast members later became US state governors.',
        'The creature sees heat, so the hero covers himself in mud.',
        'It is the 1987 Schwarzenegger film with the line Get to the choppa.',
      ],
      answer: 'Predator',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'The cremaster muscle raises and lowers them.',
        'They sit outside the body to stay a little cooler than the rest of it.',
        'The pair that hangs in the scrotum. A kick to them ends the fight.',
      ],
      answer: 'Testicles',
      accept: ['balls', 'testicle', 'testes', 'nuts'],
    },
    {
      category: 'Words',
      clues: [
        'It comes from the Latin word fenestra.',
        'A case of it in Prague in 1618 helped start the Thirty Years War.',
        'It means throwing someone out of a window.',
      ],
      answer: 'Defenestration',
      accept: ['defenestrate'],
    },
    {
      category: 'Games',
      clues: [
        'It was designed by a mathematician named Richard Garfield.',
        'The Black Lotus is its most prized card.',
        'It is the trading card game where you tap lands for mana.',
      ],
      answer: 'Magic: The Gathering',
      accept: ['magic', 'mtg', 'magic the gathering'],
    },
    {
      category: 'Animals',
      clues: [
        'On a deep dive its heart can slow to a couple of beats per minute.',
        'It feeds almost entirely on krill, filtered through baleen.',
        'The largest animal known to have ever lived, bigger than any dinosaur.',
      ],
      answer: 'Blue whale',
      accept: ['blue whales'],
    },
    {
      category: 'Video games',
      clues: [
        'It opens with a bombing raid on a Mako reactor in Midgar.',
        'It came on three discs for the original PlayStation in 1997.',
        'Cloud and his huge sword go after Sephiroth.',
      ],
      answer: 'Final Fantasy VII',
      accept: ['final fantasy 7', 'ff7', 'ffvii', 'ff vii', 'ff 7'],
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Its dough is laminated, meaning butter is folded into it over and over.',
        'Its ancestor is the Austrian kipferl, though France gets the credit.',
        'A flaky, buttery, crescent shaped pastry.',
      ],
      answer: 'Croissant',
    },
    {
      category: 'Video games',
      clues: [
        'The towers on its startup screen reflect the games logged on your memory card.',
        'Many people bought it partly as a cheap DVD player.',
        "It is Sony's second console, launched in 2000.",
      ],
      answer: 'PlayStation 2',
      accept: ['ps2', 'playstation two', 'play station 2'],
    },
    {
      category: 'D&D',
      clues: [
        'In first edition you had to level as a fighter and then a thief before becoming one.',
        'Its signature feature hands allies an extra die called Inspiration.',
        'The class that casts spells with a lute and tries to seduce everything.',
      ],
      answer: 'Bard',
    },
    {
      category: 'Video games',
      clues: [
        'Its map is called the Lands Between.',
        'George R. R. Martin wrote the backstory for its world.',
        'The 2022 FromSoftware open world game where you play a Tarnished and die to Malenia.',
      ],
      answer: 'Elden Ring',
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in Amazing Fantasy issue 15 in 1962.',
        'His Uncle Ben is killed by a burglar he could have stopped earlier.',
        'Peter Parker, who swings between buildings on webs.',
      ],
      answer: 'Spider-Man',
      accept: ['spiderman', 'spider man'],
    },
  ],
  [
    {
      category: 'Geography',
      clues: [
        'Annie Edson Taylor went over it in a barrel in 1901 and lived.',
        'It has three parts, and the largest is called the Horseshoe.',
        'It is the big waterfall on the border of Ontario and New York.',
      ],
      answer: 'Niagara Falls',
      accept: ['niagara'],
    },
    {
      category: 'Food',
      clues: [
        'Its name comes from a Nahuatl word that was also used to mean testicle.',
        'The Hass variety is the one most often sold in North American stores.',
        'It gets mashed into guacamole.',
      ],
      answer: 'Avocado',
      accept: ['avocados'],
    },
    {
      category: 'The bathroom',
      clues: [
        'Colgate sold it in jars before switching to tubes in the 1890s.',
        'Dentists say a pea sized amount is enough.',
        'You squeeze it onto a brush twice a day. Crest is a brand.',
      ],
      answer: 'Toothpaste',
    },
    {
      category: 'TV',
      clues: [
        'Its tuba heavy theme is an Italian piece called Frolic.',
        'Scenes are improvised from an outline instead of a full script.',
        'Larry David plays himself and annoys everyone he meets.',
      ],
      answer: 'Curb Your Enthusiasm',
      accept: ['curb'],
    },
    {
      category: 'Science',
      clues: [
        'It is by far the weakest of the four fundamental forces.',
        'On the Moon it is about one sixth as strong as on Earth.',
        'The force that made the apple fall on Newton.',
      ],
      answer: 'Gravity',
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'Its hero is known as the Ghost of Sparta.',
        'The 2018 entry moved the series from Greek myth to Norse myth.',
        'Kratos and his son, whom he mostly calls Boy.',
      ],
      answer: 'God of War',
      accept: ['god of war ragnarok'],
    },
    {
      category: 'History',
      clues: [
        'They called part of North America Vinland.',
        'There is no evidence they wore horned helmets into battle.',
        'Norse raiders who crossed the sea in longships.',
      ],
      answer: 'Vikings',
      accept: ['viking', 'the vikings'],
    },
    {
      category: 'Science',
      clues: [
        'As a liquid it is pale blue.',
        'It is the most abundant element in the crust of the Earth.',
        'It is the gas we need to breathe, element number 8.',
      ],
      answer: 'Oxygen',
    },
    {
      category: 'D&D',
      clues: [
        'Putting one inside a portable hole tears a rift to the Astral Plane.',
        'It holds up to 500 pounds of gear but weighs the same no matter what is in it.',
        'This magic sack is bigger on the inside and carries the party loot.',
      ],
      answer: 'Bag of Holding',
    },
    {
      category: 'Movies',
      clues: [
        'It won Best Picture, and nobody in it says play it again, Sam.',
        'It is set in Morocco during the Second World War.',
        "Humphrey Bogart says here's looking at you, kid.",
      ],
      answer: 'Casablanca',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'It comes from the seed pod of an orchid.',
        'Much of the real stuff is grown in Madagascar.',
        'The plain white ice cream flavour. The word is also slang for boring.',
      ],
      answer: 'Vanilla',
    },
    {
      category: 'Animals',
      clues: [
        'Its eyes move independently of each other.',
        'It catches insects with a sticky tongue that can be longer than its body.',
        'The lizard known for changing color.',
      ],
      answer: 'Chameleon',
    },
    {
      category: 'Video games',
      clues: [
        "You collect Jiggies and musical notes to get through Gruntilda's lair.",
        'Rare made it for the Nintendo 64 in 1998.',
        'A bear carries a loudmouthed bird in his backpack.',
      ],
      answer: 'Banjo-Kazooie',
      accept: ['banjo kazooie', 'banjo and kazooie', 'banjo'],
    },
    {
      category: 'The body',
      clues: [
        'They are made of keratin, the same protein as hair.',
        'They grow faster than the matching ones on your feet.',
        'You clip them, bite them or paint them.',
      ],
      answer: 'Fingernail',
      accept: ['fingernails', 'finger nail', 'finger nails', 'nail', 'nails'],
    },
    {
      category: 'Animals',
      clues: [
        'Its closest living relatives on land include the elephant.',
        'Sailors are said to have mistaken them for mermaids.',
        'It is the slow Florida sea cow that gets hit by boat propellers.',
      ],
      answer: 'Manatee',
      accept: ['manatees'],
    },
  ],
  [
    {
      category: 'Toys',
      clues: [
        'It was first sold as a wallpaper cleaner.',
        'Hasbro trademarked its smell.',
        'It is the soft modelling compound for kids that comes in small yellow tubs.',
      ],
      answer: 'Play-Doh',
      accept: ['playdoh', 'play doh', 'playdough', 'play dough'],
    },
    {
      category: 'The bathroom',
      clues: [
        'An early brand of it, sold in the 1880s, was called Mum.',
        'It is not the same as antiperspirant, which blocks sweat.',
        'You rub it in your armpits so you do not stink.',
      ],
      answer: 'Deodorant',
    },
    {
      category: 'Movies',
      clues: [
        'Its car, the Ecto-1, is a converted 1959 Cadillac ambulance.',
        'The final threat takes the form of the Stay Puft Marshmallow Man.',
        'The 1984 comedy with proton packs. Who you gonna call?',
      ],
      answer: 'Ghostbusters',
    },
    {
      category: 'Animals',
      clues: [
        'In some species the tiny male bites onto the female and fuses with her body.',
        'It lives in the deep sea and the female has a glowing lure on her head.',
        'The toothy fish with a light that chases Marlin and Dory in Finding Nemo.',
      ],
      answer: 'Anglerfish',
      accept: ['angler fish', 'angler'],
    },
    {
      category: 'Movies',
      clues: [
        "Its sequel was nearly deleted by a wrong command and was saved by a copy on an employee's home computer.",
        'It was the first feature film made entirely with computer animation.',
        'Woody and Buzz Lightyear compete to be the favourite of a boy named Andy.',
      ],
      answer: 'Toy Story',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'A yeast called Malassezia that lives on skin is linked to it.',
        'Zinc pyrithione and selenium sulfide are used to treat it.',
        'White flakes from your scalp that show up on a dark shirt.',
      ],
      answer: 'Dandruff',
    },
    {
      category: 'Movies',
      clues: [
        'John Williams wrote its score.',
        'The two burglars call themselves the Wet Bandits.',
        'A kid named Kevin is left behind at Christmas and fills the house with booby traps.',
      ],
      answer: 'Home Alone',
    },
    {
      category: 'Food',
      clues: [
        'The craft of its makers in Naples was added to the UNESCO heritage list in 2017.',
        'Chicago makes it deep dish and New York folds it.',
        'It is round, cut into slices and delivered in a flat cardboard box.',
      ],
      answer: 'Pizza',
    },
    {
      category: 'The bathroom',
      clues: [
        'The word is French for a small horse or pony.',
        'They are standard in homes in Italy but rare in North America.',
        'It sprays water to wash your butt after you use the toilet.',
      ],
      answer: 'Bidet',
    },
    {
      category: 'Food',
      clues: [
        'In 1957 the BBC aired an April Fools report showing it being harvested from trees.',
        'A satirical religion worships a flying monster made of it.',
        'Long thin pasta, often served with meatballs.',
      ],
      answer: 'Spaghetti',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'The nine-banded kind almost always gives birth to identical quadruplets.',
        'It is one of the few animals that can carry leprosy.',
        'Its name is Spanish for little armoured one, and some kinds roll into a ball.',
      ],
      answer: 'Armadillo',
      accept: ['armadillos'],
    },
    {
      category: 'Video games',
      clues: [
        'It was funded on Kickstarter and made almost entirely by one man, Toby Fox.',
        'You can finish it without killing anything.',
        'The indie RPG with the skeleton brothers Sans and Papyrus.',
      ],
      answer: 'Undertale',
    },
    {
      category: 'Words',
      clues: [
        'Daisuke Inoue is credited with building an early machine for it in 1971.',
        'The word is Japanese for empty orchestra.',
        'Singing along to lyrics on a screen at a bar.',
      ],
      answer: 'Karaoke',
    },
    {
      category: 'Games',
      clues: [
        'It was designed by Klaus Teuber and first published in Germany in 1995.',
        'Rolling a seven moves the robber.',
        'You trade wood, brick, wheat, ore and sheep to build settlements.',
      ],
      answer: 'Catan',
      accept: ['settlers of catan'],
    },
    {
      category: 'D&D',
      clues: [
        'The word comes from Greek for divination by the dead.',
        'Animate Dead is the core spell of the trade.',
        'It is a wizard who raises skeletons and zombies.',
      ],
      answer: 'Necromancer',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'Unlike most cats it cannot fully retract its claws.',
        'It chirps and purrs but cannot roar.',
        'The fastest animal on land.',
      ],
      answer: 'Cheetah',
    },
    {
      category: 'Music',
      clues: [
        'Pete Best was their drummer until 1962.',
        'Their last public performance was on a London rooftop in 1969.',
        'The four lads from Liverpool: John, Paul, George and Ringo.',
      ],
      answer: 'The Beatles',
    },
    {
      category: 'Video games',
      clues: [
        'An AI Director changes what spawns based on how the team is doing.',
        'Its special enemies include the Boomer, the Hunter and the Witch.',
        'It is the Valve co-op shooter where four survivors fight zombie hordes.',
      ],
      answer: 'Left 4 Dead',
      accept: ['left for dead', 'l4d', 'left 4 dead 2', 'l4d2'],
    },
    {
      category: 'TV',
      clues: [
        "The first version of him was made from an old coat that belonged to his maker's mother.",
        'He sings Rainbow Connection while sitting in a swamp.',
        'The green Muppet that Miss Piggy is in love with.',
      ],
      answer: 'Kermit the Frog',
      accept: ['kermit'],
    },
    {
      category: 'Drinks',
      clues: [
        'Its name is a diminutive of the Slavic word for water.',
        'It is the spirit in a Moscow mule and a White Russian.',
        'A clear liquor tied to Russia and Poland. Smirnoff and Grey Goose are brands.',
      ],
      answer: 'Vodka',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Babies under one year old should not eat it because of the risk of botulism.',
        'It is made from nectar and keeps for years without spoiling.',
        'The sweet golden syrup made by bees.',
      ],
      answer: 'Honey',
    },
    {
      category: 'Video games',
      clues: [
        'It was made by Studio MDHR, founded by two Canadian brothers.',
        'Its art was hand drawn in the style of 1930s cartoons.',
        'A brutal run of boss fights for a guy with a mug for a head who owes the Devil.',
      ],
      answer: 'Cuphead',
    },
    {
      category: 'Animals',
      clues: [
        "A Dutch explorer took them for giant rats and named their island Rats' Nest.",
        'It is a small relative of the wallaby from Western Australia.',
        'Tourists take selfies with it because it always looks like it is smiling.',
      ],
      answer: 'Quokka',
    },
    {
      category: 'History',
      clues: [
        'They called themselves the Mexica.',
        'Their capital stood on an island in a lake, and Hernan Cortes took it in 1521.',
        'The empire of Tenochtitlan and Montezuma, in what is now Mexico.',
      ],
      answer: 'Aztecs',
      accept: ['aztec', 'aztec empire', 'the aztec empire'],
    },
    {
      category: 'TV',
      clues: [
        'It was first developed as a possible spinoff of The Office.',
        'It is set in the town of Pawnee, Indiana.',
        'It is the sitcom with Leslie Knope and Ron Swanson.',
      ],
      answer: 'Parks and Recreation',
      accept: ['parks and rec', 'parks & rec', 'parks & recreation'],
    },
  ],
  [
    {
      category: 'Science',
      clues: [
        'Its discoverer won the first Nobel Prize in Physics.',
        "One of the first images made with it shows his wife's hand and her ring.",
        'What a doctor orders to see if your bone is broken.',
      ],
      answer: 'X-ray',
      accept: ['xray', 'x rays', 'x-rays', 'xrays'],
    },
    {
      category: 'Money',
      clues: [
        'Germany in 1923 and Zimbabwe in the 2000s had runaway cases of it.',
        'Central banks raise interest rates to fight it.',
        'When prices go up and your money buys less.',
      ],
      answer: 'Inflation',
      accept: ['hyperinflation'],
    },
    {
      category: 'Games',
      clues: [
        "A hand of aces and eights is called the dead man's hand.",
        "Texas Hold'em is its most popular form.",
        'It is the card game of bluffing where a royal flush beats everything.',
      ],
      answer: 'Poker',
    },
    {
      category: 'Tech',
      clues: [
        'The company behind it was Research In Motion of Waterloo, Ontario.',
        'Its messaging app was known as BBM.',
        'The phone with the tiny physical keyboard that business people thumbed before the iPhone.',
      ],
      answer: 'BlackBerry',
      accept: ['black berry'],
    },
    {
      category: 'Food',
      clues: [
        'In Australia a similar thing is called a Dagwood dog.',
        'It is a state fair staple, usually eaten with a squiggle of yellow mustard.',
        'A wiener on a stick, battered and deep fried.',
      ],
      answer: 'Corn dog',
      accept: ['corndog', 'corn dogs'],
    },
  ],
  [
    {
      category: 'Space',
      clues: [
        'Its position was worked out with math before anyone saw it.',
        'Its largest moon, Triton, orbits backwards.',
        'It is the eighth planet from the sun, named for the Roman god of the sea.',
      ],
      answer: 'Neptune',
    },
    {
      category: 'Animals',
      clues: [
        'Its scientific name is Gulo gulo, which means glutton.',
        'It is the largest land living member of the weasel family.',
        'The X-Men hero with metal claws is named after it.',
      ],
      answer: 'Wolverine',
    },
    {
      category: 'Drinks',
      clues: [
        'The traditional serve drips cold water over a sugar cube on a slotted spoon.',
        'It is flavoured with wormwood and anise, and the US banned it for most of the 20th century.',
        'This strong spirit is nicknamed the green fairy.',
      ],
      answer: 'Absinthe',
    },
    {
      category: 'Video games',
      clues: [
        'Its hero was first known as Jumpman.',
        'Shigeru Miyamoto designed it for arcades in 1981.',
        'A big ape throws barrels at Mario.',
      ],
      answer: 'Donkey Kong',
      accept: ['dk'],
    },
    {
      category: 'TV',
      clues: [
        "Its title comes from a General Motors exhibit at the 1939 World's Fair.",
        'It has been cancelled and brought back several times.',
        'Fry, Leela and Bender deliver packages in the 31st century.',
      ],
      answer: 'Futurama',
    },
  ],
  [
    {
      category: 'TV',
      clues: [
        'Its lead actor had played a funeral director on Six Feet Under.',
        'The main character follows a code taught by his adoptive father Harry.',
        'A Miami blood spatter analyst is also a serial killer.',
      ],
      answer: 'Dexter',
    },
    {
      category: 'Food',
      clues: [
        'The Montreal style is boiled in honey sweetened water and baked in a wood fired oven.',
        'The New York style is boiled and then baked, which makes it chewy.',
        'A round bread with a hole in it, often eaten with cream cheese.',
      ],
      answer: 'Bagel',
      accept: ['bagels'],
    },
    {
      category: 'Space',
      clues: [
        'Its day is called a sol and runs about 40 minutes longer than ours.',
        'Its two moons are Phobos and Deimos.',
        'It is the red planet.',
      ],
      answer: 'Mars',
    },
    {
      category: 'The body',
      clues: [
        'A baby has more pieces in it than an adult, because many fuse together.',
        'An adult one has 206 parts.',
        'All of your bones together. Also a common Halloween decoration.',
      ],
      answer: 'Skeleton',
    },
    {
      category: 'Music',
      clues: [
        'It belongs to a family of instruments called mirlitons.',
        'You hum into it instead of blowing, and a thin membrane does the buzzing.',
        'The cheap buzzing toy instrument from the party store.',
      ],
      answer: 'Kazoo',
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'It was made by brothers Rand and Robyn Miller at Cyan.',
        'It was the best selling PC game until The Sims passed it.',
        'It is the 1993 puzzle game set on a lonely island. Its name sounds like a light fog.',
      ],
      answer: 'Myst',
    },
    {
      category: 'Comics',
      clues: [
        'They began in a self published black and white comic that parodied Daredevil.',
        'Their enemy is the Shredder and their teacher is a rat.',
        'Four pizza loving reptiles named after Renaissance artists.',
      ],
      answer: 'Teenage Mutant Ninja Turtles',
      accept: ['tmnt', 'ninja turtles'],
    },
    {
      category: 'Video games',
      clues: [
        'Its first game was developed by Harmonix, who went on to make Rock Band.',
        'Through the Fire and Flames by DragonForce is its most feared song.',
        'You play along on a plastic instrument with five coloured buttons.',
      ],
      answer: 'Guitar Hero',
    },
    {
      category: 'Tech',
      clues: [
        "The first product scanned with one at a checkout was a pack of Wrigley's gum in 1974.",
        'The common retail type is called a UPC.',
        'The block of black and white stripes that the cashier scans.',
      ],
      answer: 'Barcode',
      accept: ['bar code', 'barcodes'],
    },
    {
      category: 'Science',
      clues: [
        'It sits at about minus 78 degrees Celsius.',
        'It sublimates, going straight from solid to gas.',
        'Frozen carbon dioxide, used for fog effects and shipping frozen food.',
      ],
      answer: 'Dry ice',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'It sits in the middle of the areola.',
        'Men have them because they form in the embryo before the sexes diverge.',
        "Janet Jackson's was exposed during the 2004 Super Bowl halftime show.",
      ],
      answer: 'Nipple',
      accept: ['nipples'],
    },
    {
      category: 'Video games',
      clues: [
        'In 2005 a bug let a blood plague spread through its cities, and epidemiologists later studied it.',
        'A player named Leeroy Jenkins ruined a raid in it.',
        "Blizzard's huge online game of Horde against Alliance.",
      ],
      answer: 'World of Warcraft',
      accept: ['wow', 'warcraft'],
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in More Fun Comics in 1941.',
        'His wife is Mera and his half brother is Ocean Master.',
        'Jason Momoa plays this king of Atlantis who talks to fish.',
      ],
      answer: 'Aquaman',
    },
    {
      category: 'Food',
      clues: [
        'They were invented by Charles Elmer Doolin, the man behind Fritos.',
        'The dust they leave on your fingers has an official name, Cheetle.',
        'Orange cheese puffs with a cool cat mascot named Chester.',
      ],
      answer: 'Cheetos',
      accept: ['cheeto', 'flamin hot cheetos', 'hot cheetos'],
    },
    {
      category: 'Video games',
      clues: [
        'Konami made it for arcades in 1981.',
        'In a Seinfeld episode George tries to save a machine that holds his high score.',
        'You hop across a busy road and then a river full of logs.',
      ],
      answer: 'Frogger',
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        "It won the Palme d'Or at Cannes in 1994.",
        'The contents of its glowing briefcase are never shown.',
        'Travolta and Samuel L. Jackson discuss the Royale with Cheese in this Tarantino film.',
      ],
      answer: 'Pulp Fiction',
    },
    {
      category: 'Tech',
      clues: [
        'Its trident logo ends in a circle, a triangle and a square.',
        'Type C of its plug finally works either way up.',
        'The port you push a flash drive into, usually on the third try.',
      ],
      answer: 'USB',
      accept: ['universal serial bus', 'usb port'],
    },
    {
      category: 'Food',
      clues: [
        'Making big batches of it together in late autumn is a tradition called gimjang.',
        'Many Korean homes have a separate fridge just for it.',
        'Spicy fermented cabbage from Korea.',
      ],
      answer: 'Kimchi',
      accept: ['kimchee'],
    },
    {
      category: 'Animals',
      clues: [
        'Its front teeth are orange because the enamel contains iron.',
        'It is the national animal of Canada.',
        'It chews down trees to build dams and lodges.',
      ],
      answer: 'Beaver',
      accept: ['beavers'],
    },
    {
      category: 'People',
      clues: [
        'He spent about eight years studying barnacles.',
        'He sailed around the world on HMS Beagle.',
        'He wrote On the Origin of Species.',
      ],
      answer: 'Charles Darwin',
      accept: ['darwin'],
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'It is sometimes called Chinese parsley.',
        'To some people it tastes like soap, and genes play a part.',
        'The leafy green herb in salsa and guacamole.',
      ],
      answer: 'Cilantro',
      accept: ['coriander'],
    },
    {
      category: 'Toys',
      clues: [
        'Its first product was a foam ball sold as safe to throw indoors.',
        'Gamers use its name to mean making something weaker in a patch.',
        'It is the Hasbro brand of foam dart blasters.',
      ],
      answer: 'Nerf',
    },
    {
      category: 'Animals',
      clues: [
        'Its order is called Chiroptera, which means hand wing.',
        'It is the only mammal capable of true powered flight.',
        'It sleeps hanging upside down in caves and finds bugs by echolocation.',
      ],
      answer: 'Bat',
      accept: ['bats'],
    },
    {
      category: 'People',
      clues: [
        'Both of his parents were satellite engineers.',
        'He is half of the band Tenacious D.',
        'The star of School of Rock, and the voice of Bowser and Kung Fu Panda.',
      ],
      answer: 'Jack Black',
    },
    {
      category: 'Food',
      clues: [
        'The word refers to the vinegared rice, not the fish.',
        'Some restaurants send it past your seat on a conveyor belt.',
        'Raw fish and rice from Japan, often rolled in seaweed.',
      ],
      answer: 'Sushi',
    },
  ],
  [
    {
      category: 'Geography',
      clues: [
        'Its state flag has the British Union Jack in the corner.',
        'It was a kingdom until its queen was overthrown in 1893.',
        'The US island state with Honolulu and Pearl Harbor.',
      ],
      answer: 'Hawaii',
    },
    {
      category: 'Video games',
      clues: [
        'Its first studio, Infinity Ward, was formed by developers of a Medal of Honor game.',
        'Its Zombies mode began in World at War.',
        'The yearly military shooter with Modern Warfare and Black Ops.',
      ],
      answer: 'Call of Duty',
      accept: ['cod'],
    },
    {
      category: 'TV',
      clues: [
        'One episode, Hush, goes most of its runtime with no spoken dialogue.',
        'Her Watcher is a British librarian named Giles.',
        'Sarah Michelle Gellar stakes the undead in Sunnydale.',
      ],
      answer: 'Buffy the Vampire Slayer',
      accept: ['buffy'],
    },
    {
      category: 'Video games',
      clues: [
        "His first game came out in 1991 and he replaced Alex Kidd as his company's mascot.",
        'His enemy is called Dr. Eggman, or Dr. Robotnik in older Western releases.',
        'The fast blue Sega mascot who collects gold rings.',
      ],
      answer: 'Sonic the Hedgehog',
      accept: ['sonic'],
    },
    {
      category: 'People',
      clues: [
        'He died in 1943 in a room at the Hotel New Yorker.',
        "He backed alternating current against Edison's direct current.",
        "He is the Serbian American inventor whose last name is on Elon Musk's car company.",
      ],
      answer: 'Nikola Tesla',
      accept: ['tesla'],
    },
  ],
  [
    {
      category: 'The bathroom',
      clues: [
        'Before nylon it was made of silk.',
        'It comes waxed or unwaxed, and you lie about how often you use it.',
        'The string you run between your teeth.',
      ],
      answer: 'Dental floss',
      accept: ['floss'],
    },
    {
      category: 'Toys',
      clues: [
        'A royal blue elephant named Peanut is one of the prized ones.',
        'Each came with a red heart shaped Ty tag with a name and a poem.',
        'The small plush animals that people hoarded in the 90s as investments.',
      ],
      answer: 'Beanie Babies',
      accept: ['beanie baby', 'ty beanie babies'],
    },
    {
      category: 'Drinks',
      clues: [
        'In the 1700s London had a craze for it that Parliament passed several Acts to stop.',
        'Its main flavour has to come from juniper berries.',
        'The clear spirit you mix with tonic.',
      ],
      answer: 'Gin',
    },
    {
      category: 'Movies',
      clues: [
        'Its director says the idea came from a fever dream of a metal torso dragging itself out of a fire.',
        'A waitress named Sarah Connor is hunted by a machine sent back from 2029.',
        "Arnold Schwarzenegger says I'll be back.",
      ],
      answer: 'The Terminator',
      accept: ['terminator'],
    },
    {
      category: 'Movies',
      clues: [
        "It grew out of Mike Judge's animated shorts about a man named Milton.",
        'Three men beat a printer to death in a field.',
        'It is the 1999 comedy about TPS reports and a red stapler.',
      ],
      answer: 'Office Space',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'It has 50 teeth.',
        'It is the only marsupial living wild in the United States and Canada.',
        'It plays dead when it is threatened.',
      ],
      answer: 'Opossum',
      accept: ['possum'],
    },
    {
      category: 'Animals',
      clues: [
        'It can close its nostrils to keep out sand.',
        'Its hump stores fat, not water.',
        'The desert animal that comes with one hump or two.',
      ],
      answer: 'Camel',
    },
    {
      category: 'Video games',
      clues: [
        "You go back to the Hunter's Dream to level up with a living doll.",
        'FromSoftware released it in 2015 only on PlayStation 4.',
        'The gothic Souls style game set in Yharnam. Fans keep begging for a PC port.',
      ],
      answer: 'Bloodborne',
    },
    {
      category: 'People',
      clues: [
        'He was offered the presidency of Israel in 1952 and said no.',
        'His Nobel Prize was for the photoelectric effect, not relativity.',
        'The wild haired physicist behind E equals mc squared.',
      ],
      answer: 'Einstein',
      accept: ['albert einstein'],
    },
    {
      category: 'The internet',
      clues: [
        'It grew out of Justin.tv, a site where one man broadcast his life around the clock.',
        'Amazon bought it in 2014.',
        'The purple site where people stream themselves playing video games.',
      ],
      answer: 'Twitch',
      accept: ['twitch tv'],
    },
  ],
  [
    {
      category: 'Toys',
      clues: [
        'Her full name is Barbara Millicent Roberts.',
        'Ruth Handler created her and Mattel launched her in 1959.',
        'Her boyfriend is Ken.',
      ],
      answer: 'Barbie',
      accept: ['barbie doll'],
    },
    {
      category: 'Movies',
      clues: [
        'Its director gave up a bigger fee to keep the sequel and merchandising rights.',
        'Its opening text crawls up the screen and away into the distance.',
        'A farm boy, a princess and a smuggler blow up the Death Star.',
      ],
      answer: 'Star Wars',
      accept: ['a new hope', 'star wars a new hope', 'star wars episode iv'],
    },
    {
      category: 'Holidays',
      clues: [
        'Families build altars called ofrendas.',
        'It is marked with marigolds and sugar skulls.',
        'The Mexican holiday at the start of November, shown in the film Coco.',
      ],
      answer: 'Day of the Dead',
      accept: ['dia de los muertos', 'dia de muertos'],
    },
    {
      category: 'Movies',
      clues: [
        'Jeremy Irons voices its villain.',
        'Elton John and Tim Rice wrote its songs.',
        'It is the Disney film with Simba, Timon and Pumbaa.',
      ],
      answer: 'The Lion King',
    },
    {
      category: 'TV',
      clues: [
        'Fox cancelled it, then brought it back after strong DVD sales.',
        'It is set in Quahog, Rhode Island.',
        'Peter Griffin, Stewie, and Brian the talking dog.',
      ],
      answer: 'Family Guy',
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'It has no stomach, so it has to eat almost constantly.',
        'The male carries the eggs in a pouch and gives birth.',
        'A small fish that swims upright and has a head like a pony.',
      ],
      answer: 'Seahorse',
      accept: ['sea horse'],
    },
    {
      category: 'Food',
      clues: [
        "San Francisco's Mission District is known for a huge foil wrapped style of it.",
        'The word is Spanish for little donkey.',
        'A flour tortilla rolled around rice, beans and meat. Chipotle sells them.',
      ],
      answer: 'Burrito',
      accept: ['burritos'],
    },
    {
      category: 'Sports',
      clues: [
        'Its top trophy was donated by Lord Stanley of Preston in 1892.',
        'A Zamboni cleans the playing surface between periods.',
        'Skates, sticks and a puck.',
      ],
      answer: 'Hockey',
      accept: ['ice hockey'],
    },
    {
      category: 'Money',
      clues: [
        'Bank of America launched an early one in Fresno, California in 1958.',
        'It comes with a limit, an APR and a three digit code on the back.',
        'Plastic from Visa or Mastercard that lets you buy now and pay later.',
      ],
      answer: 'Credit card',
      accept: ['credit cards'],
    },
    {
      category: 'Geography',
      clues: [
        'Its capital is Antananarivo.',
        'It is the only place where lemurs live in the wild.',
        'It is the big island off the east coast of Africa, and a DreamWorks film about zoo animals.',
      ],
      answer: 'Madagascar',
    },
  ],
  [
    {
      category: 'Drinks',
      clues: [
        'Its name is Spanish for daisy.',
        'It is made with triple sec and lime juice.',
        'It is the tequila cocktail served in a glass with a salted rim.',
      ],
      answer: 'Margarita',
    },
    {
      category: 'Games',
      clues: [
        'Its inventor was an out of work architect who counted letters on newspaper front pages.',
        'The Q and the Z are worth ten points each.',
        'The board game where you spell words with lettered tiles.',
      ],
      answer: 'Scrabble',
    },
    {
      category: 'Cars',
      clues: [
        'Its front grille has seven slots.',
        'It began as a US military vehicle in World War II.',
        'The brand that makes the Wrangler and the Cherokee.',
      ],
      answer: 'Jeep',
    },
    {
      category: 'Space',
      clues: [
        'Its name comes from a Greek word meaning long haired.',
        'Its tail points away from the Sun.',
        'A ball of ice and dust, like the one named after Halley.',
      ],
      answer: 'Comet',
      accept: ['comets'],
    },
    {
      category: 'Video games',
      clues: [
        'It switched to its comic book art style late in development.',
        'Gearbox makes it, and it takes place on the planet Pandora.',
        'The cartoony looter shooter with Vault Hunters, Claptrap and a huge number of guns.',
      ],
      answer: 'Borderlands',
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'Samuel L. Jackson plays a chain smoking engineer who says, Hold on to your butts.',
        'Ripples in a cup of water warn that something big is coming.',
        'The 1993 Spielberg film about an island of cloned dinosaurs.',
      ],
      answer: 'Jurassic Park',
    },
    {
      category: 'Video games',
      clues: [
        'The first game in the series came out in Japan on the Nintendo 64 in 2001.',
        'You take out a home loan from a raccoon named Tom Nook.',
        'The New Horizons entry had everyone living on a deserted island during the 2020 lockdowns.',
      ],
      answer: 'Animal Crossing',
      accept: ['animal crossing new horizons', 'acnh'],
    },
    {
      category: 'Music',
      clues: [
        'They went by Xero and then Hybrid Theory before settling on a name.',
        'They made the Collision Course EP with Jay-Z.',
        'It is the band behind In the End and Numb.',
      ],
      answer: 'Linkin Park',
    },
    {
      category: 'History',
      clues: [
        "The Iliad ends before it appears. The fullest telling is in Virgil's Aeneid.",
        'A kind of malware that pretends to be a useful program is named after it.',
        'Greek soldiers hid inside this wooden gift to get into an enemy city.',
      ],
      answer: 'Trojan Horse',
      accept: ['the trojan horse', 'wooden horse'],
    },
    {
      category: 'Music',
      clues: [
        'Their debut album was Homework.',
        'They scored the film Tron Legacy and split up in 2021.',
        'The French duo in robot helmets who made Get Lucky and One More Time.',
      ],
      answer: 'Daft Punk',
    },
  ],
  [
    {
      category: 'The bathroom',
      clues: [
        'Marcel Duchamp signed one "R. Mutt" and submitted it as art in 1917.',
        'Etiquette says you leave an empty one between you and the next guy.',
        "The wall mounted fixture in a men's room that you pee in standing up.",
      ],
      answer: 'Urinal',
      accept: ['urinals'],
    },
    {
      category: 'D&D',
      clues: [
        'In old editions a lower number was better, and you worked it out with THAC0.',
        'With no gear it is 10 plus your Dexterity modifier.',
        'The number an attack roll has to meet or beat to hit you.',
      ],
      answer: 'Armor Class',
      accept: ['ac', 'armour class'],
    },
    {
      category: 'Food',
      clues: [
        'It is an emulsion held together by the lecithin in egg yolk.',
        "Hellmann's and Duke's are well known brands of it.",
        'It is the white sandwich spread made of oil and egg.',
      ],
      answer: 'Mayonnaise',
      accept: ['mayo'],
    },
    {
      category: 'Sports',
      clues: [
        'Many of its stones are cut from granite from the Scottish island of Ailsa Craig.',
        'The playing surface is called a sheet and the target is called the house.',
        'The Winter Olympic sport with brooms and sweeping.',
      ],
      answer: 'Curling',
    },
    {
      category: 'The body',
      clues: [
        'Each one holds about a million tiny filters called nephrons.',
        'You can live with just one, so living people donate them.',
        'The bean shaped organs that make urine.',
      ],
      answer: 'Kidney',
      accept: ['kidneys'],
    },
  ],
  [
    {
      category: 'Space',
      clues: [
        'It is the densest planet in the solar system.',
        'It is the one planet in the solar system not named after a Greek or Roman god.',
        'The third planet from the Sun. You are on it.',
      ],
      answer: 'Earth',
    },
    {
      category: 'D&D',
      clues: [
        'Vecna and Acererak are two well known examples of one.',
        'It hides its soul in an object called a phylactery.',
        'It is a skeletal undead wizard. The name rhymes with witch.',
      ],
      answer: 'Lich',
    },
    {
      category: 'People',
      clues: [
        'He started as a teenage assistant at Timely Comics in 1939.',
        'He signed off his columns with the word Excelsior.',
        'He co-created many Marvel heroes and had a cameo in most of the Marvel movies.',
      ],
      answer: 'Stan Lee',
    },
    {
      category: 'TV',
      clues: [
        'His agent and ex is a pink cat named Princess Carolyn.',
        'Will Arnett voices the lead, a washed up sitcom star.',
        'The Netflix cartoon about a depressed alcoholic talking horse.',
      ],
      answer: 'BoJack Horseman',
      accept: ['bojack'],
    },
    {
      category: 'Movies',
      clues: [
        'It was the first film from the Farrelly brothers.',
        'Two friends drive to Aspen to return a briefcase.',
        'Jim Carrey and Jeff Daniels play Lloyd and Harry.',
      ],
      answer: 'Dumb and Dumber',
      accept: ['dumb & dumber'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'The Volstead Act was the law that enforced it.',
        'It made bootleggers like Al Capone rich and filled the speakeasies.',
        'It was the American ban on alcohol from 1920 to 1933.',
      ],
      answer: 'Prohibition',
    },
    {
      category: 'Drinks',
      clues: [
        'The Canadian cousin of this cocktail, the Caesar, adds clam juice.',
        'It usually has Worcestershire sauce, hot sauce and a celery stalk.',
        'This vodka and tomato juice cocktail shares a name with a ghost you summon in a mirror.',
      ],
      answer: 'Bloody Mary',
    },
    {
      category: 'Video games',
      clues: [
        'Its creator drew on childhood memories of exploring caves and woods near Kyoto.',
        'The title character was named after the wife of novelist F. Scott Fitzgerald.',
        'You play a pointy-eared hero in a green tunic called Link.',
      ],
      answer: 'Zelda',
      accept: ['the legend of zelda', 'legend of zelda'],
    },
    {
      category: 'Video games',
      clues: [
        'Konami put it in Japanese arcades in 1998.',
        'In Europe it was sold under the name Dancing Stage.',
        'You stomp on four arrows on a pad in time with the music.',
      ],
      answer: 'Dance Dance Revolution',
      accept: ['ddr'],
    },
    {
      category: 'Geography',
      clues: [
        'Its ancient people called their land Kemet.',
        'The Suez Canal runs through it.',
        'The country with Cairo, the Sphinx and the pyramids of Giza.',
      ],
      answer: 'Egypt',
    },
  ],
  [
    {
      category: 'Drinks',
      clues: [
        'Stock car racing grew partly out of drivers who ran it.',
        'Cartoons show it in a jug marked XXX.',
        'It is illegal homemade liquor from a backwoods still.',
      ],
      answer: 'Moonshine',
    },
    {
      category: 'The bathroom',
      clues: [
        'Early versions of it were made of silk.',
        'It shares its name with a dance that spread through Fortnite.',
        'The string your dentist knows you are not using.',
      ],
      answer: 'Floss',
      accept: ['dental floss', 'flossing'],
    },
    {
      category: 'Holidays',
      clues: [
        'The writer of Mary Had a Little Lamb lobbied for years to make it a US national holiday.',
        'Canadians have theirs on the second Monday of October.',
        'Turkey, stuffing and football, followed by Black Friday.',
      ],
      answer: 'Thanksgiving',
    },
    {
      category: 'Food',
      clues: [
        'In Spain it is dipped in thick hot chocolate.',
        'The dough is piped through a star shaped tip into hot oil.',
        'A ridged stick of fried dough rolled in cinnamon sugar.',
      ],
      answer: 'Churro',
      accept: ['churros'],
    },
    {
      category: 'The internet',
      clues: [
        'In 2006 it dropped its mascot and shortened its name.',
        'The mascot was named after a valet in the P. G. Wodehouse stories.',
        'The 90s search engine where you typed a question to a butler.',
      ],
      answer: 'Ask Jeeves',
      accept: ['askjeeves', 'ask.com', 'ask', 'jeeves', 'ask com'],
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'Everyone has the cushions of tissue they come from. You only notice when they swell.',
        'Preparation H is sold to treat them.',
        'Swollen, itchy veins in your butt.',
      ],
      answer: 'Hemorrhoids',
      accept: ['hemorrhoid', 'haemorrhoids', 'piles', 'hemroids'],
    },
    {
      category: 'TV',
      clues: [
        'Its writers worked under the rule "no hugging, no learning".',
        'A recurring character sells soup and refuses service to anyone who annoys him.',
        'A show about nothing, with Jerry, George, Elaine and Kramer.',
      ],
      answer: 'Seinfeld',
    },
    {
      category: 'Animals',
      clues: [
        'It was a large flightless relative of pigeons.',
        'It lived only on the island of Mauritius.',
        'The extinct bird that people are said to be as dead as.',
      ],
      answer: 'Dodo',
      accept: ['dodo bird'],
    },
    {
      category: 'People',
      clues: [
        'He was an ordained Presbyterian minister.',
        'He spoke to a US Senate committee in 1969 to defend funding for public television.',
        'He put on a cardigan and sneakers and asked you to be his neighbor.',
      ],
      answer: 'Mr. Rogers',
      accept: ['mister rogers', 'fred rogers', 'mr rogers'],
    },
    {
      category: 'Movies',
      clues: [
        'It is based on a Philip K. Dick novel with electric sheep in the title.',
        'Rutger Hauer gives a dying speech about tears in rain.',
        'Harrison Ford hunts replicants in a rainy future Los Angeles.',
      ],
      answer: 'Blade Runner',
      accept: ['bladerunner'],
    },
  ],
  [
    {
      category: 'Books',
      clues: [
        'Its subtitle is The Modern Prometheus.',
        'Mary Shelley started it during a ghost story contest near Lake Geneva.',
        'It is the name of the doctor, not the monster he stitches together.',
      ],
      answer: 'Frankenstein',
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in Action Comics issue 1 in 1938.',
        'In his early stories he could leap tall buildings but could not fly.',
        'Clark Kent, who is weak to kryptonite.',
      ],
      answer: 'Superman',
    },
    {
      category: 'Video games',
      clues: [
        'A rumor about a secret cow level started with the first game.',
        'You go down beneath the town of Tristram.',
        "Blizzard's loot heavy action RPG named after the Lord of Terror.",
      ],
      answer: 'Diablo',
      accept: ['diablo 2', 'diablo ii', 'diablo 3', 'diablo 4'],
    },
    {
      category: 'Drinks',
      clues: [
        "It was first sold as Brad's Drink in North Carolina.",
        'It ran a blind taste test campaign called the Challenge.',
        'It is the big cola that is not Coke.',
      ],
      answer: 'Pepsi',
      accept: ['pepsi cola'],
    },
    {
      category: 'Geography',
      clues: [
        'It counts as the largest desert on Earth.',
        'A 1959 treaty sets it aside for science and bans military activity.',
        'The continent at the South Pole, with penguins and no permanent residents.',
      ],
      answer: 'Antarctica',
      accept: ['antarctic'],
    },
  ],
  [
    {
      category: 'Video games',
      clues: [
        'It was made by Naughty Dog, years before Uncharted and The Last of Us.',
        'The villain is Doctor Neo Cortex and a floating mask named Aku Aku protects you.',
        'You are an orange marsupial in jeans who spins into crates on the PlayStation.',
      ],
      answer: 'Crash Bandicoot',
      accept: ['crash'],
    },
    {
      category: 'D&D',
      clues: [
        'Attacking a creature that cannot see you gives you this.',
        'Fifth edition brought it in to replace piles of small bonuses.',
        'You roll two d20s and take the higher one.',
      ],
      answer: 'Advantage',
      accept: ['adv'],
    },
    {
      category: 'Food',
      clues: [
        'Momofuku Ando invented the instant kind in 1958.',
        'Tonkotsu is a style of it with pork bone broth.',
        'Japanese noodle soup. The cheap dried brick of it feeds college students.',
      ],
      answer: 'Ramen',
      accept: ['ramen noodles', 'instant ramen'],
    },
    {
      category: 'Music',
      clues: [
        'Their first album, Bleach, came out on the Sub Pop label.',
        'Their drummer went on to front Foo Fighters.',
        "It was Kurt Cobain's band, behind Smells Like Teen Spirit.",
      ],
      answer: 'Nirvana',
    },
    {
      category: 'Video games',
      clues: [
        'Supergiant Games made it after Bastion, Transistor and Pyre.',
        "You play Zagreus, who keeps trying to escape his father's realm.",
        'The 2020 roguelike named after the Greek god of the underworld.',
      ],
      answer: 'Hades',
    },
  ],
  [
    {
      category: 'Games',
      clues: [
        'A barber in Ohio invented it in 1971 after an argument about Crazy Eights.',
        'Its worst card makes the next player draw four.',
        'You must shout its name when you have one card left.',
      ],
      answer: 'Uno',
    },
    {
      category: 'D&D',
      clues: [
        "A paladin's aura adds this score's modifier to saving throws.",
        'Bards, sorcerers and warlocks cast spells with it.',
        'The ability score behind Persuasion, Deception and Intimidation.',
      ],
      answer: 'Charisma',
      accept: ['cha'],
    },
    {
      category: 'The body',
      clues: [
        'Its medical name is veisalgia.',
        'Dehydration and bad sleep are part of why it feels so awful.',
        'The headache and nausea the morning after drinking too much.',
      ],
      answer: 'Hangover',
      accept: ['hungover', 'hang over'],
    },
    {
      category: 'Money',
      clues: [
        'The 1920 original claimed to profit from international postal reply coupons.',
        'Bernie Madoff ran the largest one.',
        'It pays early investors with money from new ones. It is named for a con man called Charles.',
      ],
      answer: 'Ponzi scheme',
      accept: ['ponzi'],
    },
    {
      category: 'Animals',
      clues: [
        'The scream dubbed over it in movies usually belongs to a red-tailed hawk.',
        'It was taken off the US endangered species list in 2007.',
        'The white headed national bird of the United States.',
      ],
      answer: 'Bald eagle',
      accept: ['american bald eagle', 'bald eagles'],
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'A newborn is about the size of a jellybean.',
        'Males are called boomers and a group is called a mob.',
        'The Australian hopping animal with a pouch.',
      ],
      answer: 'Kangaroo',
      accept: ['kangaroos', 'roo'],
    },
    {
      category: 'TV',
      clues: [
        'Its creator went on to co-create Rick and Morty.',
        'Its fans chanted six seasons and a movie.',
        'A sitcom about a study group at Greendale, with Donald Glover and Chevy Chase.',
      ],
      answer: 'Community',
    },
    {
      category: 'The internet',
      clues: [
        'Its first video shows one of its founders in front of the elephants at the San Diego Zoo.',
        'Google bought it in 2006.',
        'The video site where people ask you to like, comment and subscribe.',
      ],
      answer: 'YouTube',
    },
    {
      category: 'Animals',
      clues: [
        'In colonial New England it was so plentiful that it was used as fertilizer and fish bait.',
        'It keeps growing through life by shedding its shell.',
        'It is the clawed crustacean served with melted butter and a bib.',
      ],
      answer: 'Lobster',
    },
    {
      category: 'Space',
      clues: [
        'The one at the centre of our galaxy is called Sagittarius A*.',
        'The first image of one was released in 2019. Its edge is called the event horizon.',
        'Its gravity is so strong that not even light can escape.',
      ],
      answer: 'Black hole',
      accept: ['black holes'],
    },
  ],
  [
    {
      category: 'Music',
      clues: [
        "Its title came from graffiti a friend wrote on the singer's wall about a deodorant brand.",
        'Its video is a high school pep rally with cheerleaders in anarchy symbols.',
        "Nirvana's biggest hit. Here we are now, entertain us.",
      ],
      answer: 'Smells Like Teen Spirit',
      accept: ['teen spirit'],
    },
    {
      category: 'Sports',
      clues: [
        'It is named after a country house in Gloucestershire.',
        'The traditional projectile is sixteen goose feathers stuck in a cork base.',
        'The racquet sport played with a shuttlecock.',
      ],
      answer: 'Badminton',
    },
    {
      category: 'The body',
      clues: [
        'Its medical name is cerumen.',
        'Your genes decide whether yours is the wet kind or the dry kind.',
        'The yellowish gunk people dig out with cotton swabs.',
      ],
      answer: 'Earwax',
      accept: ['ear wax'],
    },
    {
      category: 'The internet',
      clues: [
        'Shawn Fanning started it in 1999 while he was a student in Boston.',
        'Metallica sued it in 2000.',
        'It was the file sharing service that let everyone grab free MP3s around 2000.',
      ],
      answer: 'Napster',
    },
    {
      category: 'Books',
      clues: [
        'It is told through letters, diaries and newspaper clippings.',
        'It opens with Jonathan Harker travelling to Transylvania.',
        "Bram Stoker's vampire novel.",
      ],
      answer: 'Dracula',
      accept: ['count dracula'],
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Its dark brown crust comes from a dip in lye or baking soda before baking.',
        'The soft kind is a ballpark and street cart staple, often eaten with mustard.',
        'It is salted dough twisted into a knot.',
      ],
      answer: 'Pretzel',
      accept: ['pretzels'],
    },
    {
      category: 'D&D',
      clues: [
        'Their Channel Divinity can be used to Turn Undead.',
        'They choose a divine domain such as Life, War or Trickery.',
        'The holy class that everyone expects to be the healer.',
      ],
      answer: 'Cleric',
    },
    {
      category: 'Cars',
      clues: [
        'The 1966 TV version was built from a Lincoln Futura concept car.',
        'The Christopher Nolan films used a tank like version called the Tumbler.',
        'The car driven by the Caped Crusader of Gotham.',
      ],
      answer: 'Batmobile',
      accept: ['the bat mobile', 'bat mobile'],
    },
    {
      category: 'Drinks',
      clues: [
        'Its recipe uses 56 herbs and spices.',
        'Its label shows a stag with a glowing cross between its antlers.',
        'The dark German liqueur dropped into Red Bull as a bomb.',
      ],
      answer: 'Jagermeister',
      accept: ['jager', 'jägermeister', 'jäger', 'jaeger', 'jaegermeister'],
    },
    {
      category: 'Toys',
      clues: [
        'A naval engineer got the idea when he knocked a tension spring off a shelf.',
        'In Toy Story it forms the middle of a dachshund.',
        'A metal coil that walks down stairs.',
      ],
      answer: 'Slinky',
    },
  ],
  [
    {
      category: 'Movies',
      clues: [
        'It is based on a novel by Chuck Palahniuk.',
        'David Fincher directed it, and Meat Loaf plays a man named Bob.',
        'The first rule is you do not talk about it.',
      ],
      answer: 'Fight Club',
    },
    {
      category: 'Money',
      clues: [
        'An early one opened at a Barclays branch in north London in 1967.',
        'People add the word machine after its name, which is redundant.',
        'You put in your card and PIN and it gives you cash.',
      ],
      answer: 'ATM',
      accept: ['atm machine', 'automated teller machine', 'bank machine', 'cash machine', 'abm'],
    },
    {
      category: 'Video games',
      clues: [
        'It was built from the remains of a cancelled Blizzard MMO called Titan.',
        'Its cover character is a time jumping British pilot called Tracer.',
        'It is the Blizzard hero shooter with Mercy, Reinhardt and a gorilla named Winston.',
      ],
      answer: 'Overwatch',
      accept: ['overwatch 2'],
    },
    {
      category: 'Toys',
      clues: [
        'Their creator first sold them as handmade cloth dolls called Little People.',
        'Each came with a birth certificate and adoption papers.',
        'Chubby faced dolls from the 1980s said to grow in a vegetable garden.',
      ],
      answer: 'Cabbage Patch Kids',
      accept: ['cabbage patch kid', 'cabbage patch dolls', 'cabbage patch doll', 'cabbage patch'],
    },
    {
      category: 'Toys',
      clues: [
        'Its inventor, a Hungarian architecture professor, needed about a month to solve it himself.',
        'Any scramble of it can be solved in 20 moves or fewer.',
        'A 3 by 3 twisting puzzle with six coloured sides.',
      ],
      answer: "Rubik's Cube",
      accept: ['rubiks cube', 'rubix cube', 'rubik cube'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        "It was built on the site of an artificial lake from Nero's palace.",
        'It is also known as the Flavian Amphitheatre.',
        'The arena in Rome where gladiators fought.',
      ],
      answer: 'Colosseum',
      accept: ['coliseum', 'roman colosseum'],
    },
    {
      category: 'Food',
      clues: [
        'Gilroy, California calls itself the world capital of it and holds a festival for it.',
        'It belongs to the same group of plants as onions and leeks.',
        'Its bulb splits into cloves, and vampires hate it.',
      ],
      answer: 'Garlic',
    },
    {
      category: 'Video games',
      clues: [
        'It was made by Niantic, which had earlier made Ingress.',
        'Players pick Team Mystic, Team Valor or Team Instinct.',
        'It is the 2016 phone game that sent people outside to catch monsters.',
      ],
      answer: 'Pokemon Go',
      accept: ['pokémon go', 'pogo'],
    },
    {
      category: 'The body',
      clues: [
        'The medical name for it is the axilla.',
        'It is packed with apocrine sweat glands that switch on at puberty.',
        'You put deodorant there.',
      ],
      answer: 'Armpit',
      accept: ['armpits', 'underarm', 'underarms'],
    },
    {
      category: 'Animals',
      clues: [
        'The spotted kind does a handstand as a warning.',
        'Its spray gets its stink from sulfur compounds called thiols.',
        'A black and white animal that smells terrible when scared.',
      ],
      answer: 'Skunk',
    },
  ],
  [
    {
      category: 'The body',
      clues: [
        'The muscle in its wall is called the detrusor.',
        'Two tubes called ureters fill it from the kidneys.',
        'It holds your pee.',
      ],
      answer: 'Bladder',
      accept: ['urinary bladder'],
    },
    {
      category: 'Tech',
      clues: [
        'It was designed by a team led by Gunpei Yokoi.',
        'In North America it came bundled with Tetris.',
        'The grey Nintendo handheld from 1989 with a green tinted screen.',
      ],
      answer: 'Game Boy',
      accept: ['gameboy', 'nintendo game boy', 'nintendo gameboy'],
    },
    {
      category: 'Books',
      clues: [
        'Its author says the idea came from a dream about a couple talking in a meadow.',
        'It is set in the rainy town of Forks, Washington.',
        'Bella has to choose between a sparkly vampire and a werewolf.',
      ],
      answer: 'Twilight',
    },
    {
      category: 'The bathroom',
      clues: [
        'The flange type has an extra flap that folds out from the cup.',
        'The plain cup type is meant for sinks.',
        'It is a rubber cup on a stick used to unclog a toilet.',
      ],
      answer: 'Plunger',
    },
    {
      category: 'Cars',
      clues: [
        'The first ones, in 1953, were all white with red interiors.',
        'It is named after a type of small warship.',
        "Chevrolet's two seat sports car, sometimes badged Stingray.",
      ],
      answer: 'Corvette',
      accept: ['chevrolet corvette', 'chevy corvette', 'vette'],
    },
  ],
  [
    {
      category: 'Animals',
      clues: [
        'In Europe this animal is called an elk.',
        'The flap of skin that hangs under its chin is called a bell.',
        'It is the largest member of the deer family, with wide flat antlers.',
      ],
      answer: 'Moose',
    },
    {
      category: 'Movies',
      clues: [
        'The address P. Sherman, 42 Wallaby Way, Sydney comes from it.',
        'Ellen DeGeneres voices a forgetful blue tang.',
        'The Pixar film where a clownfish crosses the ocean looking for his son.',
      ],
      answer: 'Finding Nemo',
    },
    {
      category: 'Music',
      clues: [
        'Its guitarist has a PhD in astrophysics.',
        'Its set at Live Aid in 1985 is often ranked among the best live shows ever played.',
        'The band fronted by Freddie Mercury.',
      ],
      answer: 'Queen',
    },
    {
      category: 'Music',
      clues: [
        "His first group was the World Class Wreckin' Cru.",
        'His solo debut album was The Chronic.',
        'The N.W.A member who sold Beats headphones to Apple.',
      ],
      answer: 'Dr. Dre',
      accept: ['dre', 'dr dre', 'andre young'],
    },
    {
      category: 'Words',
      clues: [
        'Dormitory and dirty room are a well known pair.',
        'Tom Marvolo Riddle and I am Lord Voldemort are another pair.',
        'A word made by rearranging the letters of another, like listen and silent.',
      ],
      answer: 'Anagram',
      accept: ['anagrams'],
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Its name comes from Nahuatl, the language of the Aztecs.',
        'Lime juice slows it from turning brown.',
        'The green avocado dip that costs extra at Chipotle.',
      ],
      answer: 'Guacamole',
      accept: ['guac'],
    },
    {
      category: 'Tech',
      clues: [
        'His official name was Clippit.',
        'He arrived with Microsoft Office 97.',
        'The paperclip who says it looks like you are writing a letter.',
      ],
      answer: 'Clippy',
    },
    {
      category: 'D&D',
      clues: [
        'In the old French romances the word meant one of the twelve peers of Charlemagne.',
        'Their signature features are Lay on Hands and Divine Smite.',
        'It is the holy knight class that swears an oath.',
      ],
      answer: 'Paladin',
    },
    {
      category: 'Geography',
      clues: [
        'It stands on wooden piles driven into the mud of a lagoon.',
        'Its Bridge of Sighs led prisoners to their cells.',
        'The Italian city of canals and gondolas.',
      ],
      answer: 'Venice',
      accept: ['venezia'],
    },
    {
      category: 'Food',
      clues: [
        'It is the same species as cabbage, kale and cauliflower.',
        'President George H. W. Bush said he hated it and refused to eat it.',
        'It looks like little green trees and kids push it around the plate.',
      ],
      answer: 'Broccoli',
    },
  ],
  [
    {
      category: 'Food',
      clues: [
        'Japanese farmers grow cube shaped ones inside boxes.',
        'The comedian Gallagher smashed them on stage with a sledgehammer.',
        'The big green fruit with red flesh and black seeds.',
      ],
      answer: 'Watermelon',
    },
    {
      category: 'Science',
      clues: [
        'The third law of thermodynamics says you can approach it but never reach it.',
        'It is minus 273.15 degrees Celsius, the bottom of the Kelvin scale.',
        'The coldest temperature possible.',
      ],
      answer: 'Absolute zero',
      accept: ['0 kelvin', 'zero kelvin', '0k'],
    },
    {
      category: 'Games',
      clues: [
        'It was started by a group of friends from Highland Park, Illinois.',
        'One Black Friday its makers took donations to dig a big hole for no reason.',
        'A party game for horrible people where you fill in the blank with something awful.',
      ],
      answer: 'Cards Against Humanity',
      accept: ['cah'],
    },
    {
      category: 'Movies',
      clues: [
        'It beat Pulp Fiction and The Shawshank Redemption for Best Picture.',
        'A real chain of shrimp restaurants was spun off from it.',
        'Tom Hanks sits on a bench and says life is like a box of chocolates.',
      ],
      answer: 'Forrest Gump',
    },
    {
      category: 'Video games',
      clues: [
        'It grew out of a student project called Narbacular Drop.',
        'It first shipped in 2007 as part of The Orange Box.',
        'GLaDOS promises you cake while you solve test chambers.',
      ],
      answer: 'Portal',
    },
  ],
  [
    {
      category: 'Comics',
      clues: [
        'He leads the Brotherhood of Mutants and once ruled the island of Genosha.',
        'He has been played on film by Ian McKellen and Michael Fassbender.',
        'He is the X-Men villain who controls metal.',
      ],
      answer: 'Magneto',
    },
    {
      category: 'Movies',
      clues: [
        'Oliver Reed died during filming, so some of his scenes were finished digitally.',
        'Joaquin Phoenix plays the emperor Commodus.',
        'Russell Crowe asks the arena crowd, Are you not entertained?',
      ],
      answer: 'Gladiator',
    },
    {
      category: 'Animals',
      clues: [
        'Its genus name, Odobenus, means tooth walker.',
        'It finds clams on the seabed with its whiskers.',
        'A huge Arctic relative of the seal with two long tusks.',
      ],
      answer: 'Walrus',
    },
    {
      category: 'Space',
      clues: [
        'Its crew used the lunar module Aquarius as a lifeboat.',
        'An oxygen tank blew on the way to the Moon in April 1970.',
        'Houston, we have a problem. Tom Hanks starred in the movie about it.',
      ],
      answer: 'Apollo 13',
      accept: ['apollo thirteen', 'apollo xiii'],
    },
    {
      category: 'People',
      clues: [
        'His company Jersey Films was behind Pulp Fiction and Erin Brockovich.',
        'He played the Penguin in Batman Returns.',
        "He plays Frank Reynolds on It's Always Sunny in Philadelphia.",
      ],
      answer: 'Danny DeVito',
      accept: ['devito'],
    },
  ],
  [
    {
      category: 'History',
      clues: [
        'Bad weather pushed it back by one day.',
        'Its beaches were code named Utah, Omaha, Gold, Juno and Sword.',
        'The Allied landing in Normandy on June 6, 1944.',
      ],
      answer: 'D-Day',
      accept: ['d day', 'dday', 'normandy landings', 'normandy invasion', 'invasion of normandy'],
    },
    {
      category: 'Movies',
      clues: [
        'William Goldman adapted it from his own 1973 novel.',
        'Andre the Giant plays Fezzik.',
        'It has the lines Inconceivable and My name is Inigo Montoya.',
      ],
      answer: 'The Princess Bride',
    },
    {
      category: 'Comics',
      clues: [
        'He first appeared in Detective Comics number 27 in 1939.',
        'His butler is Alfred Pennyworth.',
        'Bruce Wayne dresses up as a flying mammal to fight crime in Gotham.',
      ],
      answer: 'Batman',
      accept: ['the dark knight'],
    },
    {
      category: 'Toys',
      clues: [
        'Mattel launched them in 1968 to compete with Matchbox.',
        'They race on orange plastic track with loops.',
        'The tiny die cast toy cars with a flame logo.',
      ],
      answer: 'Hot Wheels',
      accept: ['hotwheels'],
    },
    {
      category: 'Food',
      clues: [
        'A track coach poured rubber into the iron used to make one, and the result became a Nike sole.',
        'The Belgian kind has deeper pockets.',
        'A breakfast grid that holds syrup. Eggo sells frozen ones.',
      ],
      answer: 'Waffle',
      accept: ['waffles'],
    },
  ],
];
