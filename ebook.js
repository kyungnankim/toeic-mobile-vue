(() => {
  const params = new URLSearchParams(location.search)
  const selectedBookId = params.get('book')
  const STATE_KEY = 'toeic-ebook-state-v1'
  const TRANSLATION_PREFIX = 'toeic-ebook-ko:'
  const PAGE_SIZE = 18
  const $ = id => document.getElementById(id)
  let library = null
  let book = null
  let chapterData = null
  let lines = []
  let visibleCount = PAGE_SIZE
  let showKorean = true
  let chapterNo = 1
  let activeTab = 'prep'
  let translationQueueToken = 0

  const state = loadState()

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }
  function saveState() {
    const next = {
      ...state,
      showKorean,
      books: {
        ...(state.books || {}),
        ...(book ? {
          [book.id]: {
            ...((state.books || {})[book.id] || {}),
            chapterNo,
            activeTab,
            visibleCount
          }
        } : {})
      }
    }
    Object.assign(state, next)
    localStorage.setItem(STATE_KEY, JSON.stringify(next))
  }
  function bookState() {
    return ((state.books || {})[book?.id] || {})
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
    return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'; u.rate = .92
    speechSynthesis.speak(u)
  }

  async function init() {
    const res = await fetch('/data/ebooks.json', { cache: 'force-cache' })
    if (!res.ok) throw new Error('ebook library load failed')
    library = await res.json()
    if (!selectedBookId) return renderLibrary()
    book = library.books.find(b => b.id === selectedBookId)
    if (!book) return renderLibrary()
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
          <p style="margin-top:8px">${escapeHtml(b.summary)}</p>
          <div class="meta"><span>${escapeHtml(b.level)}</span><span>${b.chapters} Chapters</span><span>단어·문법·한줄 해석</span></div>
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
    $('vocabCount').textContent = `${book.study.vocabulary.length}개`
    $('grammarCount').textContent = `${book.study.grammar.length}개`

    const bs = bookState()
    showKorean = state.showKorean !== false
    chapterNo = Math.max(1, Math.min(book.chapters, Number(bs.chapterNo || 1)))
    visibleCount = Math.max(PAGE_SIZE, Number(bs.visibleCount || PAGE_SIZE))
    activeTab = bs.prepDone ? (bs.activeTab || 'reader') : 'prep'

    renderPrep()
    setupChapterSelect()
    wireBook()
    setTab(activeTab === 'reader' ? 'reader' : 'prep', false)
  }

  function renderPrep() {
    const bs = bookState()
    const learnedVocab = new Set(bs.learnedVocab || [])
    const learnedGrammar = new Set(bs.learnedGrammar || [])
    const quizAnswers = bs.quizAnswers || {}

    $('vocabList').innerHTML = book.study.vocabulary.map((v, i) => `
      <div class="vocab-item ${learnedVocab.has(i) ? 'learned' : ''}" data-vocab="${i}">
        <button type="button"><b>${escapeHtml(v.word)}</b><span>${learnedVocab.has(i) ? '학습완료' : '눌러 학습'}</span></button>
        <p>${escapeHtml(v.meaning)}</p><small>${escapeHtml(v.example)}</small>
      </div>`).join('')

    $('grammarList').innerHTML = book.study.grammar.map((g, i) => `
      <article class="grammar-item">
        <h3>${escapeHtml(g.title)}</h3>
        <span class="pattern">${escapeHtml(g.pattern)}</span>
        <p class="example">${escapeHtml(g.example)}</p>
        <p class="meaning">${escapeHtml(g.meaning)}</p>
        <label><input type="checkbox" data-grammar="${i}" ${learnedGrammar.has(i) ? 'checked' : ''}> 이해했어요</label>
      </article>`).join('')

    $('prepQuiz').innerHTML = book.study.quiz.map((q, qi) => {
      const picked = quizAnswers[qi]
      return `<div class="quiz-card"><p>${qi + 1}. ${escapeHtml(q.q)}</p><div class="quiz-choices">${q.choices.map((c, ci) => {
        let cls = ''
        if (picked !== undefined) {
          if (ci === q.answer) cls = 'correct'
          else if (ci === picked) cls = 'wrong'
        }
        return `<button type="button" data-quiz="${qi}" data-choice="${ci}" class="${cls}">${String.fromCharCode(65+ci)}. ${escapeHtml(c)}</button>`
      }).join('')}</div></div>`
    }).join('')

    updatePrepProgress()
  }

  function updatePrepProgress() {
    const bs = bookState()
    const v = new Set(bs.learnedVocab || []).size
    const g = new Set(bs.learnedGrammar || []).size
    const qa = bs.quizAnswers || {}
    const answered = Object.keys(qa).length
    const correct = Object.entries(qa).filter(([qi, choice]) => Number(choice) === book.study.quiz[Number(qi)].answer).length
    const total = book.study.vocabulary.length + book.study.grammar.length + book.study.quiz.length
    const done = v + g + answered
    const pct = Math.round(done / total * 100)
    $('prepProgressText').textContent = `${pct}%`
    $('prepProgressBar').style.width = `${pct}%`
    $('quizScore').textContent = answered ? `${correct}/${book.study.quiz.length} 정답` : `${book.study.quiz.length}문제`
    $('finishPrepBtn').textContent = bs.prepDone ? '준비 학습 완료 · 책 읽기' : '학습 완료 · 책 읽기 시작'
  }

  function mutateBookState(patch) {
    state.books = state.books || {}
    state.books[book.id] = { ...(state.books[book.id] || {}), ...patch }
    saveState()
  }

  function wireBook() {
    $('prepTab').addEventListener('click', () => setTab('prep'))
    $('readTab').addEventListener('click', () => setTab('reader'))
    $('finishPrepBtn').addEventListener('click', () => {
      mutateBookState({ prepDone: true })
      updatePrepProgress()
      setTab('reader')
      scrollTo({ top: 0, behavior: 'smooth' })
    })
    $('vocabList').addEventListener('click', e => {
      const item = e.target.closest('[data-vocab]')
      if (!item) return
      const idx = Number(item.dataset.vocab)
      const bs = bookState(); const set = new Set(bs.learnedVocab || [])
      set.has(idx) ? set.delete(idx) : set.add(idx)
      mutateBookState({ learnedVocab: [...set] })
      renderPrep()
      speak(book.study.vocabulary[idx].word)
    })
    $('grammarList').addEventListener('change', e => {
      const input = e.target.closest('[data-grammar]')
      if (!input) return
      const idx = Number(input.dataset.grammar)
      const bs = bookState(); const set = new Set(bs.learnedGrammar || [])
      input.checked ? set.add(idx) : set.delete(idx)
      mutateBookState({ learnedGrammar: [...set] })
      updatePrepProgress()
    })
    $('prepQuiz').addEventListener('click', e => {
      const btn = e.target.closest('[data-quiz]')
      if (!btn) return
      const qi = Number(btn.dataset.quiz), choice = Number(btn.dataset.choice)
      const bs = bookState(); const answers = { ...(bs.quizAnswers || {}), [qi]: choice }
      mutateBookState({ quizAnswers: answers })
      renderPrep()
    })
    $('chapterSelect').addEventListener('change', e => {
      chapterNo = Number(e.target.value)
      visibleCount = PAGE_SIZE
      saveState(); loadChapter()
    })
    $('koreanToggle').addEventListener('click', toggleKorean)
    $('koreanToggleTop').addEventListener('click', toggleKorean)
    $('loadMoreBtn').addEventListener('click', () => {
      visibleCount = Math.min(lines.length, visibleCount + PAGE_SIZE)
      saveState(); renderLines(true)
    })
  }

  function setupChapterSelect() {
    $('chapterSelect').innerHTML = Array.from({ length: book.chapters }, (_, i) => `<option value="${i+1}">Chapter ${i+1}</option>`).join('')
    $('chapterSelect').value = String(chapterNo)
  }

  function setTab(tab, persist = true) {
    activeTab = tab
    $('prepTab').classList.toggle('active', tab === 'prep')
    $('readTab').classList.toggle('active', tab === 'reader')
    $('prepPanel').hidden = tab !== 'prep'
    $('readerPanel').hidden = tab !== 'reader'
    $('koreanToggleTop').hidden = tab !== 'reader'
    if (persist) saveState()
    if (tab === 'reader' && !chapterData) loadChapter()
  }

  function toggleKorean() {
    showKorean = !showKorean
    document.body.classList.toggle('hide-korean', !showKorean)
    $('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    $('koreanToggleTop').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    saveState()
    if (showKorean) translateVisible()
  }

  async function loadChapter() {
    translationQueueToken++
    const token = translationQueueToken
    $('readerPanel').classList.add('loading')
    $('readerStatus').textContent = 'Chapter를 불러오는 중...'
    $('readerLines').innerHTML = ''
    try {
      const res = await fetch(`/api/book?book=${encodeURIComponent(book.id)}&chapter=${chapterNo}`, { cache: 'force-cache' })
      if (!res.ok) throw new Error('chapter load failed')
      chapterData = await res.json()
      lines = makeLines(chapterData.paragraphs)
      visibleCount = Math.min(Math.max(PAGE_SIZE, visibleCount), lines.length)
      $('chapterSelect').value = String(chapterNo)
      $('chapterLabel').textContent = `CHAPTER ${chapterData.roman}`
      $('chapterTitleDisplay').textContent = book.title
      renderLines(false)
      $('readerStatus').textContent = `총 ${lines.length}문장 · 영어는 즉시 표시되고 한국어 해석은 순서대로 채워집니다.`
      if (token === translationQueueToken && showKorean) translateVisible(token)
    } catch (e) {
      console.error(e)
      $('readerStatus').textContent = '본문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
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
        for (const chunk of splitLong(sentence, 620)) out.push({ id: id++, en: chunk, ko: cachedTranslation(chunk) })
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

  function renderLines(keepScroll) {
    const current = lines.slice(0, visibleCount)
    $('readerLines').innerHTML = current.map(line => `
      <article class="line-card" data-line="${line.id}">
        <span class="line-no">${String(line.id).padStart(3, '0')}</span>
        <p class="line-en">${escapeHtml(line.en)}</p>
        <p class="line-ko ${line.ko ? '' : 'loading'}">${line.ko ? escapeHtml(line.ko) : '해석 불러오는 중...'}</p>
      </article>`).join('')
    const pct = lines.length ? Math.round(visibleCount / lines.length * 100) : 0
    $('readerProgressBar').style.width = `${pct}%`
    $('readerProgressText').textContent = `${pct}%`
    $('loadMoreBtn').hidden = visibleCount >= lines.length
    document.body.classList.toggle('hide-korean', !showKorean)
    $('koreanToggle').querySelector('span').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    $('koreanToggleTop').textContent = showKorean ? '한국어 숨기기' : '한국어 보이기'
    if (showKorean) translateVisible()
  }

  async function translateOne(line, token) {
    if (line.ko) return
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(line.en)}`, { cache: 'force-cache' })
      if (!res.ok) throw new Error('translation failed')
      const json = await res.json()
      if (token !== translationQueueToken) return
      line.ko = json.translated || ''
      if (line.ko) saveTranslation(line.en, line.ko)
      const el = document.querySelector(`[data-line="${line.id}"] .line-ko`)
      if (el) {
        el.textContent = line.ko || '해석을 불러오지 못했습니다.'
        el.classList.remove('loading')
      }
    } catch (_) {
      const el = document.querySelector(`[data-line="${line.id}"] .line-ko`)
      if (el) { el.textContent = '해석을 불러오지 못했습니다. 다시 열면 재시도합니다.'; el.classList.remove('loading') }
    }
  }

  async function translateVisible(forcedToken) {
    if (!showKorean || !lines.length) return
    const token = forcedToken || translationQueueToken
    const targets = lines.slice(0, visibleCount).filter(x => !x.ko)
    if (!targets.length) return
    let cursor = 0
    const workers = Array.from({ length: Math.min(4, targets.length) }, async () => {
      while (cursor < targets.length && token === translationQueueToken) {
        const line = targets[cursor++]
        await translateOne(line, token)
      }
    })
    await Promise.all(workers)
  }

  init().catch(e => {
    console.error(e)
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">EBOOK 데이터를 불러오지 못했습니다.</div>'
  })
})()
