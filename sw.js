const CACHE = 'toeic-30day-v21'
const CORE = [
  '/', '/index.html', '/app.js', '/style.css', '/icons.css', '/study-controls.css', '/mock-test.css', '/rc.css', '/theme-indigo.css', '/lc.css', '/lc-player.js', '/lc-player-core.js', '/quiz-hub.js', '/home-sentences-link.js', '/sentences.html', '/sentences.css', '/sentences.js', '/manifest.webmanifest', '/icon.svg',
  '/mock.html', '/mock.js', '/rc.html', '/rc.js',
  '/data/mock-nexus-answer-key.json', '/data/mock-test1-answer-key.json', '/data/rc-v1-answer-key.json', '/data/rc-v2-answer-key.json', '/data/rc-v1.json', '/data/rc-v2.json', '/data/lc-sentences-400.gz.b64',
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

async function enhanceHomeResponse(request) {
  const response = await fetch(request)
  if (!response.ok) return response
  const text = await response.text()
  const enhanced = text.includes('/home-sentences-link.js')
    ? text
    : text.replace('</body>', '  <script src="/home-sentences-link.js"></script>\n</body>')
  const headers = new Headers(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(enhanced, { status: response.status, statusText: response.statusText, headers })
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(
      enhanceHomeResponse(event.request).then(response => {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(event.request, copy))
        return response
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
    )
    return
  }
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
