/**
 * Which YouTube video a link points at, if any. Only the id comes out: the
 * card is built from what this box fetched, never from the link's own text.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeIdOf(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') id = url.searchParams.get('v');
    else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') id = second ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}
