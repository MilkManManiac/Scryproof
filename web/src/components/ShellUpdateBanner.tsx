/**
 * The bar across the top when a newer installer for the app itself is ready.
 */

/**
 * `how` is how the shell can install it. 'restart' closes the app and swaps
 * it, which would hang up a call, so the person picks the moment. 'download'
 * is a Mac app that cannot replace itself: the button opens the download link
 * in the browser, which does not touch the call, so it is offered at any time.
 */
export function ShellUpdateBanner({
  how,
  inVoice,
  onApply,
}: {
  how: 'restart' | 'download';
  inVoice: boolean;
  onApply: () => void;
}) {
  const download = how === 'download';
  return (
    <div className="banner update">
      A new version of the app is ready.{' '}
      {inVoice && !download ? (
        'Restart to install when your call is over.'
      ) : (
        <button type="button" className="link-button" onClick={onApply}>
          {download ? 'Download it to update' : 'Restart to install'}
        </button>
      )}
    </div>
  );
}
