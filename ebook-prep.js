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
  await loadScript('/components/ebook/prep-view.js?v=2', () => !!window.EbookComponents?.PrepView)

  const { createApp, ref, computed, reactive } = window.Vue
  const state = C.loadState()
  const result = await C.loadBook(bookId)
  const book = result.book
  C.renderBookMeta(book)

  const initialBookState = C.getBookState(state, book.id)
  const chapter = ref(C.clampChapter(book, initialBookState.prepChapterNo || initialBookState.chapterNo || 1))
  const learnedVocab = ref([])
  const learnedGrammar = ref([])
  const examplesByChapter = reactive({})
  let examplesToken = 0

  function bookState() {
    return C.getBookState(state, book.id)
  }

  function patch(patchValue) {
    return C.patchBookState(state, book.id, patchValue)
  }

  function syncLearned() {
    const bs = bookState()
    learnedVocab.value = [...((bs.learnedVocabByChapter || {})[chapter.value] || [])]
    learnedGrammar.value = [...((bs.learnedGrammarByChapter || {})[chapter.value] || [])]
  }

  const study = computed(() => book.studyByChapter.find(x => x.chapter === chapter.value) || book.studyByChapter[0])
  const examples = computed(() => examplesByChapter[chapter.value] || {})
  const progress = computed(() => {
    const total = study.value.vocabulary.length + study.value.grammar.length
    return total ? Math.round((learnedVocab.value.length + learnedGrammar.value.length) / total * 100) : 0
  })

  async function loadExamples(chapterNo) {
    if (examplesByChapter[chapterNo]) return
    const token = ++examplesToken
    try {
      const data = await C.getChapter(book.id, chapterNo)
      if (token !== examplesToken || chapterNo !== chapter.value) return
      const allLines = C.makeLines(data.paragraphs)
      const current = book.studyByChapter.find(x => x.chapter === chapterNo)
      const found = {}
      current.vocabulary.forEach((v, i) => {
        const needle = v.word.toLowerCase().replace(/[’']/g, '')
        const line = allLines.find(x => x.en.toLowerCase().replace(/[’']/g, '').includes(needle))
        if (line) found[i] = line.en
      })
      examplesByChapter[chapterNo] = found
    } catch (_) {}
  }

  function setChapter(next) {
    chapter.value = C.clampChapter(book, next)
    examplesToken++
    patch({ prepChapterNo: chapter.value, activeTab: 'prep' })
    syncLearned()
    loadExamples(chapter.value)
    scrollTo({ top: Math.max(0, document.querySelector('.book-tabs').offsetTop - 90), behavior: 'smooth' })
  }

  function toggleVocab(index) {
    const bs = bookState()
    const map = { ...(bs.learnedVocabByChapter || {}) }
    const set = new Set(map[chapter.value] || [])
    set.has(index) ? set.delete(index) : set.add(index)
    map[chapter.value] = [...set]
    patch({ learnedVocabByChapter: map, prepChapterNo: chapter.value, activeTab: 'prep' })
    syncLearned()
  }

  function toggleGrammar(index, checked) {
    const bs = bookState()
    const map = { ...(bs.learnedGrammarByChapter || {}) }
    const set = new Set(map[chapter.value] || [])
    checked ? set.add(index) : set.delete(index)
    map[chapter.value] = [...set]
    patch({ learnedGrammarByChapter: map, prepChapterNo: chapter.value, activeTab: 'prep' })
    syncLearned()
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
    patch({ activeTab: 'reader', chapterNo: chapter.value })
    location.href = C.pageUrl('reader', book.id)
  }

  C.$('prepTab').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  C.$('readTab').addEventListener('click', goReader)
  window.addEventListener('pagehide', () => { try { speechSynthesis.cancel() } catch (_) {} })

  syncLearned()
  patch({ prepChapterNo: chapter.value, activeTab: 'prep' })
  loadExamples(chapter.value)

  createApp({
    name: 'EbookPrepPage',
    components: { PrepView: window.EbookComponents.PrepView },
    setup() {
      return { book, chapter, study, learnedVocab, learnedGrammar, examples, progress, setChapter, toggleVocab, toggleGrammar, speak, goReader }
    },
    template: `
      <prep-view
        :book="book"
        :chapter="chapter"
        :study="study"
        :learned-vocab="learnedVocab"
        :learned-grammar="learnedGrammar"
        :examples="examples"
        :progress="progress"
        @change-chapter="setChapter"
        @toggle-vocab="toggleVocab"
        @toggle-grammar="toggleGrammar"
        @speak="speak"
        @go-reader="goReader"
      />
    `
  }).mount('#prepPanel')
})().catch(error => {
  console.error(error)
  window.EbookCommon?.showFatal?.()
})
