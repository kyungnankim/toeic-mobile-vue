const { createApp, computed, nextTick, onMounted, ref, watch } = Vue

createApp({
  setup() {
    const STORAGE_KEY = 'toeic-30day-progress-v2'
    const SETTINGS_KEY = 'toeic-30day-settings-v3'
    const words = ref([])
    const activeView = ref('home')
    const selectedDay = ref(1)
    const currentIndex = ref(0)
    const showMeaning = ref(true)
    const autoSpeak = ref(true)
    const autoPlay = ref(false)
    const speechRate = ref(0.9)
    const koreanRate = ref(0.95)
    const searchText = ref('')
    const quiz = ref(null)
    const quizAnswer = ref(null)
    const quizFinished = ref(false)
    const touchStartX = ref(0)
    const ready = ref(false)

    let sequenceId = 0
    let autoTimer = null

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

    function save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        showMeaning: showMeaning.value,
        autoSpeak: autoSpeak.value,
        speechRate: speechRate.value,
        koreanRate: koreanRate.value
      }))
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
      } catch (_) {}
    }

    function clearAutoTimer() {
      if (autoTimer) {
        clearTimeout(autoTimer)
        autoTimer = null
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
      window.speechSynthesis.speak(utter)
    }

    function cancelSequence(keepAutoPlay = false) {
      sequenceId += 1
      clearAutoTimer()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
      if (!keepAutoPlay) autoPlay.value = false
    }

    function speak(text) {
      cancelSequence(false)
      speakText(text, 'en-US', speechRate.value)
    }

    function speakMeaning(text) {
      cancelSequence(false)
      speakText(text, 'ko-KR', koreanRate.value)
    }

    function runAutoSequence() {
      if (!autoPlay.value || activeView.value !== 'study' || !currentWord.value) return
      cancelSequence(true)
      const token = sequenceId
      const item = currentWord.value

      speakText(item.word, 'en-US', speechRate.value, () => {
        if (!autoPlay.value || token !== sequenceId) return
        autoTimer = setTimeout(() => {
          if (!autoPlay.value || token !== sequenceId) return
          speakText(item.meaning, 'ko-KR', koreanRate.value, () => {
            if (!autoPlay.value || token !== sequenceId) return
            autoTimer = setTimeout(() => {
              if (!autoPlay.value || token !== sequenceId) return
              if (currentIndex.value >= dayWords.value.length - 1) {
                autoPlay.value = false
                clearAutoTimer()
                return
              }
              currentIndex.value += 1
              state.value.lastIndex = currentIndex.value
              save()
              nextTick(() => runAutoSequence())
            }, 750)
          }, false)
        }, 350)
      }, false)
    }

    function toggleAutoPlay() {
      if (autoPlay.value) {
        cancelSequence(false)
        return
      }
      autoPlay.value = true
      runAutoSequence()
    }

    function openDay(day, index = 0) {
      cancelSequence(false)
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
      const wasAuto = autoPlay.value
      cancelSequence(wasAuto)
      const next = currentIndex.value + step
      if (next < 0 || next >= dayWords.value.length) {
        if (wasAuto) autoPlay.value = false
        return
      }
      currentIndex.value = next
      state.value.lastIndex = next
      save()
      nextTick(() => {
        if (wasAuto) runAutoSequence()
        else if (autoSpeak.value) speakText(currentWord.value?.word, 'en-US', speechRate.value)
      })
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
      cancelSequence(false)
      selectedDay.value = day
      const pool = words.value.filter(w => w.day === day)
      if (!pool.length) return
      const target = pool[Math.floor(Math.random() * pool.length)]
      const distractors = randomize(words.value.filter(w => w.id !== target.id && w.meaning !== target.meaning)).slice(0, 3)
      quiz.value = { target, options: randomize([target, ...distractors]).map(w => ({ id: w.id, meaning: w.meaning })) }
      quizAnswer.value = null
      quizFinished.value = false
      activeView.value = 'quiz'
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
    })

    watch([speechRate, koreanRate, autoSpeak], () => {
      if (ready.value) save()
    })

    watch(activeView, view => {
      if (view !== 'study' && autoPlay.value) cancelSequence(false)
    })

    onMounted(async () => {
      load()
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
      selectedDay.value = state.value.lastDay || 1
      const maxIndex = Math.max(0, words.value.filter(w => w.day === selectedDay.value).length - 1)
      currentIndex.value = Math.min(state.value.lastIndex || 0, maxIndex)
      ready.value = true
    })

    return {
      words, activeView, selectedDay, currentIndex, showMeaning, autoSpeak, autoPlay, speechRate, koreanRate, searchText,
      quiz, quizAnswer, quizFinished, state, dayTopics, dayWords, currentWord, knownIds, reviewWords,
      overallPercent, filteredWords, dayProgress, speak, speakMeaning, openDay, openWord, continueStudy, move, mark,
      toggleMeaning, toggleAutoPlay, makeQuiz, answerQuiz, optionClass, studyReview, resetProgress, onTouchStart, onTouchEnd
    }
  }
}).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
