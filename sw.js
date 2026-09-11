const CACHE = 'toeic-30day-v25'
const CORE = [
  '/', '/index.html', '/app.js', '/style.css', '/icons.css', '/study-controls.css', '/mock-test.css', '/rc.css', '/theme-indigo.css', '/lc.css',
  '/lc-player.js', '/lc-player-core.js', '/quiz-hub.js',
  '/components/ui/feature-card.js', '/components/home/home-feature-stack.js',
  '/components/ebook/chapter-selector.js', '/components/ebook/prep-view.js', '/components/ebook/reader-view.js',
  '/sentences.html', '/sentences.css', '/sentences.js',
  '/ebook.html', '/ebook.css', '/ebook-common.js', '/ebook-prep.html', '/ebook-prep.js', '/ebook-reader.html', '/ebook-reader.js', '/ebook-ko-bootstrap.js', '/data/ebooks.json',
  '/manifest.webmanifest', '/icon.svg', '/mock.html', '/mock.js', '/rc.html', '/rc.js',
  '/data/mock-nexus-answer-key.json', '/data/mock-test1-answer-key.json', '/data/rc-v1-answer-key.json', '/data/rc-v2-answer-key.json', '/data/rc-v1.json', '/data/rc-v2.json',
  '/data/words-01-03.json', '/data/words-04-06.json', '/data/words-07-09.json', '/data/words-10-12.json', '/data/words-13-15.json',
  '/data/words-16-18.json', '/data/words-19-21.json', '/data/words-22-24.json', '/data/words-25-27.json', '/data/words-28-30.json'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  )
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
