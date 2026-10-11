'use strict';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Hintergrund-Timer zur zuverlässigen Auslösung auch bei inaktivem Tab
const activeTimers = new Map();

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === 'SCHEDULE_TIMER') {
    const { timerId, testKey, testName, aquariumId, aquariumName, waitSec, endTime, url } = data;
    const key = timerId || `${aquariumId || '0'}:${testKey}`;

    if (activeTimers.has(key)) {
      clearTimeout(activeTimers.get(key));
      activeTimers.delete(key);
    }

    const remainingMs = Math.max(0, (endTime || Date.now()) - Date.now());
    const timeoutId = setTimeout(async () => {
      activeTimers.delete(key);
      const title = `⏱️ ${testName || 'Wassertest'}: Wartezeit abgelaufen!`;
      const mins = Math.max(1, Math.round((waitSec || 60) / 60));
      const targetAq = aquariumName ? `für „${aquariumName}“ ` : '';
      const body = `Die Wartezeit (${mins} Min.) ${targetAq}ist vorbei. Bitte jetzt den Farbwert mit der Skala abgleichen!`;

      try {
        await self.registration.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/favicon-32x32.png',
          tag: `aquarium-timer-${key}`,
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 100, 250, 100, 350],
          data: { url: url || '/' }
        });
      } catch (e) {
        // Notification API im Service Worker nicht verfügbar
      }
    }, remainingMs);

    activeTimers.set(key, timeoutId);
  } else if (data.type === 'CANCEL_TIMER') {
    const { timerId, testKey, aquariumId } = data;
    const key = timerId || `${aquariumId || '0'}:${testKey}`;
    if (activeTimers.has(key)) {
      clearTimeout(activeTimers.get(key));
      activeTimers.delete(key);
    }
  } else if (data.type === 'CLEAR_ALL_TIMERS') {
    for (const [, timeoutId] of activeTimers) {
      clearTimeout(timeoutId);
    }
    activeTimers.clear();
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes('#/a/')) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
