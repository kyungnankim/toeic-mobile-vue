(async () => {
  const C = window.EbookCommon
  if (!C) return

  const params = new URLSearchParams(location.search)
  const bookId = params.get('book')
  if (!bookId) {
    location.replace('/ebook.html')
    return
  }

  const loadScript = (src, ready) => new Promise((resolve, reject) => {
    if (ready()) return resolve()
    const existing = document.querySelector(`script[data-layer-src="${src}"]`)
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.dataset.layerSrc = src
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })

  await loadScript('https://unpkg.com/vue@3.5.13/dist/vue.global.prod.js', () => !!window.Vue)
  await loadScript('/components/ebook/chapter-selector.js?v=2', () => !!window.EbookComponents?.ChapterSelector)
  await loadScript('/components/ebook/reader-view.js?v=2', () => !!window.EbookComponents?.ReaderView)

  const { createApp, ref } = window.Vue
  const TRANSLATION_PREFIX = 'toeic-ebook-ko:'
  const state = C.loadState()
  const result = await C.loadBook(bookId)
  const book = result.book
  C.renderBookMeta(book)

  const initialBookState = C.getBookState(state, book.id)
  const chapter = ref(C.clampChapter(book, initialBookState.chapterNo || initialBookState.prepChapterNo || 1))
  const readMode = ref(initialBookState.readMode === 'full' ? 'full' : 'line')
  const showKorean = ref(state.showKorean !== false)
  const visibleCount = ref(Math.max(C.PAGE_SIZE, Number((initialBookState.visibleByChapter || {})[chapter.value] || C.PAGE_SIZE)))
  const chapterData = ref(null)
  const lines = ref([])
  const loading = ref(false)
  const status = ref('')
  const audioPlaying = ref(false)
  let loadToken = 0
  let audioToken = 0

  function bookState() { return C.getBookState(state, book.id) }
  function patch(patchValue) { return C.patchBookState(state, book.id, patchValue) }

  function hashText(s) {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0).toString(36)
  }

  function cachedTranslation(text) {
    try { return localStorage.getItem(TRANSLATION_PREFIX + hashText(text)) || '' } catch (_) { return '' }
  }

  function saveTranslation(text, translated) {
    try { localStorage.setItem(TRANSLATION_PREFIX + hashText(text), translated) } catch (_) {}
  }

  async function hydrateManualTranslations() {
    if (!window.__ebookManualKo) return
    try {
      await window.__ebookManualKo.load(book.id, chapter.value)
      lines.value = lines.value.map(line => ({
        ...line,
        ko: line.ko || window.__ebookManualKo.lookup(book.id, chapter.value, line.en) || ''
      }))
    } catch (_) {}
  }

  async function translateLine(line, token) {
    if (line.ko || token !== loadToken || !showKorean.value) return
    try {
      const manual = window.__ebookManualKo?.lookup(book.id, chapter.value, line.en) || ''
      let translated = manual
      if (!translated) {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(line.en)}`, { cache: 'force-cache' })
        if (!res.ok || token !== loadToken) return
        const json = await res.json()
        translated = String(json.translation || json.translatedText || json.text || '').trim()
      }
      if (!translated || token !== loadToken) return
      line.ko = translated
      saveTranslation(line.en, translated)
    } catch (_) {}
  }

  async function translateVisible() {
    if (!showKorean.value) return
    const token = loadToken
    const targets = lines.value.slice(0, visibleCount.value).filter(line => !line.ko)
    const workerCount = Math.min(4, targets.length)
    await Promise.all(Array.from({ length: workerCount }, async (_, workerIndex) => {
      for (let i = workerIndex; i < targets.length; i += workerCount) {
        if (token !== loadToken || !showKorean.value) return
        await translateLine(targets[i], token)
      }
    }))
  }

  function saveReaderState(extra = {}) {
    const bs = bookState()
    patch({
      activeTab: 'reader',
      chapterNo: chapter.value,
      readMode: readMode.value,
      visibleByChapter: { ...(bs.visibleByChapter || {}), [chapter.value]: visibleCount.value },
      ...extra
    })
    state.showKorean = showKorean.value
    C.saveState(state)
  }

  async function loadChapter() {
    const token = ++loadToken
    stopChapterAudio()
    loading.value = true
    status.value = '본문 불러오는 중...'
    try {
      const data = await C.getChapter(book.id, chapter.value)
      if (token !== loadToken) return
      chapterData.value = data
      lines.value = C.makeLines(data.paragraphs).map(line => ({ ...line, ko: cachedTranslation(line.en) }))
      await hydrateManualTranslations()
      if (token !== loadToken) return
      const savedVisible = Number((bookState().visibleByChapter || {})[chapter.value] || C.PAGE_SIZE)
      visibleCount.value = Math.min(lines.value.length, Math.max(C.PAGE_SIZE, savedVisible))
      status.value = ''
      if (showKorean.value) translateVisible()
    } catch (error) {
      console.error(error)
      status.value = '본문을 불러오지 못했습니다.'
    } finally {
      if (token === loadToken) loading.value = false
    }
  }

  function setChapter(next) {
    chapter.value = C.clampChapter(book, next)
    visibleCount.value = C.PAGE_SIZE
    saveReaderState()
    loadChapter()
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function setReadMode(mode) {
    readMode.value = mode === 'full' ? 'full' : 'line'
    saveReaderState()
    if (readMode.value === 'line' && showKorean.value) translateVisible()
  }

  function toggleKorean() {
    showKorean.value = !showKorean.value
    state.showKorean = showKorean.value
    C.saveState(state)
    if (showKorean.value) translateVisible()
  }

  function loadMore() {
    visibleCount.value = Math.min(lines.value.length, visibleCount.value + C.PAGE_SIZE)
    saveReaderState()
    if (showKorean.value) translateVisible()
  }

  function speakSingle(text) {
    stopChapterAudio()
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = .92
    speechSynthesis.speak(utterance)
  }

  function setAudioUi(on) {
    audioPlaying.value = on
    C.$('topAudioStop').hidden = !on
  }

  function stopChapterAudio() {
    audioToken++
    try { speechSynthesis.cancel() } catch (_) {}
    setAudioUi(false)
  }

  function toggleChapterAudio() {
    if (audioPlaying.value) return stopChapterAudio()
    if (!lines.value.length || !('speechSynthesis' in window)) return
    setAudioUi(true)
    const token = ++audioToken
    let index = 0
    speechSynthesis.cancel()

    const speakNext = () => {
      if (!audioPlaying.value || token !== audioToken || index >= lines.value.length) return stopChapterAudio()
      const utterance = new SpeechSynthesisUtterance(lines.value[index].en)
      utterance.lang = 'en-US'
      utterance.rate = .92
      utterance.onend = () => { index++; speakNext() }
      utterance.onerror = () => { index++; speakNext() }
      speechSynthesis.speak(utterance)
    }
    setTimeout(speakNext, 80)
  }

  function goPrep() {
    saveReaderState({ activeTab: 'prep', prepChapterNo: chapter.value })
    location.href = C.pageUrl('prep', book.id)
  }

  C.$('prepTab').addEventListener('click', goPrep)
  C.$('readTab').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  C.$('topAudioStop').addEventListener('click', stopChapterAudio)
  window.addEventListener('pagehide', stopChapterAudio)

  patch({ activeTab: 'reader', chapterNo: chapter.value })

  createApp({
    name: 'EbookReaderPage',
    components: { ReaderView: window.EbookComponents.ReaderView },
    setup() {
      return {
        book, chapter, chapterData, lines, visibleCount, readMode, showKorean, audioPlaying, loading, status,
        setChapter, setReadMode, toggleKorean, toggleChapterAudio, loadMore, speakSingle
      }
    },
    template: `
      <reader-view
        :book="book"
        :chapter="chapter"
        :chapter-data="chapterData"
        :lines="lines"
        :visible-count="visibleCount"
        :read-mode="readMode"
        :show-korean="showKorean"
        :audio-playing="audioPlaying"
        :loading="loading"
        :status="status"
        @change-chapter="setChapter"
        @set-mode="setReadMode"
        @toggle-korean="toggleKorean"
        @toggle-audio="toggleChapterAudio"
        @load-more="loadMore"
        @speak="speakSingle"
      />
    `
  }).mount('#readerPanel')

  await loadChapter()
})().catch(error => {
  console.error(error)
  window.EbookCommon?.showFatal?.()
})
