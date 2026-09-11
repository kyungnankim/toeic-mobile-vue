(() => {
  const C = window.EbookCommon
  if (!C) return

  const params = new URLSearchParams(location.search)
  const bookId = params.get('book')
  if (!bookId) {
    location.replace('/ebook.html')
    return
  }

  const state = C.loadState()
  let book = null
  let prepChapterNo = 1
  let examplesToken = 0
  const prepExamples = new Map()

  function bookState() {
    return C.getBookState(state, book.id)
  }

  function currentStudy() {
    return book.studyByChapter.find(x => x.chapter === prepChapterNo) || book.studyByChapter[0]
  }

  function patch(patch) {
    return C.patchBookState(state, book.id, patch)
  }

  function updateProgress() {
    const study = currentStudy()
    const bs = bookState()
    const learnedVocab = new Set((bs.learnedVocabByChapter || {})[prepChapterNo] || [])
    const learnedGrammar = new Set((bs.learnedGrammarByChapter || {})[prepChapterNo] || [])
    const total = study.vocabulary.length + study.grammar.length
    const percent = total ? Math.round((learnedVocab.size + learnedGrammar.size) / total * 100) : 0
    C.$('prepChapterProgress').textContent = `${percent}%`
  }

  function renderStudy() {
    const study = currentStudy()
    const bs = bookState()
    const learnedVocab = new Set((bs.learnedVocabByChapter || {})[prepChapterNo] || [])
    const learnedGrammar = new Set((bs.learnedGrammarByChapter || {})[prepChapterNo] || [])
    const examples = prepExamples.get(prepChapterNo) || {}

    C.$('prepChapterSelect').value = String(prepChapterNo)
    C.$('vocabCount').textContent = `${study.vocabulary.length}개`
    C.$('grammarCount').textContent = `${study.grammar.length}개`

    C.$('vocabList').innerHTML = study.vocabulary.map((v, i) => `
      <article class="vocab-item ${learnedVocab.has(i) ? 'learned' : ''}" data-vocab-item="${i}">
        <div class="vocab-top">
          <button class="vocab-word-btn" type="button" data-speak-word="${i}">
            <b>${C.escapeHtml(v.word)}</b>
            <p class="meaning">${C.escapeHtml(v.meaning)}</p>
          </button>
          <button class="vocab-done" type="button" data-vocab-done="${i}">${learnedVocab.has(i) ? '완료' : '체크'}</button>
        </div>
        ${examples[i] ? `<p class="source-example">${C.escapeHtml(examples[i])}</p>` : ''}
      </article>`).join('')

    C.$('grammarList').innerHTML = study.grammar.map((g, i) => `
      <article class="grammar-item">
        <h3>${C.escapeHtml(g.title)}</h3>
        <span class="pattern">${C.escapeHtml(g.pattern)}</span>
        <p>${C.escapeHtml(g.meaning)}</p>
        <label class="grammar-check">
          <input type="checkbox" data-grammar="${i}" ${learnedGrammar.has(i) ? 'checked' : ''}>
          이해했어요
        </label>
      </article>`).join('')

    updateProgress()
    loadExamples(prepChapterNo)
  }

  async function loadExamples(chapter) {
    if (prepExamples.has(chapter)) return
    const token = ++examplesToken
    try {
      const data = await C.getChapter(book.id, chapter)
      if (token !== examplesToken || chapter !== prepChapterNo) return
      const allLines = C.makeLines(data.paragraphs)
      const study = book.studyByChapter.find(x => x.chapter === chapter)
      const found = {}
      study.vocabulary.forEach((v, i) => {
        const needle = v.word.toLowerCase().replace(/[’']/g, '')
        const line = allLines.find(x => x.en.toLowerCase().replace(/[’']/g, '').includes(needle))
        if (line) found[i] = line.en
      })
      prepExamples.set(chapter, found)
      if (chapter === prepChapterNo) renderStudy()
    } catch (_) {}
  }

  function setChapter(next) {
    prepChapterNo = C.clampChapter(book, next)
    examplesToken++
    patch({ prepChapterNo, activeTab: 'prep' })
    renderStudy()
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function toggleVocab(index) {
    const bs = bookState()
    const map = { ...(bs.learnedVocabByChapter || {}) }
    const set = new Set(map[prepChapterNo] || [])
    set.has(index) ? set.delete(index) : set.add(index)
    map[prepChapterNo] = [...set]
    patch({ learnedVocabByChapter: map, prepChapterNo, activeTab: 'prep' })
    renderStudy()
  }

  function toggleGrammar(index, checked) {
    const bs = bookState()
    const map = { ...(bs.learnedGrammarByChapter || {}) }
    const set = new Set(map[prepChapterNo] || [])
    checked ? set.add(index) : set.delete(index)
    map[prepChapterNo] = [...set]
    patch({ learnedGrammarByChapter: map, prepChapterNo, activeTab: 'prep' })
    updateProgress()
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = .92
    speechSynthesis.speak(utterance)
  }

  function goReader() {
    patch({ activeTab: 'reader', chapterNo: prepChapterNo })
    location.href = C.pageUrl('reader', book.id)
  }

  function wire() {
    C.$('prepTab').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
    C.$('readTab').addEventListener('click', goReader)
    C.$('finishPrepBtn').addEventListener('click', goReader)

    C.$('prepChapterSelect').addEventListener('change', event => setChapter(Number(event.target.value)))
    C.$('prepPrevChapter').addEventListener('click', () => setChapter(prepChapterNo - 1))
    C.$('prepNextChapter').addEventListener('click', () => setChapter(prepChapterNo + 1))

    C.$('vocabList').addEventListener('click', event => {
      const done = event.target.closest('[data-vocab-done]')
      if (done) {
        toggleVocab(Number(done.dataset.vocabDone))
        return
      }
      const word = event.target.closest('[data-speak-word]')
      if (word) speak(currentStudy().vocabulary[Number(word.dataset.speakWord)].word)
    })

    C.$('grammarList').addEventListener('change', event => {
      const input = event.target.closest('[data-grammar]')
      if (input) toggleGrammar(Number(input.dataset.grammar), input.checked)
    })

    window.addEventListener('pagehide', () => {
      try { speechSynthesis.cancel() } catch (_) {}
    })
  }

  async function init() {
    const result = await C.loadBook(bookId)
    book = result.book
    C.renderBookMeta(book)

    const bs = bookState()
    prepChapterNo = C.clampChapter(book, bs.prepChapterNo || bs.chapterNo || 1)
    patch({ prepChapterNo, activeTab: 'prep' })

    C.fillChapterSelect(C.$('prepChapterSelect'), book, prepChapterNo)
    wire()
    renderStudy()
  }

  init().catch(error => {
    console.error(error)
    C.showFatal()
  })
})()
