(() => {
  function inject() {
    if (document.querySelector('.ebook-feature')) return
    const home = document.querySelector('.home-view')
    if (!home) return
    const anchor = home.querySelector('.lc400-feature') || home.querySelector('.lc-feature-card')
    if (!anchor) return

    const link = document.createElement('a')
    link.href = '/ebook.html'
    link.className = 'lc-feature-card ebook-feature'
    link.style.textDecoration = 'none'
    link.style.color = 'inherit'
    link.setAttribute('aria-label', 'TOEIC EBOOK 열기')
    link.innerHTML = `
      <div class="lc-feature-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5v-16Z"/></svg>
      </div>
      <div class="lc-feature-copy">
        <b>TOEIC EBOOK · 영어 원서 읽기</b>
        <span>책별 핵심 단어·문법 → 영어 한 줄 + 한국어 해석 · 보이기/숨기기</span>
      </div>
      <span class="lc-feature-open" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
      </span>`
    anchor.insertAdjacentElement('afterend', link)
  }

  const observer = new MutationObserver(inject)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  inject()
})()
