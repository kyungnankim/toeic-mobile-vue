(() => {
  const nativeFetch = window.fetch.bind(window)
  const params = new URLSearchParams(location.search)
  const bookId = String(params.get('book') || '').toLowerCase()
  const manualByBook = new Map()

  function normalizeEnglish(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9]+/g, '')
  }

  function buildIndex(json) {
    const entries = Array.isArray(json?.entries) ? json.entries : []
    const exact = new Map()
    const fuzzy = []
    for (const item of entries) {
      const key = normalizeEnglish(item.en)
      const ko = String(item.ko || '').trim()
      if (!key || !ko) continue
      exact.set(key, ko)
      if (key.length >= 14) fuzzy.push({ key, ko })
    }
    fuzzy.sort((a, b) => b.key.length - a.key.length)
    return { exact, fuzzy }
  }

  async function loadManual(book, chapter) {
    const cacheKey = `${book}:${chapter}`
    if (manualByBook.has(cacheKey)) return manualByBook.get(cacheKey)
    const promise = nativeFetch(`/data/${encodeURIComponent(book)}-ko-ch${chapter}.json?v=1`, { cache: 'force-cache' })
      .then(res => res.ok ? res.json() : null)
      .then(json => json ? buildIndex(json) : null)
      .catch(() => null)
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
      if (key.startsWith(item.key) || (item.key.length >= 28 && key.includes(item.key))) return item.ko
    }
    return ''
  }

  // 가장 먼저 Chapter 1 JSON을 당겨 둔다. 다른 챕터 파일이 생기면 같은 규칙으로 자동 사용된다.
  if (bookId) loadManual(bookId, 1)

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '')
    if (url.startsWith('/api/translate?')) {
      try {
        const parsed = new URL(url, location.origin)
        const text = parsed.searchParams.get('text') || ''
        // 현재 리더 상태에 맞는 챕터를 우선 찾고, Chapter 1도 함께 확인한다.
        const state = JSON.parse(localStorage.getItem('toeic-ebook-state-v2') || '{}')
        const chapter = Number(state?.books?.[bookId]?.chapterNo || 1)
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
})()
