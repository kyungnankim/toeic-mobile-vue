const SETS = {
  v1: { url: './data/rc-v1.json', storage: 'toeic-rc-v1-progress' },
  v2: { url: './data/rc-v2.json', storage: 'toeic-rc-v2-progress' }
}

const state = {
  set: 'v1', data: null, answers: {}, scored: false, activePart: 'all',
  seconds: 1800, timer: null, running: false
}

const $ = s => document.querySelector(s)
const $$ = s => Array.from(document.querySelectorAll(s))
const storageKey = () => SETS[state.set].storage

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || 'null')
    if (!saved) {
      state.answers = {}; state.scored = false
      state.seconds = (state.data?.durationMinutes || 30) * 60
      return
    }
    state.answers = saved.answers || {}
    state.scored = Boolean(saved.scored)
    state.seconds = Number.isFinite(saved.seconds) ? saved.seconds : ((state.data?.durationMinutes || 30) * 60)
  } catch (_) {
    state.answers = {}; state.scored = false
    state.seconds = (state.data?.durationMinutes || 30) * 60
  }
}

function save() {
  localStorage.setItem(storageKey(), JSON.stringify({answers: state.answers, scored: state.scored, seconds: state.seconds}))
}

function fmt(sec) {
  const s = Math.max(0, sec), m = Math.floor(s / 60), r = s % 60
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
}

function renderTimer() {
  $('#timeValue').textContent = fmt(state.seconds)
  $('#timerBtn').textContent = state.running ? '일시정지' : (state.seconds < ((state.data?.durationMinutes || 30) * 60) ? '이어하기' : '시작')
}

function toggleTimer() {
  if (state.running) {
    clearInterval(state.timer); state.timer = null; state.running = false; save(); renderTimer(); return
  }
  state.running = true
  state.timer = setInterval(() => {
    state.seconds = Math.max(0, state.seconds - 1)
    if (state.seconds <= 0) {
      clearInterval(state.timer); state.timer = null; state.running = false; save(); renderTimer(); score(); alert('시간이 끝나 자동 채점했습니다.'); return
    }
    if (state.seconds % 5 === 0) save()
    renderTimer()
  }, 1000)
  renderTimer()
}

function partLabel(part) { return part === 5 ? 'Part 5' : part === 6 ? 'Part 6' : 'Part 7' }
function filteredQuestions() { return state.activePart === 'all' ? state.data.questions : state.data.questions.filter(q => q.part === Number(state.activePart)) }

function renderPartTabs() {
  const tabs = [{id:'all',label:'전체'}, ...state.data.parts.map(p => ({id:String(p.part),label:`Part ${p.part}`}))]
  $('#partTabs').innerHTML = tabs.map(t => `<button data-part="${t.id}" class="${String(state.activePart) === t.id ? 'active':''}">${t.label}</button>`).join('')
  $$('#partTabs button').forEach(btn => btn.addEventListener('click', () => {
    state.activePart = btn.dataset.part; renderPartTabs(); renderQuestions(); window.scrollTo({top:0,behavior:'smooth'})
  }))
}

function escapeHtml(text) {
  return String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
}

function passageHtml(passageId) {
  if (!passageId) return ''
  const text = state.data.passages[passageId]
  return text ? `<div class="rc-passage"><div class="rc-passage-head">READING PASSAGE</div><pre>${escapeHtml(text)}</pre></div>` : ''
}

function optionClass(q, key) {
  const chosen = state.answers[String(q.id)]
  if (!state.scored) return chosen === key ? 'selected' : ''
  if (q.answer === key) return 'correct'
  if (chosen === key && chosen !== q.answer) return 'wrong'
  return ''
}

function renderQuestions() {
  const questions = filteredQuestions()
  let lastPassage = null, html = ''
  for (const q of questions) {
    if (q.passageId && q.passageId !== lastPassage) { html += passageHtml(q.passageId); lastPassage = q.passageId }
    if (!q.passageId) lastPassage = null
    const chosen = state.answers[String(q.id)]
    html += `<article class="rc-question-card" id="rcq-${q.id}">
      <div class="rc-q-head"><span>${partLabel(q.part)}</span><b>${q.id}</b></div>
      <p class="rc-question-text">${escapeHtml(q.question)}</p>
      <div class="rc-options">${Object.entries(q.options).map(([key,value]) => `<button data-q="${q.id}" data-choice="${key}" class="${optionClass(q,key)}"><b>${key}</b><span>${escapeHtml(value)}</span></button>`).join('')}</div>
      ${state.scored ? `<div class="rc-answer-note ${chosen === q.answer ? 'ok':'bad'}">정답 <b>${q.answer}</b>${chosen ? ` · 선택 ${chosen}` : ' · 미답'}</div>` : ''}
    </article>`
  }
  $('#questionArea').innerHTML = html
  $$('#questionArea [data-q]').forEach(btn => btn.addEventListener('click', () => {
    if (state.scored) return
    state.answers[String(btn.dataset.q)] = btn.dataset.choice
    save(); renderQuestions(); renderStatus()
  }))
}

function renderStatus() {
  const total = state.data.questions.length
  const answered = Object.keys(state.answers).filter(k => state.data.questions.some(q => String(q.id) === k)).length
  $('#setTitle').textContent = state.data.title
  $('#answeredCount').textContent = answered
  $('#totalCount').textContent = total
  $('#progressFill').style.width = `${Math.round(answered / total * 100)}%`
  renderResult()
}

function score() {
  state.scored = true; save(); renderQuestions(); renderResult()
  const firstWrong = state.data.questions.find(q => state.answers[String(q.id)] !== q.answer)
  if (firstWrong) setTimeout(() => document.getElementById(`rcq-${firstWrong.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),120)
}

function renderResult() {
  const box = $('#resultBox')
  if (!state.scored) { box.hidden = true; return }
  box.hidden = false
  const qs = state.data.questions, correct = qs.filter(q => state.answers[String(q.id)] === q.answer)
  $('#scoreValue').textContent = correct.length
  $('#scorePercent').textContent = `${Math.round(correct.length / qs.length * 100)}%`
  for (const part of [5,6,7]) {
    const pqs = qs.filter(q => q.part === part), pc = pqs.filter(q => state.answers[String(q.id)] === q.answer).length
    $(`#part${part}Score`).textContent = `${pc}/${pqs.length}`
  }
}

function nextBlank() {
  const q = state.data.questions.find(q => !state.answers[String(q.id)])
  if (!q) return alert('모든 문항에 답했습니다.')
  state.activePart = 'all'; renderPartTabs(); renderQuestions()
  setTimeout(() => document.getElementById(`rcq-${q.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),60)
}

function reset() {
  if (!confirm('현재 세트의 답안과 채점 기록을 초기화할까요?')) return
  state.answers = {}; state.scored = false; state.seconds = (state.data.durationMinutes || 30) * 60
  save(); renderTimer(); renderQuestions(); renderStatus()
}

async function loadSet(key) {
  if (!SETS[key]) return
  if (state.timer) clearInterval(state.timer)
  state.timer = null; state.running = false; state.set = key; state.activePart = 'all'
  const res = await fetch(SETS[key].url, {cache:'no-store'})
  if (!res.ok) throw new Error('문제 데이터를 불러오지 못했습니다.')
  state.data = await res.json(); loadSaved()
  $$('.rc-set-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.set === key))
  renderPartTabs(); renderQuestions(); renderStatus(); renderTimer()
}

function bind() {
  $$('.rc-set-tab').forEach(btn => btn.addEventListener('click', () => loadSet(btn.dataset.set)))
  $('#timerBtn').addEventListener('click', toggleTimer)
  $('#nextBlankBtn').addEventListener('click', nextBlank)
  $('#scoreBtn').addEventListener('click', score)
  $('#resetBtn').addEventListener('click', reset)
  window.addEventListener('beforeunload', save)
}

async function init() {
  bind()
  try { await loadSet('v1') }
  catch (e) { console.error(e); $('#questionArea').innerHTML = '<div class="empty-state">문제 데이터를 불러오지 못했습니다. 새로고침해 주세요.</div>' }
}
init()
