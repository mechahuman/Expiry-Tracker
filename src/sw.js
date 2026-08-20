/// <reference lib="webworker" />
/**
 * Custom service worker (vite-plugin-pwa `injectManifest` mode).
 *
 * Does everything the auto-generated one did -- precache the app shell, take
 * over immediately on update -- plus the push handlers, which are the reason
 * it has to be hand-written at all.
 */
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

// Replaced at build time with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// registerType is 'autoUpdate', so a new worker should activate straight away
// rather than waiting for every tab to close.
self.skipWaiting()
clientsClaim()

const FALLBACK = {
  title: 'Expiry Tracker',
  body: 'Some items in your kitchen are expiring soon.',
}

self.addEventListener('push', (event) => {
  // A push can legitimately arrive with no body, and a malformed payload
  // shouldn't mean silence -- a generic nudge still gets the user to look.
  let payload = FALLBACK
  if (event.data) {
    try {
      payload = { ...FALLBACK, ...event.data.json() }
    } catch {
      payload = { ...FALLBACK, body: event.data.text() || FALLBACK.body }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Collapses onto any previous unread reminder instead of stacking a new
      // one every morning.
      tag: 'expiry-reminder',
      renotify: true,
      data: { url: payload.url || '/home' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/home'

  // Focus an already-open window rather than piling up new ones; only open a
  // fresh window if the app isn't running anywhere.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
