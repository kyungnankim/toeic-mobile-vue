(() => {
  const STATE_KEY = 'toeic-ebook-state-v2'
  const PAGE_SIZE = 16
  const params = new URLSearchParams(location.search)
  const bookId = params.get('book')
  const path = location.pathname
  const isPrepPage = path.endsWith('/ebook-prep.html')
  const isReaderPage = path.endsWith('/ebook-reader.html')

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }

  function patchBookState(patch) {
    if (!bookId) return
    const state = loadState()
    state.books = state.books || {}
    state.books[bookId] = { ...(state.books[bookId] || {}), ...patch }
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch (_) {}
  }

  function pageUrl(view) {
    const file = view === 'reader' ? 'ebook-reader.html' : 'ebook-prep.html'
    return `/${file}?book=${encodeURIComponent(bookId)}`
  }

  if (bookId && path.endsWith('/ebook.html')) {
    location.replace(pageUrl('prep'))
    return
  }

  if (!bookId || (!isPrepPage && !isReaderPage)) return

  const currentView = isReaderPage ? 'reader' : 'prep'
  patchBookState({ activeTab: currentView })

  let syncing = false
  function syncPageUi() {
    if (syncing) return
    const prepTab = document.getElementById('prepTab')
    const readTab = document.getElementById('readTab')
    const prepPanel = document.getElementById('prepPanel')
    const readerPanel = document.getElementById('readerPanel')
    if (!prepTab || !readTab || !prepPanel || !readerPanel) return

    syncing = true
    const prepActive = currentView === 'prep'
    prepTab.classList.toggle('active', prepActive)
    readTab.classList.toggle('active', !prepActive)

    if (prepActive) {
      prepTab.setAttribute('aria-current', 'page')
      readTab.removeAttribute('aria-current')
      prepPanel.hidden = false
      readerPanel.hidden = true
    } else {
      readTab.setAttribute('aria-current', 'page')
      prepTab.removeAttribute('aria-current')
      prepPanel.hidden = true
      readerPanel.hidden = false
    }
    document.body.dataset.ebookView = currentView
    syncing = false
  }

  syncPageUi()

  const bookView = document.getElementById('bookView') || document.body
  const observer = new MutationObserver(() => syncPageUi())
  observer.observe(bookView, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-current']
  })

  document.addEventListener('click', event => {
    const prepTab = event.target.closest('#prepTab')
    const readTab = event.target.closest('#readTab')
    const finishPrep = event.target.closest('#finishPrepBtn')

    if (prepTab || readTab) {
      const nextView = readTab ? 'reader' : 'prep'
      event.preventDefault()
      event.stopImmediatePropagation()
      if (nextView === currentView) {
        syncPageUi()
        return
      }
      patchBookState({ activeTab: nextView })
      location.href = pageUrl(nextView)
      return
    }

    if (finishPrep && isPrepPage) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const state = loadState()
      const bookState = ((state.books || {})[bookId] || {})
      const nextChapter = Number(bookState.prepChapterNo || bookState.chapterNo || 1)
      patchBookState({
        activeTab: 'reader',
        chapterNo: nextChapter,
        visibleByChapter: {
          ...(bookState.visibleByChapter || {}),
          [nextChapter]: PAGE_SIZE
        }
      })
      location.href = pageUrl('reader')
    }
  }, true)
})()
