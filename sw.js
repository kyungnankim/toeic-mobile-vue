const CACHE = 'toeic-30day-v14'
const CORE = [
  '/', '/index.html', '/app.js', '/style.css', '/icons.css', '/study-controls.css', '/mock-test.css', '/rc.css', '/theme-indigo.css', '/lc.css', '/lc-player.js', '/manifest.webmanifest', '/icon.svg',
  '/mock.html', '/mock.js', '/rc.html', '/rc.js',
  '/data/mock-nexus-answer-key.json', '/data/mock-test1-answer-key.json', '/data/rc-v1-answer-key.json', '/data/rc-v2-answer-key.json', '/data/rc-v1.json', '/data/rc-v2.json',
  '/data/words-01-03.json', '/data/words-04-06.json', '/data/words-07-09.json',
  '/data/words-10-12.json', '/data/words-13-15.json', '/data/words-16-18.json', '/data/words-19-21.json', '/data/words-22-24.json', '/data/words-25-27.json',
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
    fetch(event.request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(event.request, copy))
      }
      return response
    }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
  )
})
