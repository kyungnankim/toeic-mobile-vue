(() => {
  const STATE_KEY = 'toeic-lc400-state-v2'
  const DB_NAME = 'toeic-lc400-audio-v2'
  const STORE = 'tracks'
  const $ = id => document.getElementById(id)
  const audio = $('audio')

  let data = null
  let sectionIndex = 0
  let sentenceIndex = 0
  let timeline = []
  let currentTrackKey = ''
  let objectUrl = ''
  let pendingAutoPlay = false
  let prefetching = new Map()
  let ignoreEnded = false

  const state = loadState()
  const settings = {
    listenMode: state.listenMode || 'both',
    endMode: state.endMode || 'next',
    enRate: Number(state.enRate || 0.9),
    koRate: Number(state.koRate || 0.95),
    showKorean: state.showKorean !== false
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || localStorage.getItem('toeic-lc400-state-v1') || '{}') } catch (_) { return {} }
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        sectionIndex, sentenceIndex,
        listenMode: settings.listenMode,
        endMode: settings.endMode,
        enRate: settings.enRate,
        koRate: settings.koRate,
        showKorean: settings.showKorean,
        currentTime: Number(audio.currentTime || 0)
      }))
    } catch (_) {}
  }

  function currentSection() { return data.sections[sectionIndex] }
  function currentSentence() { return currentSection().sentences[sentenceIndex] }
  function fmt(n) { return `${Number(n).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x` }

  async function loadStaticDataset() {
    const response = await fetch('/data/lc-sentences-400.gz.b64', { cache: 'no-cache' })
    if (!response.ok) throw new Error(`static data ${response.status}`)
    const b64 = (await response.text()).trim()
    if (!b64.startsWith('H4sI')) throw new Error('invalid compressed dataset')
    if (!('DecompressionStream' in window)) throw new Error('gzip browser API unsupported')

    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text())
  }

  async function loadDataset() {
    let parsed = null
    try {
      parsed = await loadStaticDataset()
    } catch (staticError) {
      console.warn('LC400 static fallback failed', staticError)
      const response = await fetch('/api/lc400', { cache: 'no-store' })
      if (!response.ok) throw new Error(`LC400 API ${response.status}`)
      parsed = await response.json()
    }
    if (parsed?.total !== 400 || !Array.isArray(parsed.sections) || parsed.sections.length !== 40) {
      throw new Error('LC400 dataset validation failed')
    }
    return parsed
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async function dbGet(key) {
    try {
      const db = await openDb()
      if (!db) return null
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    } catch (_) { return null }
  }

  async function dbPut(key, value) {
    try {
      const db = await openDb()
      if (!db) return
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch (_) {}
  }

  function trackKey(idx) {
    return `section:${idx + 1}:${settings.listenMode}:en${settings.enRate}:ko${settings.koRate}:v2`
  }

  function ttsUrl(text, lang) {
    return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(String(text).slice(0, 190))}`
  }

  async function mapLimit(list, limit, worker) {
    const out = new Array(list.length)
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (true) {
        const index = cursor++
        if (index >= list.length) return
        out[index] = await worker(list[index], index)
      }
    })
    await Promise.all(runners)
    return out
  }

  async function decode(ctx, text, lang, attempt = 0) {
    try {
      const res = await fetch(ttsUrl(text, lang), { cache: 'force-cache' })
      if (!res.ok) throw new Error(`TTS ${res.status}`)
      const buf = await res.arrayBuffer()
      return await ctx.decodeAudioData(buf.slice(0))
    } catch (error) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
        return decode(ctx, text, lang, attempt + 1)
      }
      throw error
    }
  }

  function encodeWav(buffer) {
    const ch = buffer.getChannelData(0)
    const sr = buffer.sampleRate
    const arr = new ArrayBuffer(44 + ch.length * 2)
    const view = new DataView(arr)
    const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)) }
    write(0, 'RIFF')
    view.setUint32(4, 36 + ch.length * 2, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sr, true)
    view.setUint32(28, sr * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    write(36, 'data')
    view.setUint32(40, ch.length * 2, true)
    let offset = 44
    for (let i = 0; i < ch.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, ch[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    }
    return new Blob([arr], { type: 'audio/wav' })
  }

  function setBuildUi(show, percent = 0) {
    $('buildWrap').hidden = !show
    $('buildPercent').textContent = `${percent}%`
    $('buildBar').style.width = `${percent}%`
    $('statusText').textContent = show ? '백그라운드 오디오 준비 중' : '재생 준비 완료'
  }

  async function buildTrack(idx, showProgress = true) {
    const key = trackKey(idx)
    const cached = await dbGet(key)
    if (cached?.blob && cached?.timeline) return { ...cached, key }
    if (prefetching.has(key)) return prefetching.get(key)

    const task = (async () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!AudioCtx || !OfflineCtx) throw new Error('Web Audio unsupported')
      const ctx = new AudioCtx()
      try {
        const list = data.sections[idx].sentences
        let completed = 0
        if (showProgress) setBuildUi(true, 2)
        const clips = await mapLimit(list, 4, async item => {
          const enPromise = decode(ctx, item.en, 'en-US')
          const koPromise = settings.listenMode === 'both' ? decode(ctx, item.ko, 'ko-KR') : Promise.resolve(null)
          const [en, ko] = await Promise.all([enPromise, koPromise])
          completed++
          if (showProgress) setBuildUi(true, Math.round(completed / list.length * 70))
          return { en, ko }
        })

        const gapBetweenLanguages = 0.22
        const gapBetweenSentences = 0.58
        const entries = []
        let total = 0
        clips.forEach((clip, index) => {
          const start = total
          total += clip.en.duration / Math.max(0.7, settings.enRate)
          if (clip.ko) total += gapBetweenLanguages + clip.ko.duration / Math.max(0.75, settings.koRate)
          total += gapBetweenSentences
          entries.push({ index, start, end: total })
        })

        const sampleRate = 24000
        const offline = new OfflineCtx(1, Math.max(1, Math.ceil(total * sampleRate)), sampleRate)
        let cursor = 0
        clips.forEach(clip => {
          const en = offline.createBufferSource()
          en.buffer = clip.en
          en.playbackRate.value = Math.max(0.7, settings.enRate)
          en.connect(offline.destination)
          en.start(cursor)
          cursor += clip.en.duration / Math.max(0.7, settings.enRate)
          if (clip.ko) {
            cursor += gapBetweenLanguages
            const ko = offline.createBufferSource()
            ko.buffer = clip.ko
            ko.playbackRate.value = Math.max(0.75, settings.koRate)
            ko.connect(offline.destination)
            ko.start(cursor)
            cursor += clip.ko.duration / Math.max(0.75, settings.koRate)
          }
          cursor += gapBetweenSentences
        })

        if (showProgress) setBuildUi(true, 82)
        const rendered = await offline.startRendering()
        if (showProgress) setBuildUi(true, 95)
        const value = { blob: encodeWav(rendered), timeline: entries, section: idx, createdAt: Date.now() }
        await dbPut(key, value)
        if (showProgress) setBuildUi(false, 100)
        return { ...value, key }
      } finally {
        try { await ctx.close() } catch (_) {}
      }
    })()

    prefetching.set(key, task)
    try { return await task } finally { prefetching.delete(key) }
  }

  function attachTrack(track, keepSentence = true) {
    ignoreEnded = true
    audio.pause()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(track.blob)
    currentTrackKey = track.key
    timeline = track.timeline
    audio.src = objectUrl
    audio.preload = 'auto'
    audio.load()
    const target = keepSentence ? timeline.find(point => point.index === sentenceIndex) : timeline[0]
    const setPosition = () => {
      if (target) audio.currentTime = target.start
      ignoreEnded = false
      configureMediaSession()
    }
    if (audio.readyState >= 1) setPosition()
    else audio.addEventListener('loadedmetadata', setPosition, { once: true })
  }

  async function ensureTrack(autoPlay = false) {
    const key = trackKey(sectionIndex)
    if (currentTrackKey === key && timeline.length) {
      if (autoPlay) await playAudio()
      return true
    }
    pendingAutoPlay = autoPlay
    try {
      const track = await buildTrack(sectionIndex, true)
      attachTrack(track, true)
      $('statusText').textContent = '재생 준비 완료 · 백그라운드 재생 가능'
      if (pendingAutoPlay) {
        pendingAutoPlay = false
        await playAudio()
      }
      return true
    } catch (error) {
      console.error(error)
      pendingAutoPlay = false
      setBuildUi(false, 0)
      $('statusText').textContent = '오디오 준비 실패 · 다시 눌러주세요'
      $('prepareBtn').hidden = false
      return false
    }
  }

  async function playAudio() {
    configureMediaSession()
    try {
      await audio.play()
      setPlayUi(true)
      $('statusText').textContent = '자동 듣기 중 · 백그라운드 재생 가능'
      prefetchNext()
    } catch (error) {
      console.error(error)
      $('statusText').textContent = '재생 버튼을 한 번 더 눌러주세요'
    }
  }

  async function togglePlay() {
    if (!audio.paused) {
      audio.pause()
      return
    }
    if (currentTrackKey === trackKey(sectionIndex) && timeline.length) return playAudio()
    await ensureTrack(true)
  }

  function setPlayUi(on) {
    $('playIcon').hidden = on
    $('pauseIcon').hidden = !on
    $('playBtn').setAttribute('aria-label', on ? '일시정지' : '자동 듣기 시작')
  }

  function updateSentenceFromTime() {
    if (!timeline.length || !Number.isFinite(audio.currentTime)) return
    const found = timeline.find(point => audio.currentTime >= point.start && audio.currentTime < point.end)
    if (found && found.index !== sentenceIndex) {
      sentenceIndex = found.index
      renderSentence(false)
    }
  }

  function seekSentence(nextIndex, shouldPlay = !audio.paused) {
    if (nextIndex < 0) return changeSection(sectionIndex - 1, shouldPlay)
    if (nextIndex > 9) return changeSection(sectionIndex + 1, shouldPlay)
    sentenceIndex = nextIndex
    renderSentence()
    const point = timeline.find(item => item.index === sentenceIndex)
    if (currentTrackKey === trackKey(sectionIndex) && point) {
      audio.currentTime = point.start
      if (shouldPlay) playAudio()
    } else ensureTrack(shouldPlay)
    saveState()
  }

  async function changeSection(nextIndex, shouldPlay = false) {
    const wasPlaying = shouldPlay || !audio.paused
    audio.pause()
    setPlayUi(false)
    sectionIndex = (nextIndex + data.sections.length) % data.sections.length
    sentenceIndex = 0
    timeline = []
    currentTrackKey = ''
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
    audio.removeAttribute('src')
    audio.load()
    renderSection()
    saveState()
    if (wasPlaying) setTimeout(() => ensureTrack(true), 80)
  }

  async function handleEnded() {
    if (ignoreEnded) return
    setPlayUi(false)
    if (settings.endMode === 'repeat') {
      sentenceIndex = 0
      renderSentence()
      audio.currentTime = 0
      await playAudio()
      return
    }
    await changeSection(sectionIndex + 1, true)
  }

  function prefetchNext() {
    if (settings.endMode !== 'next') return
    const next = (sectionIndex + 1) % data.sections.length
    const key = trackKey(next)
    if (prefetching.has(key)) return
    setTimeout(() => buildTrack(next, false).catch(() => {}), 800)
  }

  function configureMediaSession() {
    if (!('mediaSession' in navigator) || !data) return
    const sentence = currentSentence()
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: sentence.en,
        artist: sentence.ko,
        album: `TOEIC LC 400 · ${sectionIndex + 1}. ${currentSection().title}`,
        artwork: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }]
      })
    } catch (_) {}
    const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn) } catch (_) {} }
    set('play', () => playAudio())
    set('pause', () => audio.pause())
    set('nexttrack', () => seekSentence(sentenceIndex + 1, true))
    set('previoustrack', () => seekSentence(sentenceIndex - 1, true))
    set('seekforward', details => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)) })
    set('seekbackward', details => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)) })
    set('seekto', details => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime })
  }

  function updateMediaPosition() {
    if (!('mediaSession' in navigator)) return
    try {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && Number.isFinite(audio.currentTime)) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration)
        })
      }
    } catch (_) {}
  }

  function renderSection() {
    const section = currentSection()
    $('sectionTitle').textContent = `${section.section}. ${section.title}`
    $('sectionSelect').value = String(sectionIndex)
    renderSentence()
    renderList()
  }

  function renderSentence(updateMedia = true) {
    const sentence = currentSentence()
    $('englishText').textContent = sentence.en
    $('koreanText').textContent = sentence.ko
    $('koreanText').classList.toggle('hidden', !settings.showKorean)
    $('sentenceNo').textContent = `${sentenceIndex + 1} / 10`
    $('globalNo').textContent = sentence.id
    $('progressBar').style.width = `${((sentenceIndex + 1) / 10) * 100}%`
    document.querySelectorAll('.sentence-item').forEach((element, index) => element.classList.toggle('active', index === sentenceIndex))
    if (updateMedia) configureMediaSession()
    saveState()
  }

  function renderList() {
    const box = $('sentenceList')
    box.innerHTML = ''
    currentSection().sentences.forEach((sentence, index) => {
      const button = document.createElement('button')
      button.className = `sentence-item${index === sentenceIndex ? ' active' : ''}`
      button.innerHTML = '<span class="num"></span><span><b></b><small></small></span>'
      button.querySelector('.num').textContent = index + 1
      button.querySelector('b').textContent = sentence.en
      button.querySelector('small').textContent = sentence.ko
      button.addEventListener('click', () => seekSentence(index, false))
      box.appendChild(button)
    })
  }

  async function speakOne() {
    const sentence = currentSentence()
    const wasPlaying = !audio.paused
    if (wasPlaying) audio.pause()
    const single = new Audio(ttsUrl(sentence.en, 'en-US'))
    single.playbackRate = settings.enRate
    try { await single.play() } catch (_) {}
  }

  function invalidateTrack() {
    const wasPlaying = !audio.paused
    audio.pause()
    setPlayUi(false)
    timeline = []
    currentTrackKey = ''
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
    }
    audio.removeAttribute('src')
    audio.load()
    saveState()
    $('statusText').textContent = '설정 변경됨 · 재생을 누르면 새 오디오를 준비합니다.'
    if (wasPlaying) setTimeout(() => ensureTrack(true), 80)
  }

  function wire() {
    $('playBtn').addEventListener('click', togglePlay)
    $('prepareBtn').addEventListener('click', () => { $('prepareBtn').hidden = true; ensureTrack(false) })
    $('backSentence').addEventListener('click', () => seekSentence(sentenceIndex - 1, !audio.paused))
    $('nextSentence').addEventListener('click', () => seekSentence(sentenceIndex + 1, !audio.paused))
    $('prevSection').addEventListener('click', () => changeSection(sectionIndex - 1, !audio.paused))
    $('nextSection').addEventListener('click', () => changeSection(sectionIndex + 1, !audio.paused))
    $('sectionSelect').addEventListener('change', event => changeSection(Number(event.target.value), !audio.paused))
    $('sectionPickerBtn').addEventListener('click', () => { try { $('sectionSelect').showPicker() } catch (_) { $('sectionSelect').focus() } })
    $('speakOne').addEventListener('click', speakOne)
    $('listenMode').addEventListener('change', event => { settings.listenMode = event.target.value; invalidateTrack() })
    $('endMode').addEventListener('change', event => { settings.endMode = event.target.value; saveState(); if (!audio.paused) prefetchNext() })
    $('enRate').addEventListener('input', event => { $('enRateText').textContent = fmt(Number(event.target.value)) })
    $('enRate').addEventListener('change', event => { settings.enRate = Number(event.target.value); invalidateTrack() })
    $('koRate').addEventListener('input', event => { $('koRateText').textContent = fmt(Number(event.target.value)) })
    $('koRate').addEventListener('change', event => { settings.koRate = Number(event.target.value); invalidateTrack() })
    $('showKorean').addEventListener('change', event => {
      settings.showKorean = event.target.checked
      $('koreanText').classList.toggle('hidden', !settings.showKorean)
      saveState()
    })

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', () => {
      setPlayUi(true)
      $('statusText').textContent = '자동 듣기 중 · 백그라운드 재생 가능'
      try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' } catch (_) {}
    })
    audio.addEventListener('pause', () => {
      setPlayUi(false)
      if (currentTrackKey && audio.currentTime > 0 && audio.currentTime < (audio.duration || Infinity)) $('statusText').textContent = '일시정지 · 다시 누르면 이어서 재생'
      try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' } catch (_) {}
      saveState()
    })
    audio.addEventListener('timeupdate', () => {
      updateSentenceFromTime()
      updateMediaPosition()
      saveState()
    })

    window.addEventListener('beforeunload', () => {
      saveState()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    })
  }

  async function init() {
    $('statusText').textContent = '문장 데이터 불러오는 중...'
    try {
      data = await loadDataset()
      sectionIndex = Math.min(39, Math.max(0, Number(state.sectionIndex || 0)))
      sentenceIndex = Math.min(9, Math.max(0, Number(state.sentenceIndex || 0)))

      $('sectionSelect').innerHTML = data.sections.map((section, index) => `<option value="${index}">${section.section}. ${section.title}</option>`).join('')
      $('listenMode').value = settings.listenMode
      $('endMode').value = settings.endMode
      $('enRate').value = String(settings.enRate)
      $('koRate').value = String(settings.koRate)
      $('enRateText').textContent = fmt(settings.enRate)
      $('koRateText').textContent = fmt(settings.koRate)
      $('showKorean').checked = settings.showKorean

      wire()
      renderSection()
      $('statusText').textContent = '재생을 누르면 백그라운드용 오디오를 준비합니다.'
      configureMediaSession()
    } catch (error) {
      console.error(error)
      $('statusText').textContent = '문장 데이터를 불러오지 못했습니다. 다시 접속해 주세요.'
      $('englishText').textContent = '데이터를 불러오지 못했습니다.'
      $('koreanText').textContent = '네트워크 연결 후 다시 시도해 주세요.'
    }
  }

  init()
})()
