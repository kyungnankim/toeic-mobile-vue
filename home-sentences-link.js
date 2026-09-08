(() => {
  function inject() {
    if (document.querySelector('.lc400-feature')) return
    const home = document.querySelector('.home-view')
    const anchor = home?.querySelector('.lc-feature-card')
    if (!anchor) return
    const link = document.createElement('a')
    link.href = '/sentences.html'
    link.className = 'lc-feature-card lc400-feature'
    link.style.textDecoration = 'none'
    link.style.color = 'inherit'
    link.setAttribute('aria-label', '토익 LC 400문장 자동 듣기 열기')
    link.innerHTML = `
      <div class="lc-feature-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="m16 14 3 2-3 2v-4Z"/></svg>
      </div>
      <div class="lc-feature-copy">
        <b>TOEIC LC 400문장 자동 듣기</b>
        <span>40구간 · 영어 → 한국어 → 다음 문장 · 반복/다음 구간</span>
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
