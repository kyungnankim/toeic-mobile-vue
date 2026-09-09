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

  // 기존 /ebook.html?book=... 링크도 새 학습 페이지로 자연스럽게 이동시킨다.
  if (bookId && path.endsWith('/ebook.html')) {
    location.replace(pageUrl('prep'))
    return
  }

  if (!bookId || (!isPrepPage && !isReaderPage)) return

  const currentView = isReaderPage ? 'reader' : 'prep'
  patchBookState({ activeTab: currentView })

  // 기존 ebook.js의 같은 화면 내 패널 전환보다 먼저 잡아 실제 페이지 이동으로 처리한다.
  document.addEventListener('click', event => {
    const prepTab = event.target.closest('#prepTab')
    const readTab = event.target.closest('#readTab')
    const finishPrep = event.target.closest('#finishPrepBtn')

    if (prepTab || readTab) {
      const nextView = readTab ? 'reader' : 'prep'
      if (nextView === currentView) return
      event.preventDefault()
      event.stopImmediatePropagation()
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
