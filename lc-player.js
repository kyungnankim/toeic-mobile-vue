(() => {
  const load = src => new Promise(resolve => {
    const existing = document.querySelector(`script[data-runtime-src="${src}"]`)
    if (existing) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.dataset.runtimeSrc = src
    s.onload = resolve
    s.onerror = resolve
    document.head.appendChild(s)
  })

  Promise.all([
    load('/lc-player-core.js?v=2'),
    load('/components/ui/feature-card.js?v=2')
  ]).then(() => Promise.all([
    load('/quiz-hub.js?v=2'),
    load('/components/home/home-feature-stack.js?v=2')
  ]))
})()
