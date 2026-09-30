/**
 * The top of every daily game: its name, how to play it, and the way out
 * (Wes, 2026-09-29: "make sure instructions are pretty clear. Even when you
 * are in the game").
 *
 * The rules sit behind the ? and open over nothing: they push the game down
 * and it carries on underneath, clock included. The first time a game is
 * opened on a device they are already open.
 */

import { useState, type ReactNode } from 'react';
import { BEE, CUNTECTIONS, LOWBALL, PURDLE, QUEENS, ROUND_MAX, ROUNDS_MAX, THRICE, THRICE_MAX, TRAVLE, WHEREABOUTS } from '@scryproof/shared';

export type GameId = 'purdle' | 'cuntections' | 'bee' | 'queens' | 'travle' | 'thrice' | 'whereabouts' | 'lowball';

interface Rule {
  /** A square of the colour the line is about. */
  chip?: string;
  text: ReactNode;
}

const RULES: Record<GameId, { goal: string; rules: Rule[] }> = {
  purdle: {
    goal: `Find the ${PURDLE.length} letter word in ${PURDLE.tries} guesses.`,
    rules: [
      { text: 'Every guess has to be a real word. Type it and press Enter.' },
      { chip: 'hit', text: 'Green: that letter is in the word, and in that place.' },
      { chip: 'near', text: 'Yellow: that letter is in the word, somewhere else.' },
      { chip: 'miss', text: 'Grey: that letter is not in the word.' },
      { text: 'A letter can be in the word twice.' },
    ],
  },
  cuntections: {
    goal: 'Sort the sixteen words into four groups of four.',
    rules: [
      { text: 'The four in a group have one thing in common. Pick four and press Submit.' },
      { text: 'Every word belongs to one group only, though some look like they fit two. That is the trap.' },
      { text: `${CUNTECTIONS.mistakes} wrong guesses and the day is over. “One away” means three of your four were right.` },
      { chip: 'l0', text: 'Yellow is the easiest group.' },
      { chip: 'l3', text: 'Purple is the hardest, and is often a play on words.' },
    ],
  },
  bee: {
    goal: 'Make as many words as you can from the seven letters.',
    rules: [
      { chip: 'centre', text: 'Every word has to use the middle letter.' },
      { text: `Words are ${BEE.shortest} letters or longer. A letter can be used more than once.` },
      { text: `A ${BEE.shortest} letter word is 1 point. A longer one is a point a letter.` },
      { text: `A word that uses all seven letters is worth ${BEE.pangramBonus} more. There is always at least one.` },
      { text: 'A deep cut is a rare word. It scores, but the day’s ranks do not count on you finding it.' },
      { text: 'No names, no hyphens. There is no losing: it stays open all day.' },
    ],
  },
  queens: {
    goal: `Put ${QUEENS.size} queens on the board.`,
    rules: [
      { text: 'One queen in every row.' },
      { text: 'One queen in every column.' },
      { text: 'One queen in every colour.' },
      { text: 'No two queens touching, not even at a corner.' },
      { chip: 'clash', text: 'A queen goes red when it breaks a rule with another queen.' },
      { text: 'Tap a square once for a cross, twice for a queen, again to clear it. Drag to cross off a run.' },
      { text: 'Crosses are only your own notes. If you run out of squares, a queen you placed earlier is wrong.' },
      { text: 'Where to start: a colour with one square, or one that fits in a single row or column.' },
    ],
  },
  travle: {
    goal: 'Get from one country to the other by land, naming the countries in between.',
    rules: [
      { text: 'Countries join where they share a land border. Name a chain of them that links the two ends.' },
      { text: 'You can name them in any order. The day is won the moment the chain is whole.' },
      { chip: 'good', text: 'Green: on a shortest way there.' },
      { chip: 'near', text: 'Amber: a way through it works, but is one or two borders longer.' },
      { chip: 'off', text: 'Red: no help.' },
      { text: 'You get a few more guesses than the shortest way needs. Every guess counts, right or wrong.' },
      { text: 'Zoom the map with the buttons, the wheel or two fingers, and drag it around.' },
    ],
  },
  thrice: {
    goal: `${THRICE.questions} questions, up to ${THRICE.clues} clues each, ${THRICE_MAX} points to win.`,
    rules: [
      { text: `Right on the first clue is ${THRICE.clues} points. On the second, 2. On the third, 1.` },
      { text: 'A wrong answer or a pass brings the next clue. Clues get easier.' },
      { text: 'After the third clue the answer is shown and you get nothing.' },
      { text: 'A typo is forgiven in a long answer, never in a short one. Capitals and “the” do not matter.' },
    ],
  },
  whereabouts: {
    goal: `${WHEREABOUTS.rounds} photos from somewhere in the world. Click where you think each was taken.`,
    rules: [
      { text: `Up to ${ROUND_MAX.toLocaleString('en-US')} a photo, ${ROUNDS_MAX.toLocaleString('en-US')} for a perfect day. On the spot is full marks; about 1,000 km off is half; another continent is next to nothing.` },
      { text: 'Scroll or double-click the photo to zoom in on signs, plates and road lines. Drag to look around it.' },
      { text: 'Zoom the map the same way. Click to drop your pin, click again to move it, then press Guess.' },
      { text: 'One guess a photo. After it you see where it really was.' },
    ],
  },
  lowball: {
    goal: `${LOWBALL.rounds} US homes. Guess what each one sold for.`,
    rules: [
      { text: `Up to ${ROUND_MAX.toLocaleString('en-US')} a home, ${ROUNDS_MAX.toLocaleString('en-US')} for a perfect day. Within 2% is full marks.` },
      { text: 'It goes by how far off you are, not by dollars: 10% off is about 3,700, a quarter off about 2,600, double or half about 600.' },
      { text: 'Type it how you like: 450000, $450,000, 450k or 1.2m.' },
      { text: 'Most are the price it actually sold for. A few are the asking price, and say so.' },
    ],
  },
};

const seenKey = (game: GameId) => `scryproof.rules.${game}`;

function seen(game: GameId): boolean {
  try {
    return localStorage.getItem(seenKey(game)) !== null;
  } catch {
    // No store to ask: better the rules once too often than never.
    return false;
  }
}

function remember(game: GameId) {
  try {
    localStorage.setItem(seenKey(game), '1');
  } catch {
    // Then they open again next time.
  }
}

export function GameHead({ game, name, day, onClose }: { game: GameId; name: string; day: number | null; onClose: () => void }) {
  const [open, setOpen] = useState(() => !seen(game));
  const { goal, rules } = RULES[game];

  const toggle = () => {
    remember(game);
    setOpen((now) => !now);
  };

  return (
    <>
      <header className="purdle-head">
        <div className="purdle-title">
          {name}
          {day !== null ? <span className="purdle-number">#{day}</span> : null}
        </div>
        <div className="purdle-head-tools">
          <button
            type="button"
            className={`game-how${open ? ' open' : ''}`}
            aria-expanded={open}
            aria-controls={`rules-${game}`}
            onClick={toggle}
          >
            How to play
          </button>
          <button type="button" className="icon-button purdle-close" aria-label="Close" title="Close" onClick={onClose}>
            &#10005;
          </button>
        </div>
      </header>
      {open ? (
        <section className={`game-rules ${game}`} id={`rules-${game}`} aria-label={`How to play ${name}`}>
          <p className="game-rules-goal">{goal}</p>
          <ul>
            {rules.map((rule, index) => (
              <li key={index}>
                {rule.chip ? <span className={`game-rules-chip ${rule.chip}`} aria-hidden="true" /> : <span className="game-rules-dot" aria-hidden="true" />}
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="button secondary inline" onClick={toggle}>
            Got it
          </button>
        </section>
      ) : null}
    </>
  );
}
