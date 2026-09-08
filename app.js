const { createApp, computed, nextTick, onMounted, ref, watch } = Vue

createApp({
  setup() {
    const STORAGE_KEY = 'toeic-30day-progress-v2'
    const words = ref([])
    const activeView = ref('home')
    const selectedDay = ref(1)
    const currentIndex = ref(0)
    const showMeaning = ref(false)
    const autoSpeak = ref(true)
    const speechRate = ref(0.9)
    const searchText = ref('')
    const quiz = ref(null)
    const quizAnswer = ref(null)
    const quizFinished = ref(false)
    const touchStartX = ref(0)
    const ready = ref(false)

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
    }
    function load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
        if (parsed) state.value = { ...state.value, ...parsed }
      } catch (_) {}
    }
    function speak(text) {
      if (!('speechSynthesis' in window) || !text) return
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = 'en-US'
      utter.rate = speechRate.value
      utter.pitch = 1
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v => v.lang?.toLowerCase().startsWith('en-us')) || voices.find(v => v.lang?.toLowerCase().startsWith('en'))
      if (preferred) utter.voice = preferred
      window.speechSynthesis.speak(utter)
    }
    function openDay(day, index = 0) {
      selectedDay.value = day
      const list = words.value.filter(w => w.day === day)
      currentIndex.value = Math.max(0, Math.min(index, list.length - 1))
      showMeaning.value = false
      state.value.lastDay = day
      state.value.lastIndex = currentIndex.value
      activeView.value = 'study'
      save()
      nextTick(() => { if (autoSpeak.value) speak(currentWord.value?.word) })
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
      currentIndex.value = next
      showMeaning.value = false
      state.value.lastIndex = next
      save()
      if (autoSpeak.value) speak(currentWord.value?.word)
    }
    function mark(status) {
      if (!currentWord.value) return
      state.value.status[currentWord.value.id] = status
      if (status === 'known') state.value.wrong = state.value.wrong.filter(id => id !== currentWord.value.id)
      save()
      if (currentIndex.value < dayWords.value.length - 1) setTimeout(() => move(1), 120)
    }
    function toggleMeaning() { showMeaning.value = !showMeaning.value }
    function randomize(list) {
      const copy = [...list]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }
    function makeQuiz(day = selectedDay.value) {
      selectedDay.value = day
      const pool = words.value.filter(w => w.day === day)
      if (!pool.length) return
      const target = pool[Math.floor(Math.random() * pool.length)]
      const distractors = randomize(words.value.filter(w => w.id !== target.id && w.meaning !== target.meaning)).slice(0, 3)
      quiz.value = { target, options: randomize([target, ...distractors]).map(w => ({ id: w.id, meaning: w.meaning })) }
      quizAnswer.value = null
      quizFinished.value = false
      activeView.value = 'quiz'
      if (autoSpeak.value) setTimeout(() => speak(target.word), 80)
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

    onMounted(async () => {
      load()
      try {
        const dataFiles = [
          '/data/words-01-05.json',
          '/data/words-06-10.json',
          '/data/words-11-15.json',
          '/data/words-16-20.json',
          '/data/words-21-25.json',
          '/data/words-26-30.json'
        ]
        const responses = await Promise.all(dataFiles.map(path => fetch(path)))
        if (responses.some(response => !response.ok)) throw new Error('단어 데이터를 불러오지 못했습니다.')
        words.value = (await Promise.all(responses.map(response => response.json()))).flat()
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
      words, activeView, selectedDay, currentIndex, showMeaning, autoSpeak, speechRate, searchText,
      quiz, quizAnswer, quizFinished, state, dayTopics, dayWords, currentWord, knownIds, reviewWords,
      overallPercent, filteredWords, dayProgress, speak, openDay, openWord, continueStudy, move, mark,
      toggleMeaning, makeQuiz, answerQuiz, optionClass, studyReview, resetProgress, onTouchStart, onTouchEnd
    }
  }
}).mount('#app')

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
