/**
 * Threeway: Thrice, five questions a day for everyone here (Wes,
 * 2026-09-29). Opened from the games folder in the rail, or `/threeway`.
 *
 * One question at a time. A clue, a box, and two ways on: say what it is, or
 * pass. Either brings the next clue if you were not right. The server has
 * the questions and sends a clue only when it is due; this shows what it
 * has been given, and holds each answer up for a moment before moving on.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { THRICE, THRICE_MAX, thriceShare } from '@scryproof/shared';
import type { ThriceQuestionShown, ThriceToday } from '@scryproof/shared';

import { ApiError, api } from '../lib/api';
import { thrice } from '../lib/daily';
import { average } from './GameBoard';
import { GameShell, ResultActions, ServerBoard, StatText, useToast, type Say } from './GameShell';

const VERDICT = ['Rough', 'Rough', 'Rough', 'Rough', 'Not bad', 'Not bad', 'Not bad', 'Not bad', 'Good', 'Good', 'Good', 'Sharp', 'Sharp', 'Sharp', 'So close', 'Perfect'];

export function ThriceGate() {
  const view = useSyncExternalStore(thrice.subscribe, thrice.get);
  return view.open ? <Thrice today={view.today} /> : null;
}

function Pips({ questions, at }: { questions: ThriceQuestionShown[]; at: number }) {
  return (
    <div className="tw-pips" aria-label="The five questions">
      {Array.from({ length: THRICE.questions }, (_, index) => {
        const points = questions[index]?.points ?? null;
        return (
          <span key={index} className={`tw-pip${points === null ? '' : ` p${points}`}${index === at ? ' here' : ''}`}>
            {points === null ? index + 1 : points}
          </span>
        );
      })}
    </div>
  );
}

function Thrice({ today }: { today: ThriceToday | null }) {
  const { toast, say } = useToast();
  /** The question on screen. It stays on one just closed until you move on. */
  const [at, setAt] = useState<number | null>(null);

  const day = today?.day;
  useEffect(() => setAt(null), [day]);

  const questions = today?.questions ?? [];
  // Opening it part way through goes to the open question; opening it finished, to the result.
  const open = questions.findIndex((question) => question.points === null);
  const showing = at ?? (open >= 0 ? open : questions.length);
  const question = questions[showing];

  return (
    <GameShell name={THRICE.name} kind="tw" day={today?.day ?? null} toast={toast} loading={today === null} onClose={thrice.close}>
      {today === null ? null : (
        <>
          <Pips questions={questions} at={question ? showing : -1} />
          {question ? (
            <Question
              key={showing}
              question={question}
              number={showing + 1}
              last={showing === THRICE.questions - 1}
              say={say}
              onShown={() => setAt(showing)}
              onNext={() => setAt(showing + 1)}
            />
          ) : (
            <Result today={today} say={say} />
          )}
          <ServerBoard
            game={thrice}
            load={api.thrice.server}
            day={today.day}
            mine={today.state}
            finishes={(result) =>
              [...result.finishes]
                .sort((a, b) => b.score - a.score)
                .map((entry) => ({ userId: entry.userId, note: entry.points.join(' '), score: `${entry.score}/${THRICE_MAX}` }))
            }
            columns={['Points', 'Days', 'Avg', 'Best', 'Perfect']}
            standings={(result) =>
              [...result.standings]
                .sort((a, b) => b.total - a.total || (b.average ?? 0) - (a.average ?? 0))
                .map((entry) => ({ userId: entry.userId, cells: [entry.total, entry.played, average(entry.average), entry.best, entry.perfect] }))
            }
          />
        </>
      )}
    </GameShell>
  );
}

function Question({
  question,
  number,
  last,
  say,
  onShown,
  onNext,
}: {
  question: ThriceQuestionShown;
  number: number;
  last: boolean;
  say: Say;
  onShown: () => void;
  onNext: () => void;
}) {
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const closed = question.points !== null;
  const worth = THRICE.clues - question.tries.length;

  useEffect(() => {
    if (closed) next.current?.focus();
    else input.current?.focus();
  }, [closed, question.clues.length]);

  async function answer(text: string) {
    if (busy || closed) return;
    setBusy(true);
    // Whatever comes back, this question stays on screen until it has been looked at.
    onShown();
    try {
      const after = await api.thrice.answer(text);
      thrice.apply(after);
      const mine = after.questions[number - 1]!;
      setSaid('');
      if (mine.points !== null && mine.points > 0) say(`+${mine.points}`, true);
      else if (text) {
        setShaking(true);
        setTimeout(() => setShaking(false), 450);
      }
    } catch (problem) {
      say(problem instanceof ApiError ? problem.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-question">
      <div className="tw-category">
        <span>
          {number}. {question.category}
        </span>
        {closed ? null : (
          <span className="tw-worth">
            for {worth} point{worth === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <ol className="tw-clues">
        {question.clues.map((clue, index) => {
          const tried = question.tries[index];
          const newest = index === question.clues.length - 1;
          return (
            <li key={index} className={newest && !closed ? 'newest' : undefined}>
              <span className="tw-clue-worth">{THRICE.clues - index}</span>
              <span className="tw-clue">
                {clue}
                {tried !== undefined && !(closed && newest && question.points! > 0) ? (
                  <span className="tw-tried">{tried ? `You said “${tried}”` : 'Passed'}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {closed ? (
        <div className={`tw-answer${question.points! > 0 ? ' right' : ''}`}>
          <span className="tw-answer-label">{question.points! > 0 ? `+${question.points}` : 'It was'}</span>
          <span className="tw-answer-text">{question.answer}</span>
          <button type="button" ref={next} className="button inline" onClick={onNext}>
            {last ? 'See how you did' : 'Next question'}
          </button>
        </div>
      ) : (
        <form
          className={`tw-form${shaking ? ' shake' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (said.trim()) void answer(said);
          }}
        >
          <input
            ref={input}
            className="game-input"
            value={said}
            maxLength={80}
            placeholder="What is it?"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => setSaid(event.target.value)}
          />
          <button type="submit" className="button inline" disabled={busy || !said.trim()}>
            Answer
          </button>
          <button type="button" className="button secondary inline" disabled={busy} onClick={() => void answer('')}>
            {worth > 1 ? 'Pass' : 'Give up'}
          </button>
        </form>
      )}
    </div>
  );
}

function Result({ today, say }: { today: ThriceToday; say: Say }) {
  const points = today.questions.map((question) => question.points ?? 0);
  return (
    <div className="purdle-result">
      <div className="purdle-verdict">
        {VERDICT[today.score]}
        <span className="tw-total">
          {today.score}/{THRICE_MAX}
        </span>
      </div>
      <ul className="tw-recap">
        {today.questions.map((question, index) => (
          <li key={index}>
            <span className={`tw-pip p${question.points ?? 0}`}>{question.points ?? 0}</span>
            <span className="tw-recap-answer">{question.answer}</span>
            <span className="tw-recap-category">{question.category}</span>
          </li>
        ))}
      </ul>
      <div className="purdle-stats">
        <StatText value={today.stats.played} label="Played" />
        <StatText value={average(today.stats.average)} label="Average" />
        <StatText value={today.stats.best} label="Best" />
        <StatText value={today.stats.perfect} label="Perfect" />
      </div>
      <ResultActions
        share={thriceShare(today.day, points)}
        nextAt={today.nextAt}
        what="New questions"
        say={say}
        onClose={thrice.close}
        onTurnover={() => void thrice.load()}
      />
    </div>
  );
}
