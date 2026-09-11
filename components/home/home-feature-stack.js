(() => {
  function mount() {
    if (!window.Vue || !window.ToeicComponents?.FeatureCard) return false
    if (document.getElementById('homeFeatureStackMount')) return true

    const home = document.querySelector('.home-view')
    const anchor = home?.querySelector('.lc-feature-card')
    if (!home || !anchor) return false

    const mountPoint = document.createElement('div')
    mountPoint.id = 'homeFeatureStackMount'
    mountPoint.className = 'home-feature-stack'
    anchor.insertAdjacentElement('afterend', mountPoint)

    const { createApp } = window.Vue
    createApp({
      name: 'HomeFeatureStack',
      components: { FeatureCard: window.ToeicComponents.FeatureCard },
      template: `
        <div class="home-feature-stack-inner">
          <feature-card
            href="/sentences.html"
            icon="sentences"
            title="TOEIC LC 400문장 자동 듣기"
            description="40구간 · 영어 → 한국어 → 다음 문장 · 반복/다음 구간"
            aria-label="토익 LC 400문장 자동 듣기 열기"
          />
          <feature-card
            href="/ebook.html"
            icon="book"
            title="TOEIC EBOOK · 영어 원서 읽기"
            description="책별 핵심 단어·문법 → 영어 한 줄 + 한국어 해석 · 보이기/숨기기"
            aria-label="TOEIC EBOOK 열기"
          />
        </div>
      `
    }).mount(mountPoint)
    return true
  }

  if (mount()) return
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('DOMContentLoaded', mount, { once: true })
})()
