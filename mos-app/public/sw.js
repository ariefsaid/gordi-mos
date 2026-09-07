// The app shell's offline navigation fallback. A hard reload with no connection cannot fetch the
// document, so without this the browser shows its own dinosaur — the app disappears rather than
// saying anything. `OFFLINE_URL` is precached on install and served for any navigation the network
// refuses; it is the ONLY thing this worker caches, so a stale bundle can never be served in place
// of a fresh one.
//
// Cache Storage is ORIGIN-scoped, and this origin hosts other apps beside `/mos`. Every touch of
// Cache Storage below is therefore scoped to this app's own prefix (`CACHE_PREFIX`): the activate
// sweep filters keys by prefix before deleting, and the fallback lookup passes `cacheName` so it
// only reads the cache this worker filled — never a same-named entry a sibling app happens to have.
const CACHE_PREFIX = 'mos-'
const OFFLINE_URL = '/mos/offline.html'
const OFFLINE_CACHE = `${CACHE_PREFIX}offline-v1`

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
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== OFFLINE_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE }).then((r) => r ?? Response.error()),
    ),
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
