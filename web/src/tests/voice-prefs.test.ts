import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { openMicrophoneOrDefault, voicePrefs } from '../lib/voice-prefs';

const missing = (): Error => Object.assign(new Error(''), { name: 'OverconstrainedError' });
const blocked = (): Error => Object.assign(new Error(''), { name: 'NotAllowedError' });

describe('openMicrophoneOrDefault', () => {
  it('falls back to the system default when the chosen microphone is gone, and says so', async () => {
    voicePrefs.set({ inputDeviceId: 'stale-id' });
    const asked: Array<ConstrainDOMString | undefined> = [];
    let told = 0;
    const opened = await openMicrophoneOrDefault(voicePrefs.get(), async (options) => {
      asked.push(options.deviceId);
      if (typeof options.deviceId === 'object' && 'exact' in options.deviceId) throw missing();
      return 'default-mic';
    }, () => { told += 1; });
    assert.equal(opened, 'default-mic');
    // The second ask names the default outright: LiveKit fills an unset deviceId from the room's defaults, which still hold the stale one.
    assert.deepEqual(asked, [{ exact: 'stale-id' }, { ideal: 'default' }]);
    assert.equal(told, 1);
    assert.equal(voicePrefs.get().inputDeviceId, '', 'the stale choice is cleared so settings say what is in use');
  });

  it('throws any other failure as it was, without a second try', async () => {
    voicePrefs.set({ inputDeviceId: 'some-id' });
    let tries = 0;
    await assert.rejects(
      openMicrophoneOrDefault(voicePrefs.get(), async () => { tries += 1; throw blocked(); }),
      (problem: Error) => problem.name === 'NotAllowedError',
    );
    assert.equal(tries, 1);
    assert.equal(voicePrefs.get().inputDeviceId, 'some-id');
  });
});
