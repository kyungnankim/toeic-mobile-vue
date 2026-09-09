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

  function buildIndex(entries) {
    const exact = new Map()
    const fuzzy = []
    for (const item of entries || []) {
      const key = normalizeEnglish(item.en)
      const ko = String(item.ko || '').trim()
      if (!key || !ko) continue
      exact.set(key, ko)
      if (key.length >= 14) fuzzy.push({ key, ko })
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
    if (manualByBook.has(cacheKey)) return manualByBook.get(cacheKey)
    const promise = (async () => {
      const base = `/data/${encodeURIComponent(book)}-ko-ch${chapter}`
      const files = [`${base}.json?v=2`, ...[1, 2, 3, 4, 5].map(n => `${base}-${n}.json?v=2`)]
      const jsons = await Promise.all(files.map(fetchJson))
      const entries = jsons.flatMap(json => Array.isArray(json?.entries) ? json.entries : [])
      return entries.length ? buildIndex(entries) : null
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
      if (key.startsWith(item.key) || (item.key.length >= 28 && key.includes(item.key))) return item.ko
    }
    return ''
  }

  if (bookId) loadManual(bookId, 1)

  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '')
    if (url.startsWith('/api/translate?')) {
      try {
        const parsed = new URL(url, location.origin)
        const text = parsed.searchParams.get('text') || ''
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
