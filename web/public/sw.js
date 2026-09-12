/* Practice reminders. No caching on purpose: the app must always load fresh. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || '練球', { body: d.body || '', icon: '/mark.png', badge: '/mark.png', tag: d.tag || 'practice', renotify: true, data: { url: d.url || '/practice' } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/practice'
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus() } }
    return self.clients.openWindow(url)
  }))
})
