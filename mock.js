const DB_NAME = 'toeic-study-local-files-v1'
const STATE_KEY = 'toeic-mock-standalone-v1'

const PRESETS = {
  nexus: {
    name: '넥서스 토익 모의고사',
    subtitle: '문제 PDF + 듣기 MP3 + 자동 채점',
    pdfHint: '토익 모의고사 문제.pdf',
    audioHint: '토익 모의고사 듣기.mp3',
    answerUrl: '/data/mock-nexus-answer-key.json',
    quickKeyPage: null,
  },
  test1: {
    name: 'TOEIC Test 1',
    subtitle: 'Practice Test 2 + 자동 채점',
    pdfHint: '토익테스트 1.pdf',
    audioHint: '듣기 파일이 있으면 선택',
    answerUrl: '/data/mock-test1-answer-key.json',
    quickKeyPage: 64,
  },
}

const PARTS = [
  { part: 1, start: 1, end: 10 },
  { part: 2, start: 11, end: 40 },
  { part: 3, start: 41, end: 70 },
  { part: 4, start: 71, end: 100 },
  { part: 5, start: 101, end: 140 },
  { part: 6, start: 141, end: 152 },
  { part: 7, start: 153, end: 200 },
]

const state = {
  preset: 'nexus',
  part: 1,
  sessions: {
    nexus: { answers: {}, seconds: 7200, result: null },
    test1: { answers: {}, seconds: 7200, result: null },
  },
  keys: { nexus: {}, test1: {} },
  running: false,
  timer: null,
  pdfUrl: '',
  audioUrl: '',
  pdfName: '',
  audioName: '',
  pdfPage: null,
}

const $ = sel => document.querySelector(sel)
const $$ = sel => Array.from(document.querySelectorAll(sel))
const session = () => state.sessions[state.preset]

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ preset: state.preset, part: state.part, sessions: state.sessions }))
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    if (!saved) return
    if (PRESETS[saved.preset]) state.preset = saved.preset
    if (Number.isInteger(saved.part) && saved.part >= 1 && saved.part <= 7) state.part = saved.part
    for (const key of Object.keys(PRESETS)) {
      if (!saved.sessions?.[key]) continue
      state.sessions[key] = {
        answers: saved.sessions[key].answers || {},
        seconds: Number.isFinite(saved.sessions[key].seconds) ? saved.sessions[key].seconds : 7200,
        result: saved.sessions[key].result || null,
      }
    }
  } catch (_) {}
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('files')) req.result.createObjectStore('files')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbPut(key, file) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite')
    tx.objectStore('files').put({ blob: file, name: file.name, type: file.type, savedAt: Date.now() }, key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function dbGet(key) {
  const db = await openDb()
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly')
    const req = tx.objectStore('files').get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

async function dbDelete(key) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite')
    tx.objectStore('files').delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

function revokeUrls() {
  if (state.pdfUrl.startsWith('blob:')) URL.revokeObjectURL(state.pdfUrl)
  if (state.audioUrl.startsWith('blob:')) URL.revokeObjectURL(state.audioUrl)
  state.pdfUrl = ''
  state.audioUrl = ''
  state.pdfName = ''
  state.audioName = ''
  state.pdfPage = null
}

async function loadFiles() {
  revokeUrls()
  try {
    const [pdf, audio] = await Promise.all([dbGet(`${state.preset}:pdf`), dbGet(`${state.preset}:audio`)])
    if (pdf?.blob) {
      state.pdfUrl = URL.createObjectURL(pdf.blob)
      state.pdfName = pdf.name || '문제 PDF'
    }
    if (audio?.blob) {
      state.audioUrl = URL.createObjectURL(audio.blob)
      state.audioName = audio.name || '듣기 MP3'
    }
  } catch (e) {
    console.warn('저장된 시험 파일을 불러오지 못했습니다.', e)
  }
  renderFiles()
  renderPdf()
}

async function importFile(event, kind) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (kind === 'pdf' && file.type && file.type !== 'application/pdf') return alert('PDF 파일을 선택해 주세요.')
  if (kind === 'audio' && file.type && !file.type.startsWith('audio/')) return alert('오디오 파일을 선택해 주세요.')
  try {
    await dbPut(`${state.preset}:${kind}`, file)
    await loadFiles()
  } catch (e) {
    console.error(e)
    alert('파일을 기기에 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.')
  }
}

async function clearFiles() {
  if (!confirm('현재 시험의 PDF와 오디오를 이 기기에서 지울까요?')) return
  await Promise.all([dbDelete(`${state.preset}:pdf`), dbDelete(`${state.preset}:audio`)]).catch(() => {})
  revokeUrls()
  renderFiles()
  renderPdf()
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':')
}

function renderTimer() {
  $('#timeValue').textContent = formatTime(session().seconds)
  $('#timerBox').classList.toggle('running', state.running)
  $('#timerBtnText').textContent = state.running ? '일시정지' : (session().seconds < 7200 ? '이어하기' : '시험 시작')
  $('#timerIconPlay').hidden = state.running
  $('#timerIconPause').hidden = !state.running
}

function stopTimer(pauseAudio = true) {
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  state.running = false
  if (pauseAudio) $('#audioPlayer')?.pause()
  saveState()
  renderTimer()
}

function toggleTimer() {
  if (state.running) return stopTimer(true)
  state.running = true
  const audio = $('#audioPlayer')
  if (audio && audio.paused && audio.currentTime === 0) audio.play().catch(() => {})
  state.timer = setInterval(() => {
    session().seconds = Math.max(0, session().seconds - 1)
    if (session().seconds <= 0) {
      stopTimer(true)
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      alert('시험 시간이 끝났습니다.')
      return
    }
    if (session().seconds % 5 === 0) saveState()
    renderTimer()
  }, 1000)
  saveState()
  renderTimer()
}

function resetTimer() {
  stopTimer(true)
  session().seconds = 7200
  const audio = $('#audioPlayer')
  if (audio) audio.currentTime = 0
  saveState()
  renderTimer()
}

function partForQuestion(n) { return PARTS.find(p => n >= p.start && n <= p.end) }
function choicesForPart(part) { return part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'] }

function renderParts() {
  $('#partTabs').innerHTML = PARTS.map(p => `<button class="${state.part === p.part ? 'active' : ''}" data-part="${p.part}"><b>P${p.part}</b><span>${p.start}–${p.end}</span></button>`).join('')
  $$('#partTabs button').forEach(btn => btn.addEventListener('click', () => {
    state.part = Number(btn.dataset.part)
    saveState()
    renderParts()
    renderAnswers()
  }))
}

function answerClass(n, choice) {
  const selected = session().answers[String(n)]
  const result = session().result
  if (!result) return selected === choice ? 'selected' : ''
  const correct = state.keys[state.preset]?.[String(n)]
  if (choice === correct) return 'correct'
  if (selected === choice && selected !== correct) return 'wrong'
  return ''
}

function renderAnswers() {
  const p = PARTS.find(x => x.part === state.part)
  const choices = choicesForPart(state.part)
  const rows = []
  for (let n = p.start; n <= p.end; n++) {
    const selected = session().answers[String(n)]
    rows.push(`<div class="answer-row" id="q-${n}"><b class="qno">${n}</b><div class="choice-row">${choices.map(c => `<button data-q="${n}" data-c="${c}" class="${answerClass(n, c)}">${c}</button>`).join('')}</div><button class="clear-one" data-clear="${n}" ${selected ? '' : 'hidden'} aria-label="답 지우기">×</button></div>`)
  }
  $('#answerList').innerHTML = rows.join('')
  $$('#answerList [data-q]').forEach(btn => btn.addEventListener('click', () => {
    session().answers[String(btn.dataset.q)] = btn.dataset.c
    session().result = null
    saveState()
    renderAllProgress()
    renderAnswers()
  }))
  $$('#answerList [data-clear]').forEach(btn => btn.addEventListener('click', () => {
    delete session().answers[String(btn.dataset.clear)]
    session().result = null
    saveState()
    renderAllProgress()
    renderAnswers()
  }))
}

function renderAllProgress() {
  const answered = Object.keys(session().answers).length
  $('#answeredCount').textContent = answered
  $('#remainingCount').textContent = 200 - answered
  $('#progressFill').style.width = `${answered / 2}%`
  renderResult()
}

function scoreTest() {
  const key = state.keys[state.preset]
  if (!key || Object.keys(key).length !== 200) return alert('정답 데이터를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.')
  let total = 0, listening = 0, reading = 0, unanswered = 0
  const wrong = []
  for (let n = 1; n <= 200; n++) {
    const chosen = session().answers[String(n)]
    const correct = key[String(n)]
    if (!chosen) unanswered++
    else if (chosen === correct) {
      total++
      if (n <= 100) listening++
      else reading++
    } else wrong.push(n)
  }
  session().result = { total, listening, reading, unanswered, wrong, scoredAt: Date.now() }
  saveState()
  renderAnswers()
  renderResult()
}

function renderResult() {
  const box = $('#resultBox')
  const r = session().result
  if (!r) { box.hidden = true; return }
  box.hidden = false
  $('#scoreTotal').textContent = r.total
  $('#scoreLC').textContent = r.listening
  $('#scoreRC').textContent = r.reading
  $('#scoreBlank').textContent = r.unanswered
  $('#wrongBtn').hidden = !r.wrong.length
}

function resetAnswers() {
  if (!confirm('현재 시험의 답안과 채점 결과를 초기화할까요?')) return
  session().answers = {}
  session().result = null
  saveState()
  renderAnswers()
  renderAllProgress()
}

function nextUnanswered() {
  const n = Array.from({ length: 200 }, (_, i) => i + 1).find(x => !session().answers[String(x)])
  if (!n) return alert('모든 문항에 답했습니다.')
  state.part = partForQuestion(n).part
  saveState()
  renderParts()
  renderAnswers()
  setTimeout(() => $(`#q-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
}

function firstWrong() {
  const n = session().result?.wrong?.[0]
  if (!n) return
  state.part = partForQuestion(n).part
  saveState()
  renderParts()
  renderAnswers()
  setTimeout(() => $(`#q-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30)
}

function renderPdf() {
  const frame = $('#pdfFrame')
  const empty = $('#pdfEmpty')
  const reset = $('#pdfResetBtn')
  if (!state.pdfUrl) {
    frame.hidden = true
    empty.hidden = false
    reset.hidden = true
    frame.src = 'about:blank'
    return
  }
  frame.hidden = false
  empty.hidden = true
  reset.hidden = state.pdfPage == null
  frame.src = state.pdfPage ? `${state.pdfUrl}#page=${state.pdfPage}` : state.pdfUrl
}

function quickKey() {
  const page = PRESETS[state.preset].quickKeyPage
  if (!page || !state.pdfUrl) return
  state.pdfPage = page
  renderPdf()
}

function renderFiles() {
  const preset = PRESETS[state.preset]
  $('#presetName').textContent = preset.name
  $('#presetSubtitle').textContent = preset.subtitle
  $('#pdfStatus').textContent = state.pdfUrl ? 'PDF 저장됨' : '문제 PDF 선택'
  $('#pdfName').textContent = state.pdfName || preset.pdfHint
  $('#audioStatus').textContent = state.audioUrl ? '듣기 저장됨' : '듣기 MP3 선택'
  $('#audioName').textContent = state.audioName || preset.audioHint
  $('#pdfUpload').classList.toggle('ready', Boolean(state.pdfUrl))
  $('#audioUpload').classList.toggle('ready', Boolean(state.audioUrl))
  const audio = $('#audioPlayer')
  if (state.audioUrl) {
    audio.hidden = false
    audio.src = state.audioUrl
  } else {
    audio.pause()
    audio.removeAttribute('src')
    audio.hidden = true
  }
  $('#quickKeyBtn').hidden = !(preset.quickKeyPage && state.pdfUrl)
}

async function selectPreset(key) {
  if (!PRESETS[key]) return
  stopTimer(true)
  state.preset = key
  state.part = 1
  state.pdfPage = null
  saveState()
  await loadFiles()
  renderPresetTabs()
  renderParts()
  renderAnswers()
  renderAllProgress()
  renderTimer()
}

function renderPresetTabs() { $$('.preset-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.preset === state.preset)) }

async function loadKeys() {
  const entries = await Promise.all(Object.entries(PRESETS).map(async ([key, preset]) => {
    try {
      const res = await fetch(preset.answerUrl)
      return [key, res.ok ? await res.json() : {}]
    } catch (_) { return [key, {}] }
  }))
  state.keys = Object.fromEntries(entries)
}

function bindEvents() {
  $$('.preset-tab').forEach(btn => btn.addEventListener('click', () => selectPreset(btn.dataset.preset)))
  $('#pdfInput').addEventListener('change', e => importFile(e, 'pdf'))
  $('#audioInput').addEventListener('change', e => importFile(e, 'audio'))
  $('#clearFilesBtn').addEventListener('click', clearFiles)
  $('#timerBtn').addEventListener('click', toggleTimer)
  $('#timerResetBtn').addEventListener('click', resetTimer)
  $('#nextBlankBtn').addEventListener('click', nextUnanswered)
  $('#scoreBtn').addEventListener('click', scoreTest)
  $('#resetAnswersBtn').addEventListener('click', resetAnswers)
  $('#wrongBtn').addEventListener('click', firstWrong)
  $('#quickKeyBtn').addEventListener('click', quickKey)
  $('#pdfResetBtn').addEventListener('click', () => { state.pdfPage = null; renderPdf() })
  window.addEventListener('beforeunload', saveState)
}

async function init() {
  loadState()
  bindEvents()
  await loadKeys()
  await loadFiles()
  renderPresetTabs()
  renderParts()
  renderAnswers()
  renderAllProgress()
  renderTimer()
}

init()
