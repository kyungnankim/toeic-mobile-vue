(() => {
  const nativeFetch = window.fetch.bind(window)
  const params = new URLSearchParams(location.search)
  const bookId = String(params.get('book') || '').toLowerCase()
  const manualByBook = new Map()
  const resolvedByBook = new Map()

  function normalizeEnglish(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9]+/g, '')
  }

  function buildIndex(entries) {
    const exact = new Map()
    const fuzzy = []
    for (const item of entries || []) {
      const key = normalizeEnglish(item.en)
      const ko = String(item.ko || '').trim()
      if (!key || !ko) continue
      exact.set(key, ko)
      if (key.length >= 10) fuzzy.push({ key, ko })
    }
    fuzzy.sort((a, b) => b.key.length - a.key.length)
    return { exact, fuzzy }
  }

  async function fetchJson(url) {
    try {
      const res = await nativeFetch(url, { cache: 'force-cache' })
      return res.ok ? await res.json() : null
    } catch (_) {
      return null
    }
  }

  async function loadManual(book, chapter) {
    const cacheKey = `${book}:${chapter}`
    if (resolvedByBook.has(cacheKey)) return resolvedByBook.get(cacheKey)
    if (manualByBook.has(cacheKey)) return manualByBook.get(cacheKey)
    const promise = (async () => {
      const base = `/data/${encodeURIComponent(book)}-ko-ch${chapter}`
      const files = [`${base}.json?v=4`, ...[1, 2, 3, 4, 5].map(n => `${base}-${n}.json?v=4`)]
      const jsons = await Promise.all(files.map(fetchJson))
      const entries = jsons.flatMap(json => Array.isArray(json?.entries) ? json.entries : [])
      const index = entries.length ? buildIndex(entries) : null
      resolvedByBook.set(cacheKey, index)
      return index
    })()
    manualByBook.set(cacheKey, promise)
    return promise
  }

  function findManual(index, text) {
    if (!index) return ''
    const key = normalizeEnglish(text)
    if (!key) return ''
    const exact = index.exact.get(key)
    if (exact) return exact

    for (const item of index.fuzzy) {
      if (key.startsWith(item.key)) return item.ko
    }
    for (const item of index.fuzzy) {
      if (key.length >= 18 && item.key.startsWith(key)) return item.ko
      if (item.key.length >= 28 && key.includes(item.key)) return item.ko
    }
    return ''
  }

  function lookup(book, chapter, text) {
    return findManual(resolvedByBook.get(`${book}:${chapter}`), text)
  }

  function currentChapter() {
    try {
      const state = JSON.parse(localStorage.getItem('toeic-ebook-state-v2') || '{}')
      return Math.max(1, Number(state?.books?.[bookId]?.chapterNo || 1))
    } catch (_) {
      return 1
    }
  }

  async function applyManualToCards() {
    if (!bookId) return
    const chapter = currentChapter()
    const index = await loadManual(bookId, chapter)
    if (!index) return
    document.querySelectorAll('#readerLines .line-card').forEach(card => {
      const en = card.querySelector('.line-en')?.textContent || ''
      const ko = findManual(index, en)
      if (!ko) return
      const target = card.querySelector('.line-ko')
      if (!target) return
      target.textContent = ko
      target.classList.remove('loading')
    })
  }

  window.__ebookManualKo = { load: loadManual, lookup, apply: applyManualToCards }

  // Chapter 1의 수동 번역 JSON은 본문 API보다 먼저 불러온다.
  if (bookId) loadManual(bookId, 1)

  // 기존 번역 호출이 발생해도 JSON에 있는 문장은 네트워크 번역을 사용하지 않는다.
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '')
    if (url.startsWith('/api/translate?')) {
      try {
        const parsed = new URL(url, location.origin)
        const text = parsed.searchParams.get('text') || ''
        const chapter = currentChapter()
        const index = await loadManual(bookId, chapter)
        const translated = findManual(index, text)
        if (translated) {
          return new Response(JSON.stringify({ translation: translated, source: 'manual-json' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' }
          })
        }
      } catch (_) {}
    }
    return nativeFetch(input, init)
  }

  // ebook.js가 문장 카드를 만든 직후 같은 프레임에서 JSON 번역으로 교체한다.
  const observer = new MutationObserver(() => { applyManualToCards() })
  const startObserver = () => {
    const reader = document.getElementById('readerLines')
    if (!reader) return
    observer.observe(reader, { childList: true, subtree: true })
    applyManualToCards()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true })
  else startObserver()

  // 로딩 문구가 한 프레임이라도 노출되지 않게 숨기고, 번역이 들어오면 정상 표시한다.
  const style = document.createElement('style')
  style.textContent = '.line-ko.loading{color:transparent!important;min-height:1.7em}.line-ko.loading::after{content:""}'
  document.head.appendChild(style)
})()
