/*
 * The service worker, and all it does is exist.
 *
 * A phone will only offer "add to home screen" as a real app when the site
 * has one of these. It caches nothing: the page is served no-store so a new
 * build is seen on the next open, and the app already watches for one and
 * offers a reload at a moment that does not hang up a call. A cache here
 * would fight both of those. Every request goes to the network as it would
 * without this file.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
