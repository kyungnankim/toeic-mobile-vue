(() => {
  const load = src => new Promise(resolve => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = resolve
    document.head.appendChild(s)
  })
  load('/lc-player-core.js?v=1').then(() => load('/quiz-hub.js?v=1'))
})()
