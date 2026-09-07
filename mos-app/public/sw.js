// The app shell's offline navigation fallback. A hard reload with no connection cannot fetch the
// document, so without this the browser shows its own dinosaur — the app disappears rather than
// saying anything. `OFFLINE_URL` is precached on install and served for any navigation the network
// refuses; it is the ONLY thing this worker caches, so a stale bundle can never be served in place
// of a fresh one.
const OFFLINE_URL = '/mos/offline.html'
const OFFLINE_CACHE = 'mos-offline-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())),
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Gordi MOS'
  const body = typeof payload.body === 'string' ? payload.body : undefined
  event.waitUntil(self.registration.showNotification(title, { body }))
})
