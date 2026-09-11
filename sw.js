const CACHE = 'toeic-30day-v26'
const CORE = [
  '/', '/index.html', '/app.js', '/style.css', '/icons.css', '/study-controls.css', '/mock-test.css', '/rc.css', '/theme-indigo.css', '/lc.css',
  '/lc-player.js', '/lc-player-core.js', '/quiz-hub.js',
  '/components/ui/feature-card.js', '/components/home/home-feature-stack.js',
  '/components/ebook/chapter-selector.js', '/components/ebook/prep-view.js', '/components/ebook/reader-view.js',
  '/services/background-audio.js',
  '/sentences.html', '/sentences.css', '/sentences.js', '/data/lc-sentences-400.gz.b64',
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
  const url = new URL(event.request.url)

  // API/TTS 요청에는 절대로 HTML 홈 화면을 fallback으로 반환하지 않는다.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  // 문서 이동은 네트워크 우선, 오프라인일 때만 캐시된 동일 문서/홈 사용.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()))
        return response
      }).catch(async () => (await caches.match(event.request)) || (await caches.match('/')))
    )
    return
  }

  // 정적 자원은 네트워크 우선 후 정확히 같은 URL의 캐시만 사용.
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) {
        caches.open(CACHE).then(cache => cache.put(event.request, response.clone()))
      }
      return response
    }).catch(() => caches.match(event.request))
  )
})
