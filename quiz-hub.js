(() => {
  const ROOT_ID = 'toeicQuizHub'
  const STATE_KEY = 'toeic-quiz-hub-v1'
  const DATA_FILES = [
    '/data/words-01-03.json','/data/words-04-06.json','/data/words-07-09.json','/data/words-10-12.json','/data/words-13-15.json',
    '/data/words-16-18.json','/data/words-19-21.json','/data/words-22-24.json','/data/words-25-27.json','/data/words-28-30.json'
  ]
  let words = []
  let sections = []
  let session = null
  let loading = null

  const svg = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    all: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/><path d="M8 3v4M16 10v4M11 17v4"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
  }

  function injectStyle() {
    if (document.getElementById('qhStyle')) return
    const style = document.createElement('style')
    style.id = 'qhStyle'
    style.textContent = `
      #${ROOT_ID}{position:fixed;inset:0;z-index:10050;background:#f7f8ff;color:#111827;font-family:inherit;overflow:auto;-webkit-overflow-scrolling:touch}
      #${ROOT_ID}[hidden]{display:none!important}#${ROOT_ID} *{box-sizing:border-box}#${ROOT_ID} button{font:inherit}
      .qh-shell{max-width:900px;min-height:100%;margin:0 auto;padding-bottom:36px;background:#f7f8ff}
      .qh-top{position:sticky;top:0;z-index:4;height:82px;padding:13px 18px;display:grid;grid-template-columns:54px 1fr 54px;align-items:center;gap:10px;background:rgba(247,248,255,.96);border-bottom:1px solid #e4e7f1;backdrop-filter:blur(12px)}
      .qh-back,.qh-sound{width:52px;height:52px;border-radius:17px;border:1px solid #dfe3ee;background:#fff;display:grid;place-items:center;color:#27324a}
      .qh-back svg,.qh-sound svg,.qh-hero-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
      .qh-top-title{text-align:center;min-width:0}.qh-top-title b{display:block;font-size:20px;line-height:1.2}.qh-top-title span{display:block;margin-top:4px;font-size:13px;color:#8b97ac}
      .qh-main{padding:22px 18px 28px}.qh-eyebrow{margin:0 0 8px;color:#4f46e5;font-size:13px;font-weight:900;letter-spacing:.12em}.qh-title{margin:0;font-size:28px;line-height:1.22;letter-spacing:-.035em}.qh-desc{margin:10px 0 0;color:#64748b;font-size:15px;line-height:1.55}
      .qh-all-card{width:100%;margin:22px 0 26px;padding:22px;border:0;border-radius:24px;text-align:left;color:#fff;background:linear-gradient(140deg,#172033,#3730a3);display:grid;grid-template-columns:58px 1fr auto;align-items:center;gap:16px;box-shadow:0 16px 34px rgba(49,46,129,.16)}
      .qh-hero-icon{width:58px;height:58px;border-radius:18px;background:rgba(255,255,255,.13);display:grid;place-items:center}.qh-hero-icon svg{width:29px;height:29px}
      .qh-all-card b{display:block;font-size:20px}.qh-all-card span{display:block;margin-top:6px;color:#d8dcff;font-size:13px;line-height:1.45}.qh-all-card strong{font-size:13px;background:#fff;color:#3730a3;padding:10px 12px;border-radius:12px;white-space:nowrap}
      .qh-section-head{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:12px}.qh-section-head h2{margin:0;font-size:21px}.qh-section-head span{font-size:12px;color:#94a3b8}
      .qh-day-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.qh-day{min-height:118px;padding:16px;border:1px solid #e0e4ef;border-radius:20px;background:#fff;text-align:left;color:#111827}.qh-day-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.qh-day-head b{font-size:13px;color:#475569}.qh-day-head span{font-size:12px;color:#4f46e5;font-weight:900}.qh-day h3{margin:16px 0 8px;font-size:18px;line-height:1.25;letter-spacing:-.02em}.qh-day small{font-size:12px;color:#94a3b8}
      .qh-question-wrap{padding:20px 18px 34px}.qh-progress-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#64748b}.qh-progress-row b{color:#4f46e5;font-size:14px}.qh-progress{height:7px;margin:10px 0 18px;border-radius:99px;background:#e8ebf4;overflow:hidden}.qh-progress i{display:block;height:100%;background:#6366f1;border-radius:inherit;transition:width .2s ease}
      .qh-qcard{padding:26px 22px 22px;border:1px solid #e2e6ef;border-radius:28px;background:#fff;box-shadow:0 16px 40px rgba(30,41,59,.06)}
      .qh-word-row{display:flex;flex-direction:column;align-items:center;padding:8px 0 24px}.qh-sound{color:#4f46e5;background:#eef2ff;border-color:#d9def8}.qh-word{margin:18px 0 0;font-size:clamp(40px,10vw,58px);line-height:1.04;letter-spacing:-.045em;text-align:center;overflow-wrap:anywhere}.qh-prompt{margin:8px 0 0;color:#8190a7;font-size:14px;font-weight:750}
      .qh-options{display:grid;gap:11px}.qh-option{width:100%;min-height:72px;padding:13px 16px;border:1px solid #dfe3eb;border-radius:18px;background:#fafbfe;color:#263247;display:grid;grid-template-columns:48px 1fr;align-items:center;gap:13px;text-align:left;font-size:17px;line-height:1.35}.qh-letter{width:44px;height:44px;border-radius:13px;background:#fff;border:1px solid #dde2eb;display:grid;place-items:center;font-size:13px;font-weight:850;color:#596579}.qh-option.correct{border-color:#8b86f5;background:#eeedff;color:#312e81}.qh-option.correct .qh-letter{border-color:#a5a1ff;color:#4338ca}.qh-option.wrong{border-color:#f1b7c1;background:#fff2f4;color:#9f1239}.qh-option:disabled{opacity:1}
      .qh-feedback{margin-top:16px;padding:16px 17px;border-radius:17px;background:#f4f3ff;color:#3730a3;font-size:15px;line-height:1.45}.qh-feedback.wrong{background:#fff1f3;color:#9f1239}.qh-feedback b{font-size:16px}.qh-next{width:100%;min-height:56px;margin-top:12px;border:0;border-radius:17px;background:#6366f1;color:#fff;font-size:17px;font-weight:850}
      .qh-result{padding:34px 22px;text-align:center}.qh-score-ring{width:132px;height:132px;margin:8px auto 20px;border-radius:50%;display:grid;place-items:center;background:#eef2ff;border:10px solid #dfe4ff}.qh-score-ring b{font-size:34px;color:#4338ca}.qh-result h2{font-size:27px;margin:0}.qh-result p{font-size:15px;color:#64748b;line-height:1.5}.qh-result-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}.qh-result-actions button{min-height:54px;border-radius:16px;font-weight:850;font-size:15px}.qh-secondary{border:1px solid #dfe3eb;background:#fff;color:#334155}.qh-primary{border:0;background:#6366f1;color:#fff}
      @media(max-width:620px){.qh-day-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.qh-all-card{grid-template-columns:52px 1fr}.qh-all-card strong{grid-column:1/-1;text-align:center}.qh-main{padding-left:16px;padding-right:16px}.qh-question-wrap{padding-left:14px;padding-right:14px}.qh-qcard{padding:22px 16px}.qh-option{font-size:16px;grid-template-columns:46px 1fr}.qh-title{font-size:26px}}
      @media(max-width:360px){.qh-day-grid{grid-template-columns:1fr}.qh-top{padding-left:12px;padding-right:12px}.qh-result-actions{grid-template-columns:1fr}}
    `
    document.head.appendChild(style)
  }

  function shuffle(list) {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  async function loadWords() {
    if (words.length) return
    if (loading) return loading
    loading = (async () => {
      const responses = await Promise.all(DATA_FILES.map(p => fetch(p, { cache: 'force-cache' })))
      if (responses.some(r => !r.ok)) throw new Error('단어 데이터 로딩 실패')
      const groups = (await Promise.all(responses.map(r => r.json()))).flat()
      let id = 1
      words = groups.flatMap(group => group.words.map(([word, meaning], index) => ({ id:id++, day:group.day, topic:group.topic, number:index+1, word, meaning })))
      sections = groups.map(group => ({ day:group.day, topic:group.topic, count:group.words.length }))
    })()
    return loading
  }

  function makeRoot() {
    let root = document.getElementById(ROOT_ID)
    if (!root) {
      root = document.createElement('div')
      root.id = ROOT_ID
      root.hidden = true
      document.body.appendChild(root)
    }
    return root
  }

  function saveSession() {
    if (!session) { localStorage.removeItem(STATE_KEY); return }
    try { localStorage.setItem(STATE_KEY, JSON.stringify(session)) } catch (_) {}
  }

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
      if (!s || !Array.isArray(s.order)) return null
      return s
    } catch (_) { return null }
  }

  function setHash(value) {
    if (location.hash !== value) history.replaceState(null, '', `${location.pathname}${location.search}${value}`)
  }

  function openRoot() {
    const root = makeRoot(); root.hidden = false; document.body.style.overflow = 'hidden'
  }
  function closeRoot() {
    const root = makeRoot(); root.hidden = true; document.body.style.overflow = ''
    setHash('#home')
    const home = document.querySelector('.bottom-nav button:first-child') || document.querySelector('.brand')
    if (home) setTimeout(() => home.click(), 0)
  }

  async function openHub() {
    injectStyle(); openRoot(); setHash('#quiz-hub')
    const root = makeRoot()
    root.innerHTML = `<div class="qh-shell"><header class="qh-top"><button class="qh-back" id="qhClose">${svg.back}</button><div class="qh-top-title"><b>단어 퀴즈</b><span>전체 · DAY 1–30</span></div><div></div></header><main class="qh-main"><p class="qh-eyebrow">QUIZ</p><h1 class="qh-title">어떤 범위로 풀까요?</h1><p class="qh-desc">전체 단어에서는 30문제를 랜덤으로, DAY별 퀴즈에서는 그날의 모든 단어를 섞어서 출제합니다.</p><div id="qhLoading" style="padding:50px 0;text-align:center;color:#94a3b8;font-size:15px">단어를 불러오는 중…</div></main></div>`
    root.querySelector('#qhClose').addEventListener('click', closeRoot)
    try {
      await loadWords()
      renderHub()
    } catch (e) {
      root.querySelector('#qhLoading').textContent = '단어 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'
    }
  }

  function renderHub() {
    const root = makeRoot()
    root.innerHTML = `<div class="qh-shell">
      <header class="qh-top"><button class="qh-back" id="qhClose">${svg.back}</button><div class="qh-top-title"><b>단어 퀴즈</b><span>전체 · DAY 1–30</span></div><div></div></header>
      <main class="qh-main">
        <p class="qh-eyebrow">QUIZ RANGE</p><h1 class="qh-title">전체 또는 DAY별로 선택</h1><p class="qh-desc">DAY 1에 고정되지 않습니다. 원하는 날짜를 누르면 그 DAY 단어만 출제됩니다.</p>
        <button class="qh-all-card" id="qhAll"><span class="qh-hero-icon">${svg.all}</span><span><b>전체 단어 퀴즈</b><span>2,078개 전체 단어에서 매번 새로운 30문제 랜덤 출제</span></span><strong>30문제 시작</strong></button>
        <div class="qh-section-head"><h2>DAY별 퀴즈</h2><span>DAY 전체 단어 출제</span></div>
        <div class="qh-day-grid">${sections.map(s => `<button class="qh-day" data-day="${s.day}"><div class="qh-day-head"><b>DAY ${s.day}</b><span>${s.count}문제</span></div><h3>${escapeHtml(s.topic)}</h3><small>${s.count}개 단어 전체를 섞어서 출제</small></button>`).join('')}</div>
      </main></div>`
    root.querySelector('#qhClose').addEventListener('click', closeRoot)
    root.querySelector('#qhAll').addEventListener('click', () => startSession('all'))
    root.querySelectorAll('.qh-day').forEach(btn => btn.addEventListener('click', () => startSession('day', Number(btn.dataset.day))))
  }

  function startSession(scope, day = null) {
    const pool = scope === 'day' ? words.filter(w => w.day === day) : words
    const picked = scope === 'day' ? shuffle(pool) : shuffle(pool).slice(0, 30)
    session = { scope, day, order:picked.map(w => w.id), pos:0, correct:0, wrong:[], answered:null, startedAt:Date.now() }
    saveSession(); setHash('#quiz-play'); renderQuestion()
  }

  function currentItem() {
    return session ? words.find(w => w.id === session.order[session.pos]) : null
  }

  function makeOptions(item) {
    const pool = session.scope === 'day' ? words.filter(w => w.day === session.day) : words
    const distractors = shuffle(pool.filter(w => w.id !== item.id && w.meaning !== item.meaning)).slice(0, 3)
    return shuffle([item, ...distractors]).map(w => ({ id:w.id, meaning:w.meaning }))
  }

  function renderQuestion() {
    openRoot()
    const item = currentItem()
    if (!item) return renderResult()
    if (!session.options || session.optionFor !== item.id) {
      session.options = makeOptions(item)
      session.optionFor = item.id
      session.answered = null
      saveSession()
    }
    const total = session.order.length
    const scopeText = session.scope === 'day' ? `DAY ${session.day} 퀴즈` : '전체 단어 퀴즈'
    const pct = Math.round((session.pos / total) * 100)
    const root = makeRoot()
    root.innerHTML = `<div class="qh-shell">
      <header class="qh-top"><button class="qh-back" id="qhBackHub">${svg.back}</button><div class="qh-top-title"><b>${scopeText}</b><span>뜻을 골라보세요</span></div><div class="qh-top-title"><b>${session.correct}</b><span>정답</span></div></header>
      <main class="qh-question-wrap">
        <div class="qh-progress-row"><span>${session.pos + 1} / ${total}</span><b>${pct}%</b></div><div class="qh-progress"><i style="width:${pct}%"></i></div>
        <section class="qh-qcard">
          <div class="qh-word-row"><button id="qhSpeak" class="qh-sound" aria-label="발음 듣기">${svg.sound}</button><h1 class="qh-word">${escapeHtml(item.word)}</h1><p class="qh-prompt">이 단어의 뜻을 선택하세요</p></div>
          <div class="qh-options">${session.options.map((o, i) => `<button class="qh-option" data-id="${o.id}" ${session.answered !== null ? 'disabled' : ''}><span class="qh-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(o.meaning)}</span></button>`).join('')}</div>
          <div id="qhFeedback"></div>
        </section>
      </main></div>`
    root.querySelector('#qhBackHub').addEventListener('click', () => { session = null; saveSession(); openHub() })
    root.querySelector('#qhSpeak').addEventListener('click', () => speak(item.word))
    root.querySelectorAll('.qh-option').forEach(btn => btn.addEventListener('click', () => answer(Number(btn.dataset.id))))
    if (session.answered !== null) paintAnswer()
  }

  function answer(id) {
    if (session.answered !== null) return
    const item = currentItem(); if (!item) return
    session.answered = id
    const ok = id === item.id
    if (ok) session.correct += 1
    else session.wrong.push(item.id)
    saveSession(); paintAnswer()
  }

  function paintAnswer() {
    const item = currentItem(); if (!item) return
    const root = makeRoot()
    root.querySelectorAll('.qh-option').forEach(btn => {
      const id = Number(btn.dataset.id)
      btn.disabled = true
      if (id === item.id) btn.classList.add('correct')
      if (id === session.answered && id !== item.id) btn.classList.add('wrong')
    })
    const ok = session.answered === item.id
    const box = root.querySelector('#qhFeedback')
    box.innerHTML = `<div class="qh-feedback ${ok ? '' : 'wrong'}"><b>${ok ? '정답입니다' : '정답: ' + escapeHtml(item.meaning)}</b><br>${ok ? '잘 기억하고 있습니다.' : '이 단어는 오답 목록에 저장했습니다.'}</div><button id="qhNext" class="qh-next">${session.pos + 1 >= session.order.length ? '결과 보기' : '다음 문제'}</button>`
    box.querySelector('#qhNext').addEventListener('click', nextQuestion)
  }

  function nextQuestion() {
    session.pos += 1
    session.answered = null
    session.options = null
    session.optionFor = null
    saveSession()
    if (session.pos >= session.order.length) renderResult(); else renderQuestion()
  }

  function renderResult() {
    if (!session) return openHub()
    const total = session.order.length
    const score = Math.round(session.correct / Math.max(1,total) * 100)
    const scopeText = session.scope === 'day' ? `DAY ${session.day}` : '전체 단어'
    const root = makeRoot()
    root.innerHTML = `<div class="qh-shell"><header class="qh-top"><button class="qh-back" id="qhResultBack">${svg.back}</button><div class="qh-top-title"><b>${scopeText} 결과</b><span>퀴즈 완료</span></div><div></div></header><main class="qh-question-wrap"><section class="qh-qcard qh-result"><div class="qh-score-ring"><b>${score}%</b></div><h2>${session.correct} / ${total} 정답</h2><p>틀린 단어 ${session.wrong.length}개가 있습니다. 같은 범위로 다시 풀면 문제 순서와 보기가 새로 섞입니다.</p><div class="qh-result-actions"><button class="qh-secondary" id="qhChoose">범위 다시 선택</button><button class="qh-primary" id="qhRetry">같은 범위 다시 풀기</button></div></section></main></div>`
    root.querySelector('#qhResultBack').addEventListener('click', openHub)
    root.querySelector('#qhChoose').addEventListener('click', () => { session=null; saveSession(); openHub() })
    root.querySelector('#qhRetry').addEventListener('click', () => startSession(session.scope, session.day))
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return
    try { speechSynthesis.cancel() } catch (_) {}
    const u = new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=.9
    speechSynthesis.speak(u)
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest?.('.bottom-nav button')
    if (!btn || !/퀴즈/.test(btn.textContent || '')) return
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation()
    openHub()
  }, true)

  window.addEventListener('hashchange', () => {
    if (location.hash === '#quiz-hub') openHub()
    else if (location.hash === '#quiz-play') {
      loadWords().then(() => { session = loadSession(); if (session) renderQuestion(); else openHub() }).catch(openHub)
    }
  })

  injectStyle()
  if (location.hash === '#quiz-hub' || location.hash === '#quiz') setTimeout(openHub, 0)
  if (location.hash === '#quiz-play') setTimeout(() => loadWords().then(() => { session = loadSession(); if (session) renderQuestion(); else openHub() }), 0)
})()
