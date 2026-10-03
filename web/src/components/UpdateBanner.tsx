/**
 * The bar across the top when something newer is ready.
 */

import { useEffect, useState } from 'react';

import { applyClientUpdate, applyShellUpdate, onClientUpdate, onDesktopRelease } from '../lib/desktop';
import { DesktopReleaseNotice } from './DesktopReleaseNotice';
import { useShellUpdate } from '../lib/desktop-hooks';

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

/**
 * A newer client is ready: in the app, fetched and checked and waiting; in a
 * browser, published. Switching to it is a reload, which would hang up a
 * call, so the person picks the moment. Nothing reloads on its own (Wes,
 * 2026-09-21). Left alone, it is simply there next time the app or the tab
 * is opened.
 *
 * In the app, a newer installer can be waiting too. That one wins: it carries
 * a client of its own, and restarting installs both.
 */
export function UpdateBanner({ inVoice }: { inVoice: boolean }) {
  const [client, setClient] = useState(false);
  const [release, setRelease] = useState<string | null>(null);
  const shell = useShellUpdate();
  useEffect(() => onClientUpdate(() => setClient(true)), []);
  // Only shells that cannot install updates themselves hear of a release here.
  useEffect(() => onDesktopRelease(setRelease), []);
  if (shell) return <ShellUpdateBanner how={shell} inVoice={inVoice} onApply={applyShellUpdate} />;
  const available = release ? <DesktopReleaseNotice version={release} /> : null;
  if (!client) return available;
  return (
    <>
      {available}
      <div className="banner update">
        A newer Scryproof is ready.{' '}
        {inVoice ? (
          'Reload when your call is over.'
        ) : (
          <button type="button" className="link-button" onClick={applyClientUpdate}>
            Reload now
          </button>
        )}
      </div>
    </>
  );
}
