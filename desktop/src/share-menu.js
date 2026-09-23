/**
 * The desktop's screen-share picker, as plain data, so it can be tested
 * without Electron. `main.js` turns the template into a menu and pops it.
 *
 * Sound is a choice, off unless the person ticks it. On Windows "with sound"
 * means loopback: everything the machine plays, which includes the call
 * itself. Electron 44 offers `'loopback'` and `'loopbackWithMute'` and nothing
 * that leaves one program out; the second mutes the sharer's own speakers,
 * so they would stop hearing the call. With two people sharing sound, each
 * share carries the other's voice and screen sound back into the call, so the
 * checkbox says so rather than leaving it to be found out.
 */

export const SOUND_LABEL = 'Include sound (the call may echo)';

/** Whether this machine can send its sound with a share at all. Loopback is Windows only. */
export const canShareSound = (platform) => platform === 'win32';

/**
 * What to hand Electron once a screen or window is chosen: the picture, and
 * the machine's sound only when the page asked for sound and the person ticked
 * the box.
 */
export function shareStreams(source, { audioRequested, platform, withSound }) {
  return audioRequested && withSound && canShareSound(platform) ? { video: source, audio: 'loopback' } : { video: source };
}

/**
 * The menu: screens, then windows, then the sound checkbox when sound is
 * possible and was asked for. Clicking the checkbox closes the menu (every
 * menu item does), so `onToggleSound` is expected to open it again.
 */
export function shareMenuTemplate(sources, { audioRequested, platform, withSound, onPick, onToggleSound }) {
  const entry = (source) => ({ label: source.name.slice(0, 80) || 'Untitled', click: () => onPick(source) });
  const screens = sources.filter((source) => source.id.startsWith('screen:'));
  const windows = sources.filter((source) => source.id.startsWith('window:'));
  const template = [
    { label: 'Share a screen', enabled: false },
    ...screens.map(entry),
    { type: 'separator' },
    { label: 'Share a window', enabled: false },
    ...windows.map(entry),
  ];
  if (audioRequested && canShareSound(platform)) {
    template.push(
      { type: 'separator' },
      { label: SOUND_LABEL, type: 'checkbox', checked: withSound, click: () => onToggleSound(!withSound) },
    );
  }
  return template;
}
