/**
 * Making a recovery phrase, and typing one into a new device.
 *
 * Nothing is published until the words have been typed back, so closing the
 * dialog half way leaves everything as it was. The words are held in this
 * component's memory while it is open and nowhere after: not in storage, not in
 * a request, not on the clipboard unless the person puts them there.
 */

import { useMemo, useState } from 'react';

import { newPhrase, phraseLooksRight, tidyPhrase } from '../lib/dm-recovery';
import { useDms } from '../state/dms';
import { Modal } from './Modal';

/** Three places to be asked about, different each time, in reading order. */
function pickThree(): number[] {
  const places = new Set<number>();
  const random = new Uint8Array(1);
  while (places.size < 3) {
    globalThis.crypto.getRandomValues(random);
    places.add((random[0] ?? 0) % 12);
  }
  return [...places].sort((a, b) => a - b);
}

export function CreateRecovery({ onClose }: { onClose: () => void }) {
  const { state, createRecovery } = useDms();
  const replacing = state.recovery?.exists ?? false;
  const words = useMemo(() => newPhrase().split(' '), []);
  const asked = useMemo(pickThree, []);
  const [step, setStep] = useState<'why' | 'words' | 'check' | 'working' | 'done'>('why');
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [error, setError] = useState<string | null>(null);

  const allRight = asked.every((place) => tidyPhrase(typed[place] ?? '') === words[place]);

  async function finish() {
    if (!allRight) {
      setError('Those do not match what was shown. Go back and check what you wrote down.');
      return;
    }
    setError(null);
    setStep('working');
    try {
      await createRecovery(words.join(' '), (done, total) => setProgress([done, total]));
      setStep('done');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work. Nothing was changed.');
      setStep('check');
    }
  }

  const close = (
    <button type="button" className="button secondary inline" onClick={onClose}>
      {step === 'done' ? 'Close' : 'Cancel'}
    </button>
  );

  return (
    <Modal
      title="Recovery phrase"
      onClose={step === 'working' ? () => undefined : onClose}
      footer={
        step === 'why' ? (
          <>
            {close}
            <button type="button" className="button inline" onClick={() => setStep('words')}>
              Show me the words
            </button>
          </>
        ) : step === 'words' ? (
          <>
            {close}
            <button type="button" className="button inline" onClick={() => setStep('check')}>
              I have written them down
            </button>
          </>
        ) : step === 'check' ? (
          <>
            <button type="button" className="button secondary inline" onClick={() => setStep('words')}>
              Back to the words
            </button>
            <button type="button" className="button inline" onClick={() => void finish()}>
              Finish
            </button>
          </>
        ) : step === 'done' ? (
          close
        ) : null
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {step === 'why' ? (
        <div className="recovery-text">
          <p>
            Your direct messages are locked to the devices you use. A new computer, or this one after its browser data
            is cleared, cannot open the old ones. Nobody can: not the server, not whoever runs it.
          </p>
          <p>
            A recovery phrase is twelve words that can. Type them into a new device and your history opens there. They
            are made here and never sent anywhere, so if you lose them there is nobody to ask.
          </p>
          <p>
            <strong>Write them on paper.</strong> Anyone who reads them can read your messages.
          </p>
          {replacing ? (
            <p className="recovery-caution">
              You already have a phrase. Making a new one retires it: the old words stop working for anything sent from
              now on.
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'words' ? (
        <>
          <ol className="recovery-words" data-testid="recovery-words">
            {words.map((word, index) => (
              <li key={index}>
                <span>{index + 1}</span>
                {word}
              </li>
            ))}
          </ol>
          <p className="field-note">In this order. They will not be shown again after this.</p>
        </>
      ) : null}

      {step === 'check' ? (
        <>
          <p className="recovery-text">From what you wrote down:</p>
          {asked.map((place) => (
            <div className="field" key={place}>
              <label htmlFor={`recovery-word-${place}`}>Word {place + 1}</label>
              <input
                id={`recovery-word-${place}`}
                data-place={place}
                value={typed[place] ?? ''}
                onChange={(event) => setTyped((current) => ({ ...current, [place]: event.target.value }))}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          ))}
        </>
      ) : null}

      {step === 'working' ? (
        <p className="recovery-text">
          Locking your history to the phrase
          {progress[1] > 0 ? `: ${progress[0]} of ${progress[1]} conversations` : ''}. Keep this open.
        </p>
      ) : null}

      {step === 'done' ? (
        <p className="recovery-text">
          Done. Everything you can read here, the phrase can now open, and so can everything sent from now on. Put the
          paper somewhere you will find it.
        </p>
      ) : null}
    </Modal>
  );
}

export function RestoreRecovery({ onClose }: { onClose: () => void }) {
  const { restoreRecovery } = useDms();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    if (!phraseLooksRight(typed)) {
      setError('Those are not the twelve words. Check the spelling and the order.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await restoreRecovery(typed);
      setTyped('');
      setDone(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Enter your recovery phrase"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary inline" onClick={onClose}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {done ? null : (
            <button type="button" className="button inline" disabled={busy} onClick={() => void unlock()}>
              Unlock
            </button>
          )}
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {done ? (
        <p className="recovery-text">
          This device can now open what was locked to your phrase, and the people you talk to will not be asked to
          accept it.
        </p>
      ) : (
        <div className="field">
          <label htmlFor="recovery-phrase">The twelve words, in order</label>
          <textarea
            id="recovery-phrase"
            className="recovery-input"
            rows={3}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="field-note">They are used on this device and are not sent anywhere.</p>
        </div>
      )}
    </Modal>
  );
}
