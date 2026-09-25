/**
 * What a forwarded API response goes back to the page with, and which URLs the
 * window is allowed to go to.
 *
 * The window shows code that came inside the installer, served from
 * `app://scryproof`, and that origin is where the keys live. `/api/*` on the
 * same origin is the server's answer, forwarded by `main.js`: bytes the page
 * asked for, which are data. A response that ended up rendered as a document
 * instead would be code the server chose, running in the origin that holds
 * the keys — the one thing this app exists to avoid. Nothing points at an
 * `/api/` URL that way today; the headers below and the navigation rule mean
 * nothing can start to.
 *
 * `sandbox; default-src 'none'` makes such a document inert if one is ever
 * made: no script runs, and it cannot reach this origin's storage. It does not
 * affect the page's own fetch or XHR of an API URL: a policy header applies
 * when the response is a document, so a JSON body read by the page arrives
 * exactly as before, apart from these two headers.
 *
 * No Electron in this file, so `node --test` can run it.
 */

/** The origin the client is served from. `main.js` serves the client and the API proxy under it. */
export const APP_ORIGIN = 'app://scryproof';

/** The two headers a forwarded response is always given, whatever the server sent. */
const HARDENED = {
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

/**
 * The headers of a forwarded API response, with those two set. Whatever the
 * server sent under either name is dropped, in any letter case; every other
 * header is left alone. Takes a `Headers` or a plain object of name/value
 * pairs, and gives back a new `Headers`, so nothing in the response being
 * copied is touched.
 */
export function hardenApiHeaders(headers = new Headers()) {
  const out = new Headers(headers);
  for (const [name, value] of Object.entries(HARDENED)) out.set(name, value);
  return out;
}

/** The app's host, so the letters in it are compared without caring about their case. */
const APP_HOST = new URL(APP_ORIGIN).host.toLowerCase();

/**
 * Whether a URL is one this app forwards to the server: `/api/...` on the
 * app's own origin. `base` is what a relative URL is resolved against, which
 * matters for a redirect's `Location`: the page resolves that against the URL
 * it asked for, so a caller checking a redirect passes that URL as `base`.
 *
 * The path is matched the way `handle` routes it — `/api/` as written, case
 * and all — so a URL that would not be forwarded is not called one here
 * either. A disguised spelling does not get past it: the URL parser resolves
 * `..` and its percent-encoded form (`%2e%2e`) while parsing, and lowercases
 * the scheme and host, so anything that normalises to `/api/` arrives here
 * already looking like `/api/`.
 *
 * Backslashes are the exception. `main.js` registers `app:` as a standard
 * scheme, so Chromium reads `\` as `/` in it, the way it does for `https:`;
 * Node's parser treats `app:` as an unknown scheme and keeps the `\`. So they
 * are turned into slashes first, as Chromium would. And on this origin a path
 * that holds an encoded slash or backslash (`%2f`, `%5c`) counts as an
 * API URL: no page of ours is named like that, and a server could read one as
 * a path under `/api/`, so it is refused rather than guessed at.
 */
export function isApiUrl(raw, base = `${APP_ORIGIN}/`) {
  let url;
  try {
    url = new URL(String(raw).replaceAll('\\', '/'), base);
  } catch {
    return false;
  }
  if (url.protocol !== 'app:' || url.host.toLowerCase() !== APP_HOST) return false;
  return url.pathname.startsWith('/api/') || /%2f|%5c/i.test(url.pathname);
}
