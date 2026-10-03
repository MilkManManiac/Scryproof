import { DesktopInstallerLink } from './DesktopInstallerLink';

export function DesktopReleaseNotice({ version }: { version: string }) {
  return (
    <aside className="desktop-release" role="status">
      <span className="desktop-release-icon" aria-hidden="true">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
        </svg>
      </span>
      <div className="desktop-release-copy">
        <div className="desktop-release-heading">
          <strong>A new desktop version is available</strong>
          <span className="desktop-release-version">v{version}</span>
        </div>
        <p>This older version needs the installer to update your app.</p>
      </div>
      <div className="desktop-release-actions">
        <DesktopInstallerLink prominent />
        <span>Install when your call is over.</span>
      </div>
    </aside>
  );
}
