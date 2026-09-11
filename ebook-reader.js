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
  await loadScript('/services/background-audio.js?v=1', () => !!window.BackgroundAudio)

  const { createApp, ref } = window.Vue
  const BG = window.BackgroundAudio
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
  let chapterAudioUrl = ''
  let chapterAudioKey = ''
  let preparingAudio = false

  const chapterAudio = BG.ensureAudio('ebookChapterAudio')
  const singleAudio = BG.ensureAudio('ebookSingleAudio')
  chapterAudio.playbackRate = 0.92

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

  function releaseChapterAudio() {
    chapterAudio.pause()
    chapterAudio.removeAttribute('src')
    chapterAudio.load()
    if (chapterAudioUrl) URL.revokeObjectURL(chapterAudioUrl)
    chapterAudioUrl = ''
    chapterAudioKey = ''
    audioPlaying.value = false
    C.$('topAudioStop').hidden = true
  }

  async function loadChapter() {
    const token = ++loadToken
    releaseChapterAudio()
    singleAudio.pause()
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

  function configureChapterMediaSession() {
    BG.configureMediaSession(chapterAudio, {
      title: `${book.title} · Chapter ${chapter.value}`,
      artist: book.author || 'TOEIC EBOOK',
      album: 'TOEIC EBOOK · 영어 원서 읽기',
      artwork: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }]
    }, {
      play: () => chapterAudio.play().catch(() => {}),
      pause: () => chapterAudio.pause()
    })
  }

  async function speakSingle(text) {
    releaseChapterAudio()
    singleAudio.pause()
    singleAudio.src = BG.ttsUrl(text, 'en-US')
    singleAudio.playbackRate = 0.92
    try {
      BG.configureMediaSession(singleAudio, {
        title: text,
        artist: book.title,
        album: 'TOEIC EBOOK · 문장 듣기'
      })
      await singleAudio.play()
    } catch (_) {}
  }

  async function prepareChapterTrack() {
    if (!lines.value.length) return false
    const key = `ebook:${book.id}:chapter:${chapter.value}:en:v3`
    if (chapterAudioKey === key && chapterAudio.src) return true
    if (preparingAudio) return false

    preparingAudio = true
    status.value = '백그라운드 오디오 준비 중 0%'
    try {
      const blob = await BG.buildTtsTrack({
        key,
        texts: lines.value.map(line => line.en),
        lang: 'en-US',
        maxChars: 170,
        concurrency: 6,
        onProgress: (percent, cached) => {
          status.value = cached ? '저장된 백그라운드 오디오를 불러왔습니다.' : `백그라운드 오디오 준비 중 ${percent}%`
        }
      })
      if (chapterAudioUrl) URL.revokeObjectURL(chapterAudioUrl)
      chapterAudioUrl = URL.createObjectURL(blob)
      chapterAudioKey = key
      chapterAudio.src = chapterAudioUrl
      chapterAudio.preload = 'auto'
      chapterAudio.playbackRate = 0.92
      chapterAudio.load()
      configureChapterMediaSession()
      status.value = '백그라운드 재생 준비 완료'
      return true
    } catch (error) {
      console.error(error)
      status.value = '오디오 준비에 실패했습니다. 다시 눌러주세요.'
      return false
    } finally {
      preparingAudio = false
    }
  }

  async function toggleChapterAudio() {
    if (audioPlaying.value && !chapterAudio.paused) {
      chapterAudio.pause()
      return
    }
    const ready = await prepareChapterTrack()
    if (!ready) return
    configureChapterMediaSession()
    try {
      await chapterAudio.play()
    } catch (error) {
      console.error(error)
      status.value = '재생 버튼을 한 번 더 눌러주세요.'
    }
  }

  function stopChapterAudio() {
    chapterAudio.pause()
    chapterAudio.currentTime = 0
    audioPlaying.value = false
    C.$('topAudioStop').hidden = true
    status.value = chapterAudioKey ? '백그라운드 재생 준비 완료' : ''
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' } catch (_) {}
  }

  chapterAudio.addEventListener('play', () => {
    audioPlaying.value = true
    C.$('topAudioStop').hidden = false
    status.value = '백그라운드 재생 중'
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' } catch (_) {}
  })
  chapterAudio.addEventListener('pause', () => {
    audioPlaying.value = false
    C.$('topAudioStop').hidden = true
    if (chapterAudioKey && chapterAudio.currentTime > 0 && chapterAudio.currentTime < (chapterAudio.duration || Infinity)) status.value = '일시정지 · 다시 누르면 이어서 재생'
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' } catch (_) {}
  })
  chapterAudio.addEventListener('timeupdate', () => BG.updatePosition(chapterAudio))
  chapterAudio.addEventListener('ended', () => {
    audioPlaying.value = false
    C.$('topAudioStop').hidden = true
    status.value = '챕터 듣기 완료'
  })

  function goPrep() {
    saveReaderState({ activeTab: 'prep', prepChapterNo: chapter.value })
    location.href = C.pageUrl('prep', book.id)
  }

  C.$('prepTab').addEventListener('click', goPrep)
  C.$('readTab').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  C.$('topAudioStop').addEventListener('click', stopChapterAudio)
  window.addEventListener('beforeunload', () => {
    saveReaderState()
    if (chapterAudioUrl) URL.revokeObjectURL(chapterAudioUrl)
  })

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
