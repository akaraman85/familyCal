/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

type PushPayload = {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly())
try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//, /^\/privacy(?:\.html)?\/?$/, /^\/terms(?:\.html)?\/?$/],
    }),
  )
} catch {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      denylist: [/^\/api\//, /^\/privacy(?:\.html)?\/?$/, /^\/terms(?:\.html)?\/?$/],
    }),
  )
}
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
)

self.addEventListener('push', (event) => {
  const payload = (event.data?.json() ?? {}) as PushPayload
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Karaman', {
      body: payload.body || 'Open the family calendar.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: payload.url || '/' },
      tag: payload.tag || 'karaman',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = new URL(
    String((event.notification.data as { url?: string } | undefined)?.url || '/'),
    self.location.origin,
  ).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) await client.focus()
      if ('navigate' in client) await client.navigate(targetUrl)
      return
    }
    await self.clients.openWindow(targetUrl)
  })())
})
