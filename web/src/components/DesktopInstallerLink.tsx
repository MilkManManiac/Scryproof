import { desktopDownload } from '../lib/desktop';

/** Older shells open HTTPS links in the browser, which saves this installer: the disk image on a Mac, the Windows installer elsewhere. */
export function DesktopInstallerLink({ prominent = false }: { prominent?: boolean }) {
  return (
    <a
      href={desktopDownload().href}
      target="_blank"
      rel="noopener noreferrer"
      className={prominent ? 'desktop-release-download' : undefined}
      aria-label="Download the desktop update"
    >
      {prominent ? 'Download update' : 'Download the desktop update'}
    </a>
  );
}
