(() => {
  const C = window.EbookCommon
  if (!C) return

  const params = new URLSearchParams(location.search)
  const bookId = params.get('book')
  if (!bookId) {
    location.replace('/ebook.html')
    return
  }

  const TRANSLATION_PREFIX = 'toeic-ebook-ko:'
  const state = C.loadState()
  let book = null
  let chapterNo = 1
  let readMode = 'line'
  let showKorean = true
  let visibleCount = C.PAGE_SIZE
  let chapterData = null
  let lines = []
  let loadToken = 0
  let audioToken = 0
  let chapterAudioPlaying = false

  function bookState() {
    return C.getBookState(state, book.id)
  }

  function patch(patch) {
    return C.patchBookState(state, book.id, patch)
  }

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
      await window.__ebookManualKo.load(book.id, chapterNo)
      for (const line of lines) {
        if (!line.ko) line.ko = window.__ebookManualKo.lookup(book.id, chapterNo, line.en) || ''
      }
    } catch (_) {}
  }

  function renderLines() {
    const current = lines.slice(0, visibleCount)
    C.$('readerLines').innerHTML = current.map(line => `
      <article class="line-card" data-line="${line.id}">
        <div class="line-top">
          <span class="line-no">${String(line.id).padStart(3, '0')}</span>
          <button class="line-speak" type="button" data-line-speak="${line.id}" aria-label="문장 듣기">
            <svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          </button>
        </div>
        <p class="line-en">${C.escapeHtml(line.en)}</p>
        <p class="line-ko ${line.ko ? '' : 'loading'}">${line.ko ? C.escapeHtml(line.ko) : ''}</p>
      </article>`).join('')

    C.$('loadMoreBtn').hidden = visibleCount >= lines.length
    document.body.classList.toggle('hide-korean', !showKorean)
    C.$('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'

    if (showKorean) translateVisible()
  }

  function renderFullEnglish() {
    C.$('fullEnglishText').innerHTML = (chapterData?.paragraphs || []).map(p => `<p>${C.escapeHtml(p)}</p>`).join('')
  }

  async function translateLine(line, token) {
    if (line.ko || token !== loadToken || !showKorean) return
    try {
      const manual = window.__ebookManualKo?.lookup(book.id, chapterNo, line.en) || ''
      if (manual) {
        line.ko = manual
      } else {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(line.en)}`, { cache: 'force-cache' })
        if (!res.ok || token !== loadToken) return
        const json = await res.json()
        line.ko = String(json.translation || json.translatedText || json.text || '').trim()
      }
      if (!line.ko) return
      saveTranslation(line.en, line.ko)
      const el = document.querySelector(`[data-line="${line.id}"] .line-ko`)
      if (el) {
        el.textContent = line.ko
        el.classList.remove('loading')
      }
    } catch (_) {
      const el = document.querySelector(`[data-line="${line.id}"] .line-ko`)
      if (el) el.classList.remove('loading')
    }
  }

  async function translateVisible() {
    const token = loadToken
    const targets = lines.slice(0, visibleCount).filter(line => !line.ko)
    const workers = Array.from({ length: Math.min(4, targets.length) }, async (_, workerIndex) => {
      for (let i = workerIndex; i < targets.length; i += 4) {
        if (token !== loadToken || !showKorean) return
        await translateLine(targets[i], token)
      }
    })
    await Promise.all(workers)
  }

  function applyReadMode() {
    readMode = readMode === 'full' ? 'full' : 'line'
    C.$('lineModeBtn').classList.toggle('active', readMode === 'line')
    C.$('fullModeBtn').classList.toggle('active', readMode === 'full')
    C.$('lineReaderView').hidden = readMode !== 'line'
    C.$('fullReaderView').hidden = readMode !== 'full'
    C.$('koreanToggle').hidden = readMode !== 'line'
    patch({ activeTab: 'reader', chapterNo, readMode })
  }

  function setReadMode(mode) {
    readMode = mode === 'full' ? 'full' : 'line'
    applyReadMode()
    if (readMode === 'line' && showKorean) translateVisible()
  }

  async function loadChapter() {
    const token = ++loadToken
    stopChapterAudio()
    C.$('readerPanel').classList.add('loading')
    C.$('readerStatus').textContent = '본문 불러오는 중...'

    try {
      chapterData = await C.getChapter(book.id, chapterNo)
      if (token !== loadToken) return

      lines = C.makeLines(chapterData.paragraphs).map(line => ({
        ...line,
        ko: cachedTranslation(line.en)
      }))

      await hydrateManualTranslations()
      if (token !== loadToken) return

      const savedVisible = Number((bookState().visibleByChapter || {})[chapterNo] || C.PAGE_SIZE)
      visibleCount = Math.min(lines.length, Math.max(C.PAGE_SIZE, savedVisible))

      C.$('chapterSelect').value = String(chapterNo)
      C.$('chapterLabel').textContent = `CHAPTER ${chapterData.roman || C.roman(chapterNo)}`
      C.$('chapterTitleDisplay').textContent = book.title
      C.$('readerCount').textContent = `${lines.length}문장`

      renderLines()
      renderFullEnglish()
      applyReadMode()
      C.$('readerStatus').textContent = ''
    } catch (error) {
      console.error(error)
      C.$('readerStatus').textContent = '본문을 불러오지 못했습니다.'
    } finally {
      if (token === loadToken) C.$('readerPanel').classList.remove('loading')
    }
  }

  function saveReaderState(extra = {}) {
    const bs = bookState()
    patch({
      activeTab: 'reader',
      chapterNo,
      readMode,
      visibleByChapter: {
        ...(bs.visibleByChapter || {}),
        [chapterNo]: visibleCount
      },
      ...extra
    })
    state.showKorean = showKorean
    C.saveState(state)
  }

  function setChapter(next) {
    chapterNo = C.clampChapter(book, next)
    visibleCount = C.PAGE_SIZE
    saveReaderState()
    loadChapter()
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function toggleKorean() {
    showKorean = !showKorean
    document.body.classList.toggle('hide-korean', !showKorean)
    C.$('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    state.showKorean = showKorean
    C.saveState(state)
    if (showKorean) translateVisible()
  }

  function speakSingle(text) {
    stopChapterAudio()
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = .92
    speechSynthesis.speak(utterance)
  }

  function toggleChapterAudio() {
    if (chapterAudioPlaying) {
      stopChapterAudio()
      return
    }
    if (!lines.length || !('speechSynthesis' in window)) return

    chapterAudioPlaying = true
    const token = ++audioToken
    setAudioUi(true)
    let index = 0

    const speakNext = () => {
      if (!chapterAudioPlaying || token !== audioToken || index >= lines.length) {
        stopChapterAudio()
        return
      }
      const utterance = new SpeechSynthesisUtterance(lines[index].en)
      utterance.lang = 'en-US'
      utterance.rate = .92
      utterance.onend = () => { index++; speakNext() }
      utterance.onerror = () => { index++; speakNext() }
      speechSynthesis.speak(utterance)
    }

    speechSynthesis.cancel()
    setTimeout(speakNext, 80)
  }

  function stopChapterAudio() {
    audioToken++
    chapterAudioPlaying = false
    try { speechSynthesis.cancel() } catch (_) {}
    setAudioUi(false)
  }

  function setAudioUi(on) {
    C.$('chapterAudioBtn').classList.toggle('playing', on)
    C.$('chapterAudioBtn').querySelector('span').textContent = on ? '듣기 정지' : '챕터 듣기'
    C.$('topAudioStop').hidden = !on
  }

  function goPrep() {
    saveReaderState({ activeTab: 'prep', prepChapterNo: chapterNo })
    location.href = C.pageUrl('prep', book.id)
  }

  function wire() {
    C.$('prepTab').addEventListener('click', goPrep)
    C.$('readTab').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))

    C.$('chapterSelect').addEventListener('change', event => setChapter(Number(event.target.value)))
    C.$('readPrevChapter').addEventListener('click', () => setChapter(chapterNo - 1))
    C.$('readNextChapter').addEventListener('click', () => setChapter(chapterNo + 1))

    C.$('lineModeBtn').addEventListener('click', () => setReadMode('line'))
    C.$('fullModeBtn').addEventListener('click', () => setReadMode('full'))
    C.$('koreanToggle').addEventListener('click', toggleKorean)
    C.$('chapterAudioBtn').addEventListener('click', toggleChapterAudio)
    C.$('topAudioStop').addEventListener('click', stopChapterAudio)

    C.$('loadMoreBtn').addEventListener('click', () => {
      visibleCount = Math.min(lines.length, visibleCount + C.PAGE_SIZE)
      saveReaderState()
      renderLines()
    })

    C.$('readerLines').addEventListener('click', event => {
      const button = event.target.closest('[data-line-speak]')
      if (!button) return
      const line = lines.find(item => item.id === Number(button.dataset.lineSpeak))
      if (line) speakSingle(line.en)
    })

    window.addEventListener('pagehide', stopChapterAudio)
  }

  async function init() {
    const result = await C.loadBook(bookId)
    book = result.book
    C.renderBookMeta(book)

    const bs = bookState()
    chapterNo = C.clampChapter(book, bs.chapterNo || bs.prepChapterNo || 1)
    readMode = bs.readMode === 'full' ? 'full' : 'line'
    showKorean = state.showKorean !== false
    visibleCount = Math.max(C.PAGE_SIZE, Number((bs.visibleByChapter || {})[chapterNo] || C.PAGE_SIZE))

    patch({ activeTab: 'reader', chapterNo })
    C.fillChapterSelect(C.$('chapterSelect'), book, chapterNo)
    wire()
    await loadChapter()
  }

  init().catch(error => {
    console.error(error)
    C.showFatal()
  })
})()
