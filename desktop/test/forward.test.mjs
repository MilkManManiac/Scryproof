/**
 * The window shows code from inside the installer, served from `app://scryproof`,
 * and `/api/*` on that same origin is the server's answer, forwarded by
 * `main.js`. The server is played by the test here and may send whatever
 * headers it likes; none of them reach a document.
 *
 *   npm test          (in desktop/)
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { APP_ORIGIN, hardenApiHeaders, isApiUrl } from '../src/forward-core.js';

const OUR_CSP = "sandbox; default-src 'none'";

describe('the headers a forwarded response goes back with', () => {
  test('both go on a response that had neither', () => {
    const out = hardenApiHeaders({ 'content-type': 'application/json' });
    assert.equal(out.get('content-security-policy'), OUR_CSP);
    assert.equal(out.get('x-content-type-options'), 'nosniff');
    assert.equal(out.get('content-type'), 'application/json');
  });

  test('the server cannot keep its own, whichever case it spelled them in', () => {
    for (const csp of ['Content-Security-Policy', 'content-security-policy', 'CONTENT-SECURITY-POLICY']) {
      for (const nosniff of ['X-Content-Type-Options', 'x-content-type-options']) {
        const out = hardenApiHeaders({ [csp]: "script-src 'unsafe-inline' *", [nosniff]: 'sniff-away', 'content-type': 'text/html' });
        assert.equal(out.get('content-security-policy'), OUR_CSP);
        assert.equal(out.get('x-content-type-options'), 'nosniff');
      }
    }
  });

  test('every other header is left exactly as it was', () => {
    const out = hardenApiHeaders({
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': 'a=1',
      'cache-control': 'no-store',
      'X-Frame-Options': 'DENY',
    });
    assert.deepEqual([...out.keys()].sort(), [
      'cache-control',
      'content-security-policy',
      'content-type',
      'set-cookie',
      'x-content-type-options',
      'x-frame-options',
    ]);
    assert.equal(out.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(out.get('cache-control'), 'no-store');
    assert.equal(out.get('x-frame-options'), 'DENY');
  });

  test('what went in is not touched, so nothing in flight changes', () => {
    const server = new Headers({ 'content-security-policy': 'default-src *', 'content-type': 'application/json' });
    const out = hardenApiHeaders(server);
    assert.notEqual(out, server);
    assert.equal(server.get('content-security-policy'), 'default-src *');
    assert.equal(server.get('x-content-type-options'), null);
  });
});

describe('a URL the app forwards to the server', () => {
  test('is one under /api/ on its own origin', () => {
    for (const url of [
      'app://scryproof/api/messages',
      'app://scryproof/api/',
      'APP://scryproof/api/messages',
      'app://SCryproof/api/messages',
    ]) {
      assert.equal(isApiUrl(url), true, url);
    }
  });

  test('includes a spelling that only normalises to /api/', () => {
    for (const url of [
      'app://scryproof/api/../api/messages',
      'app://scryproof/%2e%2e/api/messages', // encoded dot segments: the parser resolves them the same way
      'app://scryproof/api/%2e%2e/api/messages',
    ]) {
      assert.equal(isApiUrl(url), true, url);
    }
  });

  test('includes a spelling with backslashes, which Chromium reads as slashes here', () => {
    for (const url of [
      'app://scryproof\\api\\messages',
      'app://scryproof/api\\messages',
      'app:\\\\scryproof/api/messages',
      '\\api\\messages',
      'app://scryproof/x\\..\\api/messages',
      'app://scryproof/x/..%5capi/messages', // encoded backslash: refused, not guessed at
      'app://scryproof/api%2fmessages', // encoded slash: the same
      'app://scryproof/api%2Fmessages',
    ]) {
      assert.equal(isApiUrl(url), true, url);
    }
    assert.equal(isApiUrl('..\\api\\messages', 'app://scryproof/x/y'), true);
  });

  test('is judged against the URL that asked, as a redirect would be', () => {
    assert.equal(isApiUrl('bar', 'app://scryproof/api/messages'), true);
    assert.equal(isApiUrl('../api/messages', 'app://scryproof/api/x'), true);
    assert.equal(isApiUrl('/api/messages', 'app://scryproof/api/x'), true);
    assert.equal(isApiUrl('api/messages', `${APP_ORIGIN}/`), true);
    assert.equal(isApiUrl('../messages', 'app://scryproof/api/x'), false);
  });

  test('is not one on any other origin, or with any other scheme', () => {
    for (const url of [
      'https://scryproof.com/api/messages',
      'app://somewhere-else/api/messages',
      'app://scryproof:8443/api/messages',
      'javascript:alert(1)',
      'http://[',
      '',
    ]) {
      assert.equal(isApiUrl(url), false, url);
    }
  });

  test('is not one when the path is one `handle` would not forward', () => {
    for (const url of [
      'app://scryproof/API/messages', // the route match is case-sensitive, and so is this
      'app://scryproof/api', // no trailing slash: served as a client file
      'app://scryproof/apis',
      'app://scryproof/app/messages',
      'app://scryproof/api/../index.html',
    ]) {
      assert.equal(isApiUrl(url), false, url);
    }
  });
});
