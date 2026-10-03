/**
 * A link to the desktop app for this computer, or nothing where there is none
 * to offer: a Mac only gets one once the disk image is on the server.
 */

import type { ReactNode } from 'react';

import type { DesktopDownload } from '../lib/desktop';
import { useDesktopDownload } from '../lib/desktop-hooks';

export function DesktopAppLinkView({
  link,
  className,
  children,
}: {
  link: DesktopDownload | null;
  className?: string;
  children: (system: DesktopDownload['system']) => ReactNode;
}) {
  if (!link) return null;
  return (
    <a className={className} href={link.href}>
      {children(link.system)}
    </a>
  );
}

export const DesktopAppLink = (props: { className?: string; children: (system: DesktopDownload['system']) => ReactNode }) => (
  <DesktopAppLinkView link={useDesktopDownload()} {...props} />
);
