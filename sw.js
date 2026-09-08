const CACHE = 'toeic-30day-v4'
const CORE = [
  '/', '/index.html', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg',
  '/data/words-01-03.json', '/data/words-04-06.json', '/data/words-07-09.json',
  '/data/words-10-12.json', '/data/words-13-15.json', '/data/words-16-18.json',
  '/data/words-19-21.json', '/data/words-22-24.json', '/data/words-25-27.json',
  '/data/words-28-30.json'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(event.request, copy))
        }
        return response
      }).catch(() => cached || caches.match('/'))
      return cached || network
    })
  )
})
