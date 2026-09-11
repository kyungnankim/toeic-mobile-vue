(() => {
  const C = window.EbookCommon
  if (!C) return

  const params = new URLSearchParams(location.search)
  const bookId = params.get('book')
  if (bookId) {
    location.replace(C.pageUrl('prep', bookId))
    return
  }

  async function init() {
    const library = await C.loadLibrary()
    C.$('bookCount').textContent = `${library.books.length}권`
    C.$('bookList').innerHTML = library.books.map(book => `
      <a class="book-card" href="${C.pageUrl('prep', book.id)}">
        <div class="cover"><span>THE GREAT</span><b>GATSBY</b><small>F. SCOTT FITZGERALD</small></div>
        <div>
          <h3>${C.escapeHtml(book.title)}</h3>
          <p>${C.escapeHtml(book.author)}</p>
          <div class="meta"><span>${book.chapters} Chapters</span><span>챕터별 학습</span><span>2가지 읽기</span></div>
        </div>
      </a>`).join('')
  }

  init().catch(error => {
    console.error(error)
    C.showFatal()
  })
})()
