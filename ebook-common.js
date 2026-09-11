(() => {
  const STATE_KEY = 'toeic-ebook-state-v2'
  const PAGE_SIZE = 16
  const $ = id => document.getElementById(id)

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }

  function saveState(state) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch (_) {}
  }

  function getBookState(state, bookId) {
    return ((state.books || {})[bookId] || {})
  }

  function patchBookState(state, bookId, patch) {
    state.books = state.books || {}
    state.books[bookId] = { ...(state.books[bookId] || {}), ...patch }
    saveState(state)
    return state.books[bookId]
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'\"]/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
    }[c]))
  }

  function roman(n) {
    return ['I','II','III','IV','V','VI','VII','VIII','IX'][n - 1] || String(n)
  }

  function clampChapter(book, n) {
    return Math.max(1, Math.min(book?.chapters || 1, Number(n) || 1))
  }

  function pageUrl(view, bookId) {
    const file = view === 'reader' ? 'ebook-reader.html' : 'ebook-prep.html'
    return `/${file}?book=${encodeURIComponent(bookId)}`
  }

  async function loadLibrary() {
    const res = await fetch('/data/ebooks.json?v=2', { cache: 'force-cache' })
    if (!res.ok) throw new Error('ebook library load failed')
    return res.json()
  }

  async function loadBook(bookId) {
    const library = await loadLibrary()
    const book = library.books.find(item => item.id === bookId)
    if (!book) throw new Error('book not found')
    return { library, book }
  }

  function renderBookMeta(book) {
    if ($('bookTitle')) $('bookTitle').textContent = book.title
    if ($('bookAuthor')) $('bookAuthor').textContent = book.author
    if ($('bookLevel')) $('bookLevel').textContent = book.level
    if ($('bookChapters')) $('bookChapters').textContent = `${book.chapters} Chapters`
  }

  function fillChapterSelect(select, book, chapterNo) {
    if (!select) return
    select.innerHTML = Array.from({ length: book.chapters }, (_, i) =>
      `<option value="${i + 1}">Chapter ${i + 1}</option>`
    ).join('')
    select.value = String(chapterNo)
  }

  async function getChapter(bookId, chapterNo) {
    const res = await fetch(`/api/book?book=${encodeURIComponent(bookId)}&chapter=${chapterNo}`, { cache: 'force-cache' })
    if (!res.ok) throw new Error('chapter load failed')
    return res.json()
  }

  function splitLong(text, max = 620) {
    if (text.length <= max) return [text]
    const parts = []
    let rest = text
    while (rest.length > max) {
      let cut = Math.max(
        rest.lastIndexOf(';', max),
        rest.lastIndexOf('—', max),
        rest.lastIndexOf(',', max),
        rest.lastIndexOf(' ', max)
      )
      if (cut < max * .55) cut = max
      parts.push(rest.slice(0, cut + 1).trim())
      rest = rest.slice(cut + 1).trim()
    }
    if (rest) parts.push(rest)
    return parts
  }

  function makeLines(paragraphs) {
    const out = []
    let id = 1
    const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null
    for (const paragraph of paragraphs || []) {
      const sentences = segmenter
        ? [...segmenter.segment(paragraph)].map(x => x.segment.trim()).filter(Boolean)
        : (paragraph.match(/[^.!?]+[.!?]+[\"'”’)]*|[^.!?]+$/g) || [paragraph]).map(x => x.trim()).filter(Boolean)
      for (const sentence of sentences) {
        for (const chunk of splitLong(sentence)) out.push({ id: id++, en: chunk, ko: '' })
      }
    }
    return out
  }

  function showFatal(message = 'EBOOK을 불러오지 못했습니다.') {
    document.body.innerHTML = `<div style="padding:40px 20px;font-family:sans-serif">${escapeHtml(message)}</div>`
  }

  window.EbookCommon = {
    STATE_KEY,
    PAGE_SIZE,
    $,
    loadState,
    saveState,
    getBookState,
    patchBookState,
    escapeHtml,
    roman,
    clampChapter,
    pageUrl,
    loadLibrary,
    loadBook,
    renderBookMeta,
    fillChapterSelect,
    getChapter,
    makeLines,
    showFatal
  }
})()
