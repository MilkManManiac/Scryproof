/**
 * The desktop's screen-share picker, the parts that are plain data, so they
 * can be tested without Electron. The picker itself is drawn by the page
 * (`web/src/components/SharePicker.tsx`); `main.js` gathers the screens and
 * windows, hands the page this list, and checks the answer that comes back.
 *
 * Sound is a choice, off unless the person turns it on. On Windows "with
 * sound" means loopback: everything the machine plays, which includes the
 * call itself. Electron 44 offers `'loopback'` and `'loopbackWithMute'` and
 * nothing that leaves one program out; the second mutes the sharer's own
 * speakers, so they would stop hearing the call. With two people sharing
 * sound, each share carries the other's voice and screen sound back into the
 * call, so the switch says so rather than leaving it to be found out.
 */

export const SOUND_LABEL = 'Include sound (the call may echo)';

/** Whether this machine can send its sound with a share at all. Loopback is Windows only. */
export const canShareSound = (platform) => platform === 'win32';

/**
 * What to hand Electron once a screen or window is chosen: the picture, and
 * the machine's sound only when the page asked for sound and the person turned
 * it on.
 */
export function shareStreams(source, { audioRequested, platform, withSound }) {
  return audioRequested && withSound && canShareSound(platform) ? { video: source, audio: 'loopback' } : { video: source };
}

/** Whether a capture source is a whole screen or one window, from its id. Null for anything else. */
export function sourceKind(id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('screen:')) return 'screen';
  if (id.startsWith('window:')) return 'window';
  return null;
}

/** A NativeImage as a data URL, or null when there is no picture (a minimised window has none). */
const picture = (image) => (image && typeof image.toDataURL === 'function' && !image.isEmpty?.() ? image.toDataURL() : null);

/**
 * What the page is shown: screens, then windows, each with its name, a small
 * picture, and the window's app icon. Only what the picker needs crosses to
 * the page; the source objects themselves stay here, because they are what
 * Electron is answered with.
 */
export function pickerList(sources) {
  const listed = sources
    .map((source) => ({ source, kind: sourceKind(source.id) }))
    .filter(({ kind }) => kind !== null)
    .map(({ source, kind }) => ({
      id: source.id,
      name: (source.name ?? '').slice(0, 80) || 'Untitled',
      kind,
      thumbnail: picture(source.thumbnail),
      icon: picture(source.appIcon),
    }));
  return [...listed.filter((item) => item.kind === 'screen'), ...listed.filter((item) => item.kind === 'window')];
}

/**
 * Whether the picker offers sound, and in which position the switch starts.
 * Null means no switch: sound was not asked for, or this machine cannot send it.
 */
export function soundOffer({ audioRequested, platform, withSound }) {
  return audioRequested && canShareSound(platform) ? withSound === true : null;
}

/**
 * The page's answer, checked. The page is ours, but it is also where a
 * message's contents are drawn, so what it sends back is held to the list it
 * was given: an id that was never offered, or anything that is not an answer
 * at all, is a cancel. Returns null for a cancel, otherwise the streams to
 * hand Electron and the sound choice to remember (null when there was no
 * choice to make).
 */
export function shareAnswer(offered, answer, { audioRequested, platform }) {
  if (!answer || typeof answer !== 'object' || typeof answer.id !== 'string') return null;
  const source = offered.find((candidate) => candidate.id === answer.id && sourceKind(candidate.id) !== null);
  if (!source) return null;
  const choosing = soundOffer({ audioRequested, platform, withSound: false }) !== null;
  const withSound = choosing && answer.withSound === true;
  return {
    streams: shareStreams(source, { audioRequested, platform, withSound }),
    remember: choosing ? withSound : null,
  };
}
