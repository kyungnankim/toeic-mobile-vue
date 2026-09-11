(() => {
  const DB_NAME = 'toeic-background-audio-v1'
  const STORE = 'tracks'

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

  function ensureAudio(id) {
    let audio = document.getElementById(id)
    if (audio) return audio
    audio = document.createElement('audio')
    audio.id = id
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.style.position = 'fixed'
    audio.style.left = '-9999px'
    audio.style.width = '1px'
    audio.style.height = '1px'
    document.body.appendChild(audio)
    return audio
  }

  function splitLong(text, maxChars) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean)
    const out = []
    let current = ''
    for (const word of words) {
      if (!current) current = word
      else if ((current + ' ' + word).length <= maxChars) current += ' ' + word
      else { out.push(current); current = word }
    }
    if (current) out.push(current)
    return out
  }

  function chunkTexts(texts, maxChars = 170) {
    const pieces = texts.flatMap(text => splitLong(text, maxChars))
    const chunks = []
    let current = ''
    for (const piece of pieces) {
      if (!current) current = piece
      else if ((current + ' ' + piece).length <= maxChars) current += ' ' + piece
      else { chunks.push(current); current = piece }
    }
    if (current) chunks.push(current)
    return chunks
  }

  function ttsUrl(text, lang = 'en-US') {
    return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(String(text).slice(0, 190))}`
  }

  async function fetchAudioBuffer(text, lang, attempt = 0) {
    try {
      const res = await fetch(ttsUrl(text, lang), { cache: 'force-cache' })
      if (!res.ok) throw new Error(`TTS ${res.status}`)
      return await res.arrayBuffer()
    } catch (error) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)))
        return fetchAudioBuffer(text, lang, attempt + 1)
      }
      throw error
    }
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

  async function buildTtsTrack({ key, texts, lang = 'en-US', maxChars = 170, concurrency = 5, onProgress }) {
    const cached = await dbGet(key)
    if (cached?.blob) {
      onProgress?.(100, true)
      return cached.blob
    }

    const chunks = chunkTexts(texts, maxChars)
    if (!chunks.length) throw new Error('No audio text')
    let completed = 0
    onProgress?.(1, false)
    const buffers = await mapLimit(chunks, concurrency, async chunk => {
      const buffer = await fetchAudioBuffer(chunk, lang)
      completed++
      onProgress?.(Math.max(2, Math.round(completed / chunks.length * 96)), false)
      return buffer
    })

    const blob = new Blob(buffers, { type: 'audio/mpeg' })
    await dbPut(key, { blob, createdAt: Date.now(), chunks: chunks.length })
    onProgress?.(100, false)
    return blob
  }

  function configureMediaSession(audio, metadata, actions = {}) {
    if (!('mediaSession' in navigator)) return
    try { navigator.mediaSession.metadata = new MediaMetadata(metadata) } catch (_) {}
    const set = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn) } catch (_) {} }
    set('play', actions.play || (() => audio.play().catch(() => {})))
    set('pause', actions.pause || (() => audio.pause()))
    set('seekbackward', actions.seekbackward || (details => {
      audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 15))
    }))
    set('seekforward', actions.seekforward || (details => {
      audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + (details.seekOffset || 15))
    }))
    set('seekto', actions.seekto || (details => {
      if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime
    }))
  }

  function updatePosition(audio) {
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

  window.BackgroundAudio = {
    ensureAudio,
    ttsUrl,
    buildTtsTrack,
    configureMediaSession,
    updatePosition
  }
})()
