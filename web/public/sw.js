/*
 * The service worker. Two jobs.
 *
 * It exists: a phone will only offer "add to home screen" as a real app when
 * the site has one of these. It caches nothing: the page is served no-store
 * so a new build is seen on the next open, and the app already watches for
 * one and offers a reload at a moment that does not hang up a call. A cache
 * here would fight both of those. Every request goes to the network as it
 * would without this file.
 *
 * And it wakes for phone notifications. The ping from Apple or Google is
 * empty (GAMEPLAN 1b: "something happened", nothing else). What it was about
 * is asked of our own server here, with this device's own session, and drawn
 * from the answer. If that fails, it still shows something: a browser that
 * is woken and shows nothing takes the permission away.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

const ICON = '/icons/icon-192.png';

async function whatWasIt() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    const response = await fetch('/api/push/pending', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription ? subscription.endpoint : '' }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function woken() {
  const answer = await whatWasIt();
  const badge = self.navigator;
  if (answer && typeof answer.unread === 'number' && badge.setAppBadge) {
    await (answer.unread > 0 ? badge.setAppBadge(answer.unread) : badge.clearAppBadge()).catch(() => {});
  }

  const show = answer && Array.isArray(answer.show) ? answer.show : [];
  if (show.length === 0) {
    await self.registration.showNotification('Something new for you', {
      tag: 'scryproof',
      icon: ICON,
    });
    return;
  }
  for (const ping of show) {
    // The words are the server's and name nobody: "Someone messaged you".
    // One of each kind at a time: a newer one replaces it (and sounds again)
    // rather than stacking identical lines. The number on the icon counts.
    await self.registration.showNotification(ping.title, {
      tag: `scryproof-${ping.kind}`,
      renotify: true,
      icon: ICON,
      data: {
        id: ping.messageId,
        kind: ping.kind,
        serverId: ping.serverId,
        channelId: ping.channelId,
        dmId: ping.dmId,
      },
    });
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(woken());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data || null;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        if (target) open.postMessage({ type: 'scryproof-open', target });
        return;
      }
      const url = target ? `/?open=${encodeURIComponent(JSON.stringify(target))}` : '/';
      await self.clients.openWindow(url);
    })(),
  );
});
