const { createApp, computed, nextTick, onMounted, ref, watch } = Vue

createApp({
  setup() {
    const STORAGE_KEY = 'toeic-30day-progress-v2'
    const SETTINGS_KEY = 'toeic-30day-settings-v4'
    const UI_KEY = 'toeic-30day-ui-v1'
    const VALID_VIEWS = ['home', 'study', 'quiz', 'review', 'search']

    const words = ref([])
    const activeView = ref('home')
    const selectedDay = ref(1)
    const currentIndex = ref(0)
    const showMeaning = ref(true)
    const autoSpeak = ref(true)
    const autoPlay = ref(false)
    const autoPreparing = ref(false)
    const autoBuildProgress = ref(0)
    const speechRate = ref(0.9)
    const koreanRate = ref(0.95)
    const searchText = ref('')
    const quiz = ref(null)
    const quizAnswer = ref(null)
    const quizFinished = ref(false)
    const touchStartX = ref(0)
    const ready = ref(false)

    let autoAudio = null
    let autoTrackUrl = ''
    let autoTrackKey = ''
    let autoTrackDay = 0
    let autoTrackStartIndex = 0
    let autoTimeline = []
    let restoredUi = null

    const state = ref({ status: {}, wrong: [], lastDay: 1, lastIndex: 0 })

    const dayTopics = computed(() => {
      const map = new Map()
      for (const item of words.value) if (!map.has(item.day)) map.set(item.day, item.topic)
      return Array.from(map.entries()).map(([day, topic]) => ({ day, topic }))
    })
    const dayWords = computed(() => words.value.filter(w => w.day === selectedDay.value))
    const currentWord = computed(() => dayWords.value[currentIndex.value] || null)
    const knownIds = computed(() => Object.entries(state.value.status).filter(([, v]) => v === 'known').map(([k]) => Number(k)))
    const unknownIds = computed(() => Object.entries(state.value.status).filter(([, v]) => v === 'unknown').map(([k]) => Number(k)))
    const reviewIds = computed(() => Array.from(new Set([...unknownIds.value, ...state.value.wrong])))
    const reviewWords = computed(() => reviewIds.value.map(id => words.value.find(w => w.id === id)).filter(Boolean))
    const overallPercent = computed(() => words.value.length ? Math.round((knownIds.value.length / words.value.length) * 100) : 0)
    const filteredWords = computed(() => {
      const q = searchText.value.trim().toLowerCase()
      if (!q) return []
      return words.value.filter(w => w.word.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q)).slice(0, 80)
    })

    const dayProgress = day => {
      const list = words.value.filter(w => w.day === day)
      const known = list.filter(w => state.value.status[w.id] === 'known').length
      return { known, total: list.length, percent: list.length ? Math.round(known / list.length * 100) : 0 }
    }

    function saveUi() {
      if (!ready.value) return
      const ui = {
        activeView: activeView.value,
        selectedDay: selectedDay.value,
        currentIndex: currentIndex.value,
        searchText: searchText.value,
        quiz: quiz.value,
        quizAnswer: quizAnswer.value,
        quizFinished: quizFinished.value
      }
      localStorage.setItem(UI_KEY, JSON.stringify(ui))
      const hash = `#${activeView.value}`
      if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`)
    }

    function save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        showMeaning: showMeaning.value,
        autoSpeak: autoSpeak.value,
        speechRate: speechRate.value,
        koreanRate: koreanRate.value
      }))
      saveUi()
    }

    function load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (parsed) state.value = { ...state.value, ...parsed }
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
        if (settings) {
          if (typeof settings.showMeaning === 'boolean') showMeaning.value = settings.showMeaning
          if (typeof settings.autoSpeak === 'boolean') autoSpeak.value = settings.autoSpeak
          if (typeof settings.speechRate === 'number') speechRate.value = settings.speechRate
          if (typeof settings.koreanRate === 'number') koreanRate.value = settings.koreanRate
        }
        restoredUi = JSON.parse(localStorage.getItem(UI_KEY) || 'null')
        if (restoredUi) {
          if (typeof restoredUi.searchText === 'string') searchText.value = restoredUi.searchText
          if (restoredUi.quiz) quiz.value = restoredUi.quiz
          quizAnswer.value = restoredUi.quizAnswer ?? null
          quizFinished.value = Boolean(restoredUi.quizFinished)
        }
      } catch (_) {
        restoredUi = null
      }
    }

    function pickVoice(lang) {
      const voices = window.speechSynthesis?.getVoices?.() || []
      const normalized = lang.toLowerCase()
      const base = normalized.split('-')[0]
      return voices.find(v => v.lang?.toLowerCase() === normalized)
        || voices.find(v => v.lang?.toLowerCase().startsWith(normalized))
        || voices.find(v => v.lang?.toLowerCase().startsWith(base))
    }

    function speakText(text, lang, rate, onDone, cancelFirst = true) {
      if (!('speechSynthesis' in window) || !text) {
        if (onDone) onDone()
        return
      }
      if (cancelFirst) window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = lang
      utter.rate = rate
      utter.pitch = 1
      const preferred = pickVoice(lang)
      if (preferred) utter.voice = preferred
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        if (onDone) onDone()
      }
      utter.onend = finish
      utter.onerror = finish
      try { window.speechSynthesis.resume() } catch (_) {}
      window.speechSynthesis.speak(utter)
    }

    function ensureAutoAudio() {
      if (autoAudio) return autoAudio
      autoAudio = document.createElement('audio')
      autoAudio.preload = 'auto'
      autoAudio.playsInline = true
      autoAudio.setAttribute('aria-hidden', 'true')
      autoAudio.style.position = 'fixed'
      autoAudio.style.width = '1px'
      autoAudio.style.height = '1px'
      autoAudio.style.opacity = '0.001'
      autoAudio.style.pointerEvents = 'none'
      autoAudio.style.left = '-9999px'
      document.body.appendChild(autoAudio)
      return autoAudio
    }

    function setMediaPlaybackState(value) {
      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = value
      } catch (_) {}
    }

    function updateMediaMetadata() {
      if (!('mediaSession' in navigator) || !currentWord.value) return
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentWord.value.word,
          artist: currentWord.value.meaning,
          album: `TOEIC DAY ${selectedDay.value} · ${currentIndex.value + 1}/${dayWords.value.length}`
        })
      } catch (_) {}
    }

    function revokeTrack() {
      if (autoTrackUrl) {
        try { URL.revokeObjectURL(autoTrackUrl) } catch (_) {}
      }
      autoTrackUrl = ''
      autoTrackKey = ''
      autoTrackDay = 0
      autoTrackStartIndex = 0
      autoTimeline = []
    }

    function stopAutoAudio(clearTrack = false) {
      if (autoAudio) {
        try { autoAudio.pause() } catch (_) {}
        autoAudio.ontimeupdate = null
        autoAudio.onended = null
        autoAudio.onerror = null
        if (clearTrack) {
          try { autoAudio.removeAttribute('src'); autoAudio.load() } catch (_) {}
        }
      }
      autoPlay.value = false
      setMediaPlaybackState('paused')
      if (clearTrack) revokeTrack()
    }

    function ttsApiUrl(text, lang) {
      return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(String(text || '').slice(0, 190))}`
    }

    function openAudioDb() {
      return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return resolve(null)
        const req = indexedDB.open('toeic-audio-cache-v1', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks')
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }

    async function getCachedTrack(key) {
      try {
        const db = await openAudioDb()
        if (!db) return null
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('tracks', 'readonly')
          const req = tx.objectStore('tracks').get(key)
          req.onsuccess = () => resolve(req.result || null)
          req.onerror = () => reject(req.error)
        })
      } catch (_) {
        return null
      }
    }

    async function putCachedTrack(key, value) {
      try {
        const db = await openAudioDb()
        if (!db) return
        await new Promise((resolve, reject) => {
          const tx = db.transaction('tracks', 'readwrite')
          tx.objectStore('tracks').put(value, key)
          tx.oncomplete = resolve
          tx.onerror = () => reject(tx.error)
        })
      } catch (_) {}
    }

    async function mapLimit(list, limit, worker) {
      const results = new Array(list.length)
      let cursor = 0
      const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
        while (true) {
          const i = cursor++
          if (i >= list.length) return
          results[i] = await worker(list[i], i)
        }
      })
      await Promise.all(runners)
      return results
    }

    async function fetchDecodedClip(ctx, text, lang) {
      const response = await fetch(ttsApiUrl(text, lang), { cache: 'force-cache' })
      if (!response.ok) throw new Error(`TTS ${response.status}`)
      const buffer = await response.arrayBuffer()
      return await ctx.decodeAudioData(buffer.slice(0))
    }

    function encodeWav(audioBuffer) {
      const channel = audioBuffer.getChannelData(0)
      const sampleRate = audioBuffer.sampleRate
      const dataLength = channel.length * 2
      const array = new ArrayBuffer(44 + dataLength)
      const view = new DataView(array)
      const write = (offset, value) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
      }
      write(0, 'RIFF')
      view.setUint32(4, 36 + dataLength, true)
      write(8, 'WAVE')
      write(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, sampleRate, true)
      view.setUint32(28, sampleRate * 2, true)
      view.setUint16(32, 2, true)
      view.setUint16(34, 16, true)
      write(36, 'data')
      view.setUint32(40, dataLength, true)
      let offset = 44
      for (let i = 0; i < channel.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, channel[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      }
      return new Blob([array], { type: 'audio/wav' })
    }

    async function buildContinuousTrack(startIndex) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!AudioCtx || !OfflineCtx) throw new Error('오디오 변환을 지원하지 않는 브라우저입니다.')

      const list = dayWords.value.slice(startIndex)
      if (!list.length) throw new Error('재생할 단어가 없습니다.')
      const key = `day${selectedDay.value}-from${startIndex}-en${speechRate.value}-ko${koreanRate.value}-v2`
      const cached = await getCachedTrack(key)
      if (cached?.blob && cached?.timeline) return { ...cached, key }

      autoPreparing.value = true
      autoBuildProgress.value = 1
      const ctx = new AudioCtx()
      try {
        let completed = 0
        const clips = await mapLimit(list, 3, async item => {
          const [en, ko] = await Promise.all([
            fetchDecodedClip(ctx, item.word, 'en-US'),
            fetchDecodedClip(ctx, item.meaning, 'ko-KR')
          ])
          completed += 1
          autoBuildProgress.value = Math.max(2, Math.round(completed / list.length * 70))
          return { en, ko }
        })

        const enGap = 0.22
        const wordGap = 0.62
        let totalDuration = 0
        const timeline = []
        clips.forEach((clip, i) => {
          const enDuration = clip.en.duration / Math.max(0.65, speechRate.value)
          const koDuration = clip.ko.duration / Math.max(0.7, koreanRate.value)
          const start = totalDuration
          totalDuration += enDuration + enGap + koDuration + wordGap
          timeline.push({ index: startIndex + i, start, end: totalDuration })
        })

        const sampleRate = 24000
        const offline = new OfflineCtx(1, Math.max(1, Math.ceil(totalDuration * sampleRate)), sampleRate)
        let cursor = 0
        clips.forEach(clip => {
          const en = offline.createBufferSource()
          en.buffer = clip.en
          en.playbackRate.value = Math.max(0.65, speechRate.value)
          en.connect(offline.destination)
          en.start(cursor)
          cursor += clip.en.duration / Math.max(0.65, speechRate.value) + enGap

          const ko = offline.createBufferSource()
          ko.buffer = clip.ko
          ko.playbackRate.value = Math.max(0.7, koreanRate.value)
          ko.connect(offline.destination)
          ko.start(cursor)
          cursor += clip.ko.duration / Math.max(0.7, koreanRate.value) + wordGap
        })

        autoBuildProgress.value = 78
        const rendered = await offline.startRendering()
        autoBuildProgress.value = 92
        const blob = encodeWav(rendered)
        const value = { blob, timeline, day: selectedDay.value, startIndex, createdAt: Date.now() }
        await putCachedTrack(key, value)
        autoBuildProgress.value = 100
        return { ...value, key }
      } finally {
        try { await ctx.close() } catch (_) {}
        autoPreparing.value = false
      }
    }

    function attachTrack(track) {
      stopAutoAudio(true)
      const audio = ensureAutoAudio()
      autoTrackUrl = URL.createObjectURL(track.blob)
      autoTrackKey = track.key
      autoTrackDay = track.day
      autoTrackStartIndex = track.startIndex
      autoTimeline = track.timeline
      audio.src = autoTrackUrl
      audio.playbackRate = 1
      audio.currentTime = 0

      audio.ontimeupdate = () => {
        if (!autoTimeline.length) return
        const t = audio.currentTime
        const point = autoTimeline.find(p => t >= p.start && t < p.end) || autoTimeline[autoTimeline.length - 1]
        if (point && point.index !== currentIndex.value) {
          currentIndex.value = point.index
          state.value.lastIndex = point.index
          save()
          updateMediaMetadata()
        }
      }
      audio.onended = () => {
        const last = autoTimeline[autoTimeline.length - 1]
        if (last) {
          currentIndex.value = last.index
          state.value.lastIndex = last.index
          save()
        }
        autoPlay.value = false
        setMediaPlaybackState('paused')
      }
      audio.onerror = () => {
        autoPlay.value = false
        setMediaPlaybackState('paused')
      }
    }

    async function startContinuousAuto() {
      if (autoPreparing.value) return
      if (autoAudio && autoTrackDay === selectedDay.value && autoTrackUrl && autoAudio.currentTime > 0 && !autoAudio.ended) {
        autoPlay.value = true
        updateMediaMetadata()
        setMediaPlaybackState('playing')
        await autoAudio.play()
        return
      }

      const startIndex = currentIndex.value
      try {
        const track = await buildContinuousTrack(startIndex)
        attachTrack(track)
        autoPlay.value = true
        updateMediaMetadata()
        setMediaPlaybackState('playing')
        await autoAudio.play()
      } catch (error) {
        console.error(error)
        autoPlay.value = false
        autoPreparing.value = false
        setMediaPlaybackState('paused')
        alert('백그라운드 오디오를 준비하지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.')
      }
    }

    async function toggleAutoPlay() {
      if (autoPreparing.value) return
      if (autoPlay.value) {
        if (autoAudio) autoAudio.pause()
        autoPlay.value = false
        setMediaPlaybackState('paused')
        return
      }
      await startContinuousAuto()
    }

    function seekPrepared(step) {
      if (!autoAudio || !autoTimeline.length || autoTrackDay !== selectedDay.value) return false
      const next = currentIndex.value + step
      const point = autoTimeline.find(p => p.index === next)
      if (!point) return false
      currentIndex.value = next
      state.value.lastIndex = next
      autoAudio.currentTime = point.start
      save()
      updateMediaMetadata()
      return true
    }

    function setupMediaSession() {
      if (!('mediaSession' in navigator)) return
      const setHandler = (name, handler) => {
        try { navigator.mediaSession.setActionHandler(name, handler) } catch (_) {}
      }
      setHandler('play', () => startContinuousAuto())
      setHandler('pause', () => {
        if (autoAudio) autoAudio.pause()
        autoPlay.value = false
        setMediaPlaybackState('paused')
      })
      setHandler('nexttrack', () => move(1))
      setHandler('previoustrack', () => move(-1))
      setHandler('stop', () => stopAutoAudio(false))
    }

    function speak(text) {
      if (autoPlay.value && autoAudio) autoAudio.pause()
      autoPlay.value = false
      setMediaPlaybackState('paused')
      speakText(text, 'en-US', speechRate.value)
    }

    function speakMeaning(text) {
      if (autoPlay.value && autoAudio) autoAudio.pause()
      autoPlay.value = false
      setMediaPlaybackState('paused')
      speakText(text, 'ko-KR', koreanRate.value)
    }

    function clearPreparedTrack() {
      stopAutoAudio(true)
      autoPreparing.value = false
      autoBuildProgress.value = 0
    }

    function openDay(day, index = 0) {
      clearPreparedTrack()
      selectedDay.value = day
      const list = words.value.filter(w => w.day === day)
      currentIndex.value = Math.max(0, Math.min(index, list.length - 1))
      state.value.lastDay = day
      state.value.lastIndex = currentIndex.value
      activeView.value = 'study'
      save()
      nextTick(() => { if (autoSpeak.value) speakText(currentWord.value?.word, 'en-US', speechRate.value) })
    }

    function openWord(item) {
      const idx = words.value.filter(w => w.day === item.day).findIndex(w => w.id === item.id)
      openDay(item.day, idx)
    }

    function continueStudy() {
      openDay(state.value.lastDay || 1, state.value.lastIndex || 0)
    }

    function move(step) {
      const next = currentIndex.value + step
      if (next < 0 || next >= dayWords.value.length) return
      if (seekPrepared(step)) return

      clearPreparedTrack()
      currentIndex.value = next
      state.value.lastIndex = next
      save()
      nextTick(() => { if (autoSpeak.value) speakText(currentWord.value?.word, 'en-US', speechRate.value) })
    }

    function mark(status) {
      if (!currentWord.value) return
      state.value.status[currentWord.value.id] = status
      if (status === 'known') state.value.wrong = state.value.wrong.filter(id => id !== currentWord.value.id)
      save()
      if (currentIndex.value < dayWords.value.length - 1) setTimeout(() => move(1), 120)
    }

    function toggleMeaning() {
      showMeaning.value = !showMeaning.value
      save()
    }

    function randomize(list) {
      const copy = [...list]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }

    function makeQuiz(day = selectedDay.value) {
      clearPreparedTrack()
      selectedDay.value = day
      const pool = words.value.filter(w => w.day === day)
      if (!pool.length) return
      const target = pool[Math.floor(Math.random() * pool.length)]
      const distractors = randomize(words.value.filter(w => w.id !== target.id && w.meaning !== target.meaning)).slice(0, 3)
      quiz.value = { target, options: randomize([target, ...distractors]).map(w => ({ id: w.id, meaning: w.meaning })) }
      quizAnswer.value = null
      quizFinished.value = false
      activeView.value = 'quiz'
      saveUi()
      if (autoSpeak.value) setTimeout(() => speakText(target.word, 'en-US', speechRate.value), 80)
    }

    function answerQuiz(option) {
      if (quizAnswer.value !== null) return
      quizAnswer.value = option.id
      quizFinished.value = true
      if (option.id !== quiz.value.target.id) {
        state.value.wrong = Array.from(new Set([...state.value.wrong, quiz.value.target.id]))
        state.value.status[quiz.value.target.id] = 'unknown'
      } else {
        state.value.status[quiz.value.target.id] = 'known'
        state.value.wrong = state.value.wrong.filter(id => id !== quiz.value.target.id)
      }
      save()
    }

    function optionClass(option) {
      if (!quizFinished.value) return ''
      if (option.id === quiz.value.target.id) return 'correct'
      if (option.id === quizAnswer.value) return 'wrong'
      return ''
    }

    function studyReview() {
      const first = reviewWords.value[0]
      if (first) openWord(first)
    }

    function resetProgress() {
      if (!confirm('외운 단어와 오답 기록을 모두 초기화할까요?')) return
      state.value = { status: {}, wrong: [], lastDay: 1, lastIndex: 0 }
      save()
    }

    function onTouchStart(e) { touchStartX.value = e.changedTouches[0].clientX }
    function onTouchEnd(e) {
      const diff = e.changedTouches[0].clientX - touchStartX.value
      if (Math.abs(diff) < 45) return
      if (diff < 0) move(1)
      else move(-1)
    }

    watch([selectedDay, currentIndex], () => {
      if (!ready.value) return
      state.value.lastDay = selectedDay.value
      state.value.lastIndex = currentIndex.value
      save()
      updateMediaMetadata()
    })

    watch([speechRate, koreanRate, autoSpeak, showMeaning], () => {
      if (!ready.value) return
      save()
      if (autoTrackUrl) clearPreparedTrack()
    })

    watch(searchText, () => { if (ready.value) saveUi() })
    watch([quiz, quizAnswer, quizFinished], () => { if (ready.value) saveUi() }, { deep: true })

    watch(activeView, view => {
      if (view !== 'study' && (autoPlay.value || autoTrackUrl)) clearPreparedTrack()
      if (ready.value) saveUi()
    })

    function restoreViewAfterData() {
      const hashView = location.hash.replace('#', '')
      const wantedView = VALID_VIEWS.includes(hashView)
        ? hashView
        : (restoredUi && VALID_VIEWS.includes(restoredUi.activeView) ? restoredUi.activeView : 'home')

      const wantedDay = Number(restoredUi?.selectedDay || state.value.lastDay || 1)
      selectedDay.value = Math.min(30, Math.max(1, wantedDay))
      const maxIndex = Math.max(0, words.value.filter(w => w.day === selectedDay.value).length - 1)
      currentIndex.value = Math.min(Math.max(0, Number(restoredUi?.currentIndex ?? state.value.lastIndex ?? 0)), maxIndex)

      if (wantedView === 'quiz' && !quiz.value) activeView.value = 'study'
      else activeView.value = wantedView
    }

    onMounted(async () => {
      load()
      setupMediaSession()

      window.addEventListener('hashchange', () => {
        const view = location.hash.replace('#', '')
        if (ready.value && VALID_VIEWS.includes(view) && view !== activeView.value) activeView.value = view
      })

      try {
        const dataFiles = [
          '/data/words-01-03.json',
          '/data/words-04-06.json',
          '/data/words-07-09.json',
          '/data/words-10-12.json',
          '/data/words-13-15.json',
          '/data/words-16-18.json',
          '/data/words-19-21.json',
          '/data/words-22-24.json',
          '/data/words-25-27.json',
          '/data/words-28-30.json'
        ]
        const responses = await Promise.all(dataFiles.map(path => fetch(path)))
        if (responses.some(response => !response.ok)) throw new Error('단어 데이터를 불러오지 못했습니다.')
        const bundles = (await Promise.all(responses.map(response => response.json()))).flat()
        let id = 1
        words.value = bundles.flatMap(group =>
          group.words.map(([word, meaning], index) => ({
            id: id++,
            day: group.day,
            number: index + 1,
            topic: group.topic,
            word,
            meaning
          }))
        )
        if (words.value.length !== 2078) throw new Error(`단어 수 검증 실패: ${words.value.length}`)
      } catch (error) {
        console.error(error)
        alert('단어 데이터를 불러오지 못했습니다. 인터넷 연결 후 새로고침해 주세요.')
      }

      restoreViewAfterData()
      ready.value = true
      state.value.lastDay = selectedDay.value
      state.value.lastIndex = currentIndex.value
      updateMediaMetadata()
      saveUi()
    })

    window.addEventListener('beforeunload', () => {
      saveUi()
      if (autoTrackUrl) {
        try { URL.revokeObjectURL(autoTrackUrl) } catch (_) {}
      }
    })

    return {
      words, activeView, selectedDay, currentIndex, showMeaning, autoSpeak, autoPlay, autoPreparing, autoBuildProgress,
      speechRate, koreanRate, searchText, quiz, quizAnswer, quizFinished, state, dayTopics, dayWords, currentWord,
      knownIds, reviewWords, overallPercent, filteredWords, dayProgress, speak, speakMeaning, openDay, openWord,
      continueStudy, move, mark, toggleMeaning, toggleAutoPlay, makeQuiz, answerQuiz, optionClass, studyReview,
      resetProgress, onTouchStart, onTouchEnd
    }
  }
}).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
