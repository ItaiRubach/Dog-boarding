// Shows push notifications while the app is closed, and opens the app when one is tapped.
// No caching on purpose: the app always loads the latest version.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data.json();
  } catch {
    d = { title: 'פנסיון', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'פנסיון', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag,
      lang: 'he',
      dir: 'rtl',
      data: { url: d.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) if ('focus' in w) return w.focus();
      return self.clients.openWindow(e.notification.data?.url || './');
    }),
  );
});
