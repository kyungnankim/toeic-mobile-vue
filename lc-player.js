(() => {
  const DB_NAME = 'toeic-lc-audio-v1'
  const STORE = 'files'
  const AUDIO_KEY = 'lc-100-sentences'
  const STATE_KEY = 'toeic-lc-player-state-v1'

  const byId = id => document.getElementById(id)
  const audio = byId('lcAudio')
  const overlay = byId('lcOverlay')
  const fileInput = byId('lcFileInput')
  const connectBtn = byId('lcConnectBtn')
  const playBtn = byId('lcPlayBtn')
  const playIcon = byId('lcPlayIcon')
  const pauseIcon = byId('lcPauseIcon')
  const titleStatus = byId('lcStatus')
  const progress = byId('lcProgress')
  const currentText = byId('lcCurrent')
  const durationText = byId('lcDuration')
  const speed = byId('lcSpeed')
  const mini = byId('lcMiniPlayer')
  const miniTitle = byId('lcMiniTitle')
  const miniPlay = byId('lcMiniPlay')
  const miniPlayIcon = byId('lcMiniPlayIcon')
  const miniPauseIcon = byId('lcMiniPauseIcon')

  let objectUrl = ''
  let ready = false
  let lastSavedSecond = -1

  function fmt(seconds) {
    if (!Number.isFinite(seconds)) return '00:00'
    const s = Math.max(0, Math.floor(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  function openDb() {
    return new Promise((resolve, reject) => {
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
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    } catch (_) { return null }
  }

  async function dbPut(key, value) {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  }

  function getState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      currentTime: Number(audio.currentTime || 0),
      speed: Number(audio.playbackRate || 1),
      overlayOpen: !overlay.hidden
    }))
  }

  function setPlayUi(isPlaying) {
    playIcon.hidden = isPlaying
    pauseIcon.hidden = !isPlaying
    miniPlayIcon.hidden = isPlaying
    miniPauseIcon.hidden = !isPlaying
    playBtn.setAttribute('aria-label', isPlaying ? '일시정지' : '재생')
    miniPlay.setAttribute('aria-label', isPlaying ? '일시정지' : '재생')
    mini.classList.toggle('is-playing', isPlaying)
  }

  function setReadyUi(fileName) {
    ready = true
    titleStatus.textContent = '재생 준비 완료 · 이 휴대폰에 저장됨'
    miniTitle.textContent = 'LC 100문장'
    connectBtn.querySelector('span').textContent = 'MP3 다시 연결'
    playBtn.disabled = false
    progress.disabled = false
    speed.disabled = false
    if (fileName) connectBtn.title = fileName
  }

  function setSource(blob, fileName = '') {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(blob)
    audio.src = objectUrl
    audio.load()
    setReadyUi(fileName)
  }

  function configureMediaSession() {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: '토익 LC 귀뚫기 · 100문장',
        artist: '아무튼영어 토익',
        album: 'TOEIC Listening',
        artwork: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }]
      })
    } catch (_) {}
    const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn) } catch (_) {} }
    set('play', () => audio.play().catch(() => {}))
    set('pause', () => audio.pause())
    set('seekbackward', details => { audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10)) })
    set('seekforward', details => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 10)) })
    set('seekto', details => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime })
    set('previoustrack', () => { audio.currentTime = Math.max(0, audio.currentTime - 15) })
    set('nexttrack', () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15) })
  }

  function openPlayer() {
    overlay.hidden = false
    document.body.classList.add('lc-overlay-open')
    saveState()
  }

  function closePlayer() {
    overlay.hidden = true
    document.body.classList.remove('lc-overlay-open')
    saveState()
  }

  async function togglePlay() {
    if (!ready) {
      fileInput.click()
      return
    }
    if (audio.paused) {
      configureMediaSession()
      try {
        await audio.play()
      } catch (_) {
        titleStatus.textContent = '재생 버튼을 다시 눌러주세요.'
      }
    } else {
      audio.pause()
    }
  }

  function seek(delta) {
    if (!ready) return
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + delta))
  }

  async function importFile(file) {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|opus|wav)$/i.test(file.name)) {
      alert('오디오 파일을 선택해 주세요.')
      return
    }
    titleStatus.textContent = 'MP3를 이 휴대폰에 저장하는 중…'
    connectBtn.disabled = true
    try {
      const blob = file.slice(0, file.size, file.type || 'audio/mpeg')
      await dbPut(AUDIO_KEY, { blob, fileName: file.name, size: file.size, savedAt: Date.now() })
      try { await navigator.storage?.persist?.() } catch (_) {}
      setSource(blob, file.name)
      titleStatus.textContent = '저장 완료 · 이제 다음부터 파일 선택 없이 재생됩니다.'
    } catch (error) {
      console.error(error)
      titleStatus.textContent = '저장에 실패했습니다. 다시 선택해 주세요.'
    } finally {
      connectBtn.disabled = false
      fileInput.value = ''
    }
  }

  connectBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => importFile(fileInput.files?.[0]))
  playBtn.addEventListener('click', togglePlay)
  miniPlay.addEventListener('click', e => { e.stopPropagation(); togglePlay() })
  byId('lcOpenBtn').addEventListener('click', openPlayer)
  byId('lcMiniOpen').addEventListener('click', openPlayer)
  byId('lcCloseBtn').addEventListener('click', closePlayer)
  byId('lcBackHomeBtn').addEventListener('click', () => { closePlayer(); window.scrollTo({ top: 0, behavior: 'smooth' }) })
  byId('lcBack10').addEventListener('click', () => seek(-10))
  byId('lcForward10').addEventListener('click', () => seek(10))

  progress.addEventListener('input', () => {
    if (!ready || !Number.isFinite(audio.duration)) return
    audio.currentTime = Number(progress.value) / 1000 * audio.duration
  })

  speed.addEventListener('change', () => {
    audio.playbackRate = Number(speed.value)
    saveState()
  })

  audio.addEventListener('loadedmetadata', () => {
    const state = getState()
    durationText.textContent = fmt(audio.duration)
    audio.playbackRate = Number(state.speed || 1)
    speed.value = String(audio.playbackRate)
    if (Number.isFinite(state.currentTime) && state.currentTime > 0 && state.currentTime < audio.duration - 2) {
      audio.currentTime = state.currentTime
    }
  })

  audio.addEventListener('timeupdate', () => {
    currentText.textContent = fmt(audio.currentTime)
    durationText.textContent = fmt(audio.duration)
    if (Number.isFinite(audio.duration) && audio.duration > 0) progress.value = String(Math.round(audio.currentTime / audio.duration * 1000))
    const sec = Math.floor(audio.currentTime)
    if (sec !== lastSavedSecond && sec % 5 === 0) {
      lastSavedSecond = sec
      saveState()
    }
    try {
      if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) })
      }
    } catch (_) {}
  })

  audio.addEventListener('play', () => {
    setPlayUi(true)
    configureMediaSession()
    mini.hidden = false
    titleStatus.textContent = '재생 중 · 삼성 인터넷 백그라운드 재생 지원'
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing' } catch (_) {}
  })

  audio.addEventListener('pause', () => {
    setPlayUi(false)
    if (ready) titleStatus.textContent = '일시정지 · 이어서 들을 위치가 저장됩니다.'
    saveState()
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused' } catch (_) {}
  })

  audio.addEventListener('ended', () => {
    setPlayUi(false)
    audio.currentTime = 0
    saveState()
  })

  window.addEventListener('beforeunload', saveState)

  async function init() {
    const cached = await dbGet(AUDIO_KEY)
    if (cached?.blob) setSource(cached.blob, cached.fileName || '')
    else {
      titleStatus.textContent = '처음 한 번만 올려주신 MP3를 선택해 주세요.'
      playBtn.disabled = true
      progress.disabled = true
      speed.disabled = true
    }
    const state = getState()
    if (state.overlayOpen) openPlayer()
    setPlayUi(false)
  }

  window.toeicLc = { open: openPlayer, close: closePlayer, play: togglePlay }
  init()
})()
