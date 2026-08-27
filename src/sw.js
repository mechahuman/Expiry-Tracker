/// <reference lib="webworker" />
/**
 * Custom service worker (vite-plugin-pwa `injectManifest` mode).
 *
 * Does everything the auto-generated one did -- precache the app shell, take
 * over immediately on update -- plus the push handlers, which are the reason
 * it has to be hand-written at all.
 */
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Replaced at build time with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Serve the cached app shell for any navigation, so a cold start or refresh on
// a client-side route works offline.
//
// This is doing by hand what `navigateFallback` used to do for us. That option
// only applies in generateSW mode, and Module 8 had to switch this project to
// injectManifest to get custom push handlers -- so the fallback silently
// stopped applying. index.html was still precached, but nothing mapped a
// request for /home onto it, and refreshing offline failed with the whole
// shell sitting right there in the cache.
//
// The denylist keeps the fallback away from anything that looks like a real
// file. Without it a missing asset would be answered with index.html, which
// fails in a far more confusing way than a plain 404.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/\/[^/?]+\.[^/]+$/],
  }),
)

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
