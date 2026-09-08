const DB_NAME = 'toeic-study-local-files-v1'
const SETS = {
  v1: {
    name: 'JKCB RC Practice 1',
    pdfHint: 'JKCB_v1-1_TOEIC_RC_Reading_Comprehension_Practice.pdf',
    keyUrl: './data/rc-v1-answer-key.json'
  },
  v2: {
    name: 'JKCB RC Practice 2',
    pdfHint: 'JKCB_v2_TOEIC_RC_Reading_Comprehension_Practice.pdf',
    keyUrl: './data/rc-v2-answer-key.json'
  }
}
const PARTS = [
  { part: 5, start: 1, end: 15 },
  { part: 6, start: 16, end: 19 },
  { part: 7, start: 20, end: 25 }
]
const TOTAL = 25
const DEFAULT_SECONDS = 1800
const qs = new URLSearchParams(location.search)
const setKey = SETS[qs.get('set')] ? qs.get('set') : 'v1'
const preset = SETS[setKey]
const STATE_KEY = `toeic-rc-practice-${setKey}-v1`

const state = {
  part: 5,
  answers: {},
  seconds: DEFAULT_SECONDS,
  result: null,
  key: {},
  running: false,
  timer: null,
  pdfUrl: '',
  pdfName: ''
}

const $ = sel => document.querySelector(sel)
const $$ = sel => Array.from(document.querySelectorAll(sel))

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({
    part: state.part,
    answers: state.answers,
    seconds: state.seconds,
    result: state.result
  }))
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    if (!s) return
    if ([5,6,7].includes(s.part)) state.part = s.part
    state.answers = s.answers || {}
    if (Number.isFinite(s.seconds)) state.seconds = s.seconds
    state.result = s.result || null
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
function fileKey() { return `rc:${setKey}:pdf` }
function revokePdf() {
  if (state.pdfUrl.startsWith('blob:')) URL.revokeObjectURL(state.pdfUrl)
  state.pdfUrl = ''
  state.pdfName = ''
}
async function loadPdf() {
  revokePdf()
  try {
    const pdf = await dbGet(fileKey())
    if (pdf?.blob) {
      state.pdfUrl = URL.createObjectURL(pdf.blob)
      state.pdfName = pdf.name || preset.pdfHint
    }
  } catch (_) {}
  renderPdf()
}
async function importPdf(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.type && file.type !== 'application/pdf') return alert('PDF 파일을 선택해 주세요.')
  await dbPut(fileKey(), file)
  await loadPdf()
}
async function clearPdf() {
  if (!confirm('이 기기에 저장된 현재 RC 문제 PDF를 삭제할까요?')) return
  await dbDelete(fileKey()).catch(() => {})
  revokePdf()
  renderPdf()
}
function renderPdf() {
  $('#pdfStatus').textContent = state.pdfUrl ? 'PDF 저장됨' : '문제 PDF 선택'
  $('#pdfName').textContent = state.pdfName || preset.pdfHint
  $('#pdfUpload').classList.toggle('ready', Boolean(state.pdfUrl))
  const frame = $('#pdfFrame')
  const empty = $('#pdfEmpty')
  if (state.pdfUrl) {
    frame.hidden = false
    empty.hidden = true
    frame.src = state.pdfUrl
  } else {
    frame.hidden = true
    empty.hidden = false
    frame.src = 'about:blank'
  }
}
function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h,m,sec].map(v => String(v).padStart(2,'0')).join(':')
}
function renderTimer() {
  $('#timeValue').textContent = formatTime(state.seconds)
  $('#timerBox').classList.toggle('running', state.running)
  $('#timerBtnText').textContent = state.running ? '일시정지' : (state.seconds < DEFAULT_SECONDS ? '이어하기' : '연습 시작')
  $('#timerIconPlay').hidden = state.running
  $('#timerIconPause').hidden = !state.running
}
function stopTimer() {
  if (state.timer) clearInterval(state.timer)
  state.timer = null
  state.running = false
  saveState()
  renderTimer()
}
function toggleTimer() {
  if (state.running) return stopTimer()
  state.running = true
  state.timer = setInterval(() => {
    state.seconds = Math.max(0, state.seconds - 1)
    if (!state.seconds) {
      stopTimer()
      alert('연습 시간이 끝났습니다.')
      return
    }
    if (state.seconds % 5 === 0) saveState()
    renderTimer()
  }, 1000)
  renderTimer()
}
function resetTimer() {
  stopTimer()
  state.seconds = DEFAULT_SECONDS
  saveState()
  renderTimer()
}
function currentPart() { return PARTS.find(p => p.part === state.part) }
function partForQuestion(n) { return PARTS.find(p => n >= p.start && n <= p.end) }
function renderParts() {
  $('#partTabs').innerHTML = PARTS.map(p => `<button class="${p.part === state.part ? 'active' : ''}" data-part="${p.part}"><b>P${p.part}</b><span>${p.start}–${p.end}</span></button>`).join('')
  $$('#partTabs button').forEach(btn => btn.addEventListener('click', () => {
    state.part = Number(btn.dataset.part)
    saveState(); renderParts(); renderAnswers()
  }))
}
function answerClass(n, choice) {
  const selected = state.answers[String(n)]
  if (!state.result) return selected === choice ? 'selected' : ''
  const correct = state.key[String(n)]
  if (choice === correct) return 'correct'
  if (selected === choice && selected !== correct) return 'wrong'
  return ''
}
function renderAnswers() {
  const p = currentPart()
  const rows = []
  for (let n = p.start; n <= p.end; n++) {
    const selected = state.answers[String(n)]
    rows.push(`<div class="answer-row" id="q-${n}"><b class="qno">${n}</b><div class="choice-row">${['A','B','C','D'].map(c => `<button data-q="${n}" data-c="${c}" class="${answerClass(n,c)}">${c}</button>`).join('')}</div><button class="clear-one" data-clear="${n}" ${selected ? '' : 'hidden'} aria-label="답 지우기">×</button></div>`)
  }
  $('#answerList').innerHTML = rows.join('')
  $$('#answerList [data-q]').forEach(btn => btn.addEventListener('click', () => {
    state.answers[String(btn.dataset.q)] = btn.dataset.c
    state.result = null
    saveState(); renderAnswers(); renderProgress()
  }))
  $$('#answerList [data-clear]').forEach(btn => btn.addEventListener('click', () => {
    delete state.answers[String(btn.dataset.clear)]
    state.result = null
    saveState(); renderAnswers(); renderProgress()
  }))
}
function renderProgress() {
  const answered = Object.keys(state.answers).length
  $('#answeredCount').textContent = answered
  $('#remainingCount').textContent = TOTAL - answered
  $('#progressFill').style.width = `${answered / TOTAL * 100}%`
  renderResult()
}
function scoreTest() {
  if (Object.keys(state.key).length !== TOTAL) return alert('정답 데이터를 아직 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.')
  let total = 0, p5 = 0, p6 = 0, p7 = 0, unanswered = 0
  const wrong = []
  for (let n = 1; n <= TOTAL; n++) {
    const chosen = state.answers[String(n)]
    const correct = state.key[String(n)]
    if (!chosen) unanswered++
    else if (chosen === correct) {
      total++
      if (n <= 15) p5++
      else if (n <= 19) p6++
      else p7++
    } else wrong.push(n)
  }
  state.result = { total, p5, p6, p7, unanswered, wrong }
  saveState(); renderAnswers(); renderResult()
}
function renderResult() {
  const box = $('#resultBox')
  if (!state.result) { box.hidden = true; return }
  box.hidden = false
  $('#scoreTotal').textContent = state.result.total
  $('#scoreP5').textContent = `${state.result.p5}/15`
  $('#scoreP6').textContent = `${state.result.p6}/4`
  $('#scoreP7').textContent = `${state.result.p7}/6`
  $('#wrongBtn').hidden = !state.result.wrong.length
}
function nextUnanswered() {
  const n = Array.from({length: TOTAL}, (_,i) => i+1).find(n => !state.answers[String(n)])
  if (!n) return alert('모든 문항에 답했습니다.')
  state.part = partForQuestion(n).part
  saveState(); renderParts(); renderAnswers()
  setTimeout(() => $(`#q-${n}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 20)
}
function firstWrong() {
  const n = state.result?.wrong?.[0]
  if (!n) return
  state.part = partForQuestion(n).part
  saveState(); renderParts(); renderAnswers()
  setTimeout(() => $(`#q-${n}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 20)
}
function resetAnswers() {
  if (!confirm('현재 RC 답안과 채점 결과를 초기화할까요?')) return
  state.answers = {}; state.result = null
  saveState(); renderAnswers(); renderProgress()
}
async function init() {
  loadState()
  $('#testTitle').textContent = setKey === 'v1' ? 'RC 연습 1' : 'RC 연습 2'
  $('#presetName').textContent = preset.name
  $('#setV1').classList.toggle('active', setKey === 'v1')
  $('#setV2').classList.toggle('active', setKey === 'v2')
  try {
    const res = await fetch(preset.keyUrl)
    state.key = res.ok ? await res.json() : {}
  } catch (_) { state.key = {} }
  $('#pdfInput').addEventListener('change', importPdf)
  $('#clearFilesBtn').addEventListener('click', clearPdf)
  $('#timerBtn').addEventListener('click', toggleTimer)
  $('#timerResetBtn').addEventListener('click', resetTimer)
  $('#nextBlankBtn').addEventListener('click', nextUnanswered)
  $('#scoreBtn').addEventListener('click', scoreTest)
  $('#resetAnswersBtn').addEventListener('click', resetAnswers)
  $('#wrongBtn').addEventListener('click', firstWrong)
  await loadPdf()
  renderParts(); renderAnswers(); renderProgress(); renderTimer()
}
window.addEventListener('beforeunload', saveState)
init()
