(() => {
  const params = new URLSearchParams(location.search)
  const selectedBookId = params.get('book')
  const STATE_KEY = 'toeic-ebook-state-v2'
  const TRANSLATION_PREFIX = 'toeic-ebook-ko:'
  const PAGE_SIZE = 16
  const $ = id => document.getElementById(id)

  let library = null
  let book = null
  let chapterNo = 1
  let prepChapterNo = 1
  let activeTab = 'prep'
  let readMode = 'line'
  let showKorean = true
  let visibleCount = PAGE_SIZE
  let chapterData = null
  let lines = []
  let translationToken = 0
  let audioToken = 0
  let chapterAudioPlaying = false

  const chapterCache = new Map()
  const prepExamples = new Map()
  const state = loadState()

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }

  function saveState() {
    if (!book) return
    state.showKorean = showKorean
    state.books = state.books || {}
    state.books[book.id] = {
      ...(state.books[book.id] || {}),
      chapterNo,
      prepChapterNo,
      activeTab,
      readMode,
      visibleByChapter: {
        ...((state.books[book.id] || {}).visibleByChapter || {}),
        [chapterNo]: visibleCount
      }
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  }

  function bookState() {
    return ((state.books || {})[book?.id] || {})
  }

  function mutateBookState(patch) {
    state.books = state.books || {}
    state.books[book.id] = { ...(state.books[book.id] || {}), ...patch }
    saveState()
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

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))
  }

  function roman(n) {
    return ['I','II','III','IV','V','VI','VII','VIII','IX'][n - 1] || String(n)
  }

  function currentStudy() {
    return book.studyByChapter.find(x => x.chapter === prepChapterNo) || book.studyByChapter[0]
  }

  async function init() {
    const res = await fetch('/data/ebooks.json?v=2', { cache: 'force-cache' })
    if (!res.ok) throw new Error('ebook library load failed')
    library = await res.json()
    if (!selectedBookId) {
      renderLibrary()
      return
    }
    book = library.books.find(b => b.id === selectedBookId)
    if (!book) {
      renderLibrary()
      return
    }
    renderBookShell()
  }

  function renderLibrary() {
    $('libraryView').hidden = false
    $('bookView').hidden = true
    $('bookCount').textContent = `${library.books.length}권`
    $('bookList').innerHTML = library.books.map(b => `
      <a class="book-card" href="/ebook.html?book=${encodeURIComponent(b.id)}">
        <div class="cover"><span>THE GREAT</span><b>GATSBY</b><small>F. SCOTT FITZGERALD</small></div>
        <div>
          <h3>${escapeHtml(b.title)}</h3>
          <p>${escapeHtml(b.author)}</p>
          <div class="meta"><span>${b.chapters} Chapters</span><span>챕터별 학습</span><span>2가지 읽기</span></div>
        </div>
      </a>`).join('')
  }

  function renderBookShell() {
    $('libraryView').hidden = true
    $('bookView').hidden = false
    $('bookTitle').textContent = book.title
    $('bookAuthor').textContent = book.author
    $('bookLevel').textContent = book.level
    $('bookChapters').textContent = `${book.chapters} Chapters`

    const bs = bookState()
    showKorean = state.showKorean !== false
    chapterNo = clampChapter(bs.chapterNo || 1)
    prepChapterNo = clampChapter(bs.prepChapterNo || chapterNo)
    activeTab = bs.activeTab === 'reader' ? 'reader' : 'prep'
    readMode = bs.readMode === 'full' ? 'full' : 'line'
    visibleCount = Math.max(PAGE_SIZE, Number((bs.visibleByChapter || {})[chapterNo] || PAGE_SIZE))

    setupChapterSelects()
    wireBook()
    renderPrep()
    setTab(activeTab, false)
  }

  function clampChapter(n) {
    return Math.max(1, Math.min(book?.chapters || 9, Number(n) || 1))
  }

  function setupChapterSelects() {
    const options = Array.from({ length: book.chapters }, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}</option>`).join('')
    $('prepChapterSelect').innerHTML = options
    $('chapterSelect').innerHTML = options
    $('prepChapterSelect').value = String(prepChapterNo)
    $('chapterSelect').value = String(chapterNo)
  }

  function renderPrep() {
    const study = currentStudy()
    const bs = bookState()
    const learnedVocabByChapter = bs.learnedVocabByChapter || {}
    const learnedGrammarByChapter = bs.learnedGrammarByChapter || {}
    const learnedVocab = new Set(learnedVocabByChapter[prepChapterNo] || [])
    const learnedGrammar = new Set(learnedGrammarByChapter[prepChapterNo] || [])
    const examples = prepExamples.get(prepChapterNo) || {}

    $('prepChapterSelect').value = String(prepChapterNo)
    $('vocabCount').textContent = `${study.vocabulary.length}개`
    $('grammarCount').textContent = `${study.grammar.length}개`

    $('vocabList').innerHTML = study.vocabulary.map((v, i) => `
      <article class="vocab-item ${learnedVocab.has(i) ? 'learned' : ''}" data-vocab-item="${i}">
        <div class="vocab-top">
          <button class="vocab-word-btn" type="button" data-speak-word="${i}"><b>${escapeHtml(v.word)}</b><p class="meaning">${escapeHtml(v.meaning)}</p></button>
          <button class="vocab-done" type="button" data-vocab-done="${i}">${learnedVocab.has(i) ? '완료' : '체크'}</button>
        </div>
        ${examples[i] ? `<p class="source-example">${escapeHtml(examples[i])}</p>` : ''}
      </article>`).join('')

    $('grammarList').innerHTML = study.grammar.map((g, i) => `
      <article class="grammar-item">
        <h3>${escapeHtml(g.title)}</h3>
        <span class="pattern">${escapeHtml(g.pattern)}</span>
        <p>${escapeHtml(g.meaning)}</p>
        <label class="grammar-check"><input type="checkbox" data-grammar="${i}" ${learnedGrammar.has(i) ? 'checked' : ''}> 이해했어요</label>
      </article>`).join('')

    updatePrepProgress()
    loadPrepExamples(prepChapterNo)
  }

  function updatePrepProgress() {
    const study = currentStudy()
    const bs = bookState()
    const v = new Set((bs.learnedVocabByChapter || {})[prepChapterNo] || []).size
    const g = new Set((bs.learnedGrammarByChapter || {})[prepChapterNo] || []).size
    const total = study.vocabulary.length + study.grammar.length
    const pct = total ? Math.round((v + g) / total * 100) : 0
    $('prepChapterProgress').textContent = `${pct}%`
  }

  async function loadPrepExamples(ch) {
    if (prepExamples.has(ch)) return
    try {
      const data = await getChapter(ch)
      const allLines = makeLines(data.paragraphs)
      const study = book.studyByChapter.find(x => x.chapter === ch)
      const found = {}
      study.vocabulary.forEach((v, i) => {
        const needle = v.word.toLowerCase().replace(/[’']/g, '')
        const line = allLines.find(x => x.en.toLowerCase().replace(/[’']/g, '').includes(needle))
        if (line) found[i] = line.en
      })
      prepExamples.set(ch, found)
      if (prepChapterNo === ch) renderPrep()
    } catch (_) {}
  }

  function toggleVocab(idx) {
    const bs = bookState()
    const map = { ...(bs.learnedVocabByChapter || {}) }
    const set = new Set(map[prepChapterNo] || [])
    set.has(idx) ? set.delete(idx) : set.add(idx)
    map[prepChapterNo] = [...set]
    mutateBookState({ learnedVocabByChapter: map })
    renderPrep()
  }

  function toggleGrammar(idx, checked) {
    const bs = bookState()
    const map = { ...(bs.learnedGrammarByChapter || {}) }
    const set = new Set(map[prepChapterNo] || [])
    checked ? set.add(idx) : set.delete(idx)
    map[prepChapterNo] = [...set]
    mutateBookState({ learnedGrammarByChapter: map })
    updatePrepProgress()
  }

  function setPrepChapter(next) {
    prepChapterNo = clampChapter(next)
    saveState()
    renderPrep()
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function setTab(tab, persist = true) {
    activeTab = tab
    $('prepTab').classList.toggle('active', tab === 'prep')
    $('readTab').classList.toggle('active', tab === 'reader')
    $('prepPanel').hidden = tab !== 'prep'
    $('readerPanel').hidden = tab !== 'reader'
    if (persist) saveState()
    if (tab === 'reader') loadChapter()
    else stopChapterAudio()
  }

  function setReadMode(mode) {
    readMode = mode === 'full' ? 'full' : 'line'
    $('lineModeBtn').classList.toggle('active', readMode === 'line')
    $('fullModeBtn').classList.toggle('active', readMode === 'full')
    $('lineReaderView').hidden = readMode !== 'line'
    $('fullReaderView').hidden = readMode !== 'full'
    $('koreanToggle').hidden = readMode !== 'line'
    saveState()
    if (readMode === 'line' && showKorean) translateVisible()
  }

  async function getChapter(ch) {
    if (chapterCache.has(ch)) return chapterCache.get(ch)
    const promise = fetch(`/api/book?book=${encodeURIComponent(book.id)}&chapter=${ch}`, { cache: 'force-cache' })
      .then(res => {
        if (!res.ok) throw new Error('chapter load failed')
        return res.json()
      })
    chapterCache.set(ch, promise)
    try { return await promise } catch (e) { chapterCache.delete(ch); throw e }
  }

  async function loadChapter() {
    translationToken++
    stopChapterAudio()
    const token = translationToken
    $('readerPanel').classList.add('loading')
    $('readerStatus').textContent = '본문 불러오는 중...'
    try {
      chapterData = await getChapter(chapterNo)
      if (token !== translationToken) return
      lines = makeLines(chapterData.paragraphs)
      const savedVisible = Number((bookState().visibleByChapter || {})[chapterNo] || PAGE_SIZE)
      visibleCount = Math.min(lines.length, Math.max(PAGE_SIZE, savedVisible))
      $('chapterSelect').value = String(chapterNo)
      $('chapterLabel').textContent = `CHAPTER ${chapterData.roman || roman(chapterNo)}`
      $('chapterTitleDisplay').textContent = book.title
      $('readerCount').textContent = `${lines.length}문장`
      renderLines()
      renderFullEnglish()
      setReadMode(readMode)
      $('readerStatus').textContent = ''
    } catch (e) {
      console.error(e)
      $('readerStatus').textContent = '본문을 불러오지 못했습니다.'
    } finally {
      $('readerPanel').classList.remove('loading')
    }
  }

  function makeLines(paragraphs) {
    const out = []
    let id = 1
    const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter('en', { granularity: 'sentence' }) : null
    for (const p of paragraphs) {
      const sentences = segmenter
        ? [...segmenter.segment(p)].map(x => x.segment.trim()).filter(Boolean)
        : (p.match(/[^.!?]+[.!?]+[\"'”’)]*|[^.!?]+$/g) || [p]).map(x => x.trim()).filter(Boolean)
      for (const sentence of sentences) {
        for (const chunk of splitLong(sentence, 620)) {
          out.push({ id: id++, en: chunk, ko: cachedTranslation(chunk) })
        }
      }
    }
    return out
  }

  function splitLong(text, max) {
    if (text.length <= max) return [text]
    const parts = []
    let rest = text
    while (rest.length > max) {
      let cut = Math.max(rest.lastIndexOf(';', max), rest.lastIndexOf('—', max), rest.lastIndexOf(',', max), rest.lastIndexOf(' ', max))
      if (cut < max * .55) cut = max
      parts.push(rest.slice(0, cut + 1).trim())
      rest = rest.slice(cut + 1).trim()
    }
    if (rest) parts.push(rest)
    return parts
  }

  function renderLines() {
    const current = lines.slice(0, visibleCount)
    $('readerLines').innerHTML = current.map(line => `
      <article class="line-card" data-line="${line.id}">
        <div class="line-top"><span class="line-no">${String(line.id).padStart(3, '0')}</span><button class="line-speak" type="button" data-line-speak="${line.id}" aria-label="문장 듣기"><svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg></button></div>
        <p class="line-en">${escapeHtml(line.en)}</p>
        <p class="line-ko ${line.ko ? '' : 'loading'}">${line.ko ? escapeHtml(line.ko) : '해석 불러오는 중...'}</p>
      </article>`).join('')
    $('loadMoreBtn').hidden = visibleCount >= lines.length
    document.body.classList.toggle('hide-korean', !showKorean)
    $('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    if (showKorean) translateVisible()
  }

  function renderFullEnglish() {
    $('fullEnglishText').innerHTML = (chapterData?.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('')
  }

  async function translateVisible() {
    const token = translationToken
    const targets = lines.slice(0, visibleCount).filter(x => !x.ko)
    for (const line of targets) {
      if (token !== translationToken || !showKorean) return
      try {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(line.en)}`, { cache: 'force-cache' })
        if (!res.ok) continue
        const json = await res.json()
        const translated = String(json.translation || json.translatedText || json.text || '').trim()
        if (!translated) continue
        line.ko = translated
        saveTranslation(line.en, translated)
        const el = document.querySelector(`[data-line="${line.id}"] .line-ko`)
        if (el) {
          el.textContent = translated
          el.classList.remove('loading')
        }
      } catch (_) {}
    }
  }

  function toggleKorean() {
    showKorean = !showKorean
    document.body.classList.toggle('hide-korean', !showKorean)
    $('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    saveState()
    if (showKorean) translateVisible()
  }

  function setReadChapter(next) {
    chapterNo = clampChapter(next)
    visibleCount = PAGE_SIZE
    saveState()
    loadChapter()
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function speakSingle(text) {
    stopChapterAudio()
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = .92
    speechSynthesis.speak(u)
  }

  function toggleChapterAudio() {
    if (chapterAudioPlaying) {
      stopChapterAudio()
      return
    }
    if (!lines.length || !('speechSynthesis' in window)) return
    chapterAudioPlaying = true
    audioToken++
    const token = audioToken
    setAudioUi(true)
    let index = 0

    const speakNext = () => {
      if (!chapterAudioPlaying || token !== audioToken || index >= lines.length) {
        stopChapterAudio()
        return
      }
      const u = new SpeechSynthesisUtterance(lines[index].en)
      u.lang = 'en-US'
      u.rate = .92
      u.onend = () => {
        index++
        speakNext()
      }
      u.onerror = () => {
        index++
        speakNext()
      }
      speechSynthesis.speak(u)
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
    if (!$('chapterAudioBtn')) return
    $('chapterAudioBtn').classList.toggle('playing', on)
    $('chapterAudioBtn').querySelector('span').textContent = on ? '듣기 정지' : '챕터 듣기'
    $('topAudioStop').hidden = !on
  }

  function wireBook() {
    $('prepTab').addEventListener('click', () => setTab('prep'))
    $('readTab').addEventListener('click', () => setTab('reader'))

    $('prepChapterSelect').addEventListener('change', e => setPrepChapter(Number(e.target.value)))
    $('prepPrevChapter').addEventListener('click', () => setPrepChapter(prepChapterNo - 1))
    $('prepNextChapter').addEventListener('click', () => setPrepChapter(prepChapterNo + 1))

    $('vocabList').addEventListener('click', e => {
      const done = e.target.closest('[data-vocab-done]')
      if (done) {
        toggleVocab(Number(done.dataset.vocabDone))
        return
      }
      const speak = e.target.closest('[data-speak-word]')
      if (speak) {
        const idx = Number(speak.dataset.speakWord)
        speakSingle(currentStudy().vocabulary[idx].word)
      }
    })

    $('grammarList').addEventListener('change', e => {
      const input = e.target.closest('[data-grammar]')
      if (input) toggleGrammar(Number(input.dataset.grammar), input.checked)
    })

    $('finishPrepBtn').addEventListener('click', () => {
      chapterNo = prepChapterNo
      visibleCount = PAGE_SIZE
      setTab('reader')
      saveState()
      scrollTo({ top: 0, behavior: 'smooth' })
    })

    $('chapterSelect').addEventListener('change', e => setReadChapter(Number(e.target.value)))
    $('readPrevChapter').addEventListener('click', () => setReadChapter(chapterNo - 1))
    $('readNextChapter').addEventListener('click', () => setReadChapter(chapterNo + 1))

    $('lineModeBtn').addEventListener('click', () => setReadMode('line'))
    $('fullModeBtn').addEventListener('click', () => setReadMode('full'))
    $('koreanToggle').addEventListener('click', toggleKorean)
    $('chapterAudioBtn').addEventListener('click', toggleChapterAudio)
    $('topAudioStop').addEventListener('click', stopChapterAudio)

    $('loadMoreBtn').addEventListener('click', () => {
      visibleCount = Math.min(lines.length, visibleCount + PAGE_SIZE)
      saveState()
      renderLines()
    })

    $('readerLines').addEventListener('click', e => {
      const btn = e.target.closest('[data-line-speak]')
      if (!btn) return
      const line = lines.find(x => x.id === Number(btn.dataset.lineSpeak))
      if (line) speakSingle(line.en)
    })

    window.addEventListener('pagehide', stopChapterAudio)
  }

  init().catch(e => {
    console.error(e)
    document.body.innerHTML = '<div style="padding:40px 20px;font-family:sans-serif">EBOOK을 불러오지 못했습니다.</div>'
  })
})()
