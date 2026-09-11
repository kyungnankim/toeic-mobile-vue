(() => {
  window.EbookComponents = window.EbookComponents || {}

  window.EbookComponents.PrepView = {
    name: 'PrepView',
    components: { ChapterSelector: window.EbookComponents.ChapterSelector },
    props: {
      book: { type: Object, required: true },
      chapter: { type: Number, required: true },
      study: { type: Object, required: true },
      learnedVocab: { type: Array, default: () => [] },
      learnedGrammar: { type: Array, default: () => [] },
      examples: { type: Object, default: () => ({}) },
      progress: { type: Number, default: 0 }
    },
    emits: ['change-chapter', 'toggle-vocab', 'toggle-grammar', 'speak', 'go-reader'],
    methods: {
      hasVocab(index) { return this.learnedVocab.includes(index) },
      hasGrammar(index) { return this.learnedGrammar.includes(index) }
    },
    template: `
      <div class="prep-panel-component">
        <section class="chapter-control card compact-card">
          <div class="control-head"><strong>읽기 전 학습</strong><span>{{ progress }}%</span></div>
          <chapter-selector prefix="prep" :chapter="chapter" :chapters="book.chapters" @change="$emit('change-chapter', $event)" />
        </section>
        <section class="study-section card">
          <div class="study-title"><h2>단어</h2><span>{{ study.vocabulary.length }}개</span></div>
          <div class="vocab-list">
            <article v-for="(v, i) in study.vocabulary" :key="v.word" class="vocab-item" :class="{ learned: hasVocab(i) }">
              <div class="vocab-top">
                <button class="vocab-word-btn" type="button" @click="$emit('speak', v.word)"><b>{{ v.word }}</b><p class="meaning">{{ v.meaning }}</p></button>
                <button class="vocab-done" type="button" @click="$emit('toggle-vocab', i)">{{ hasVocab(i) ? '완료' : '체크' }}</button>
              </div>
              <p v-if="examples[i]" class="source-example">{{ examples[i] }}</p>
            </article>
          </div>
        </section>
        <section class="study-section card">
          <div class="study-title"><h2>문법</h2><span>{{ study.grammar.length }}개</span></div>
          <div class="grammar-list">
            <article v-for="(g, i) in study.grammar" :key="g.title" class="grammar-item">
              <h3>{{ g.title }}</h3><span class="pattern">{{ g.pattern }}</span><p>{{ g.meaning }}</p>
              <label class="grammar-check"><input type="checkbox" :checked="hasGrammar(i)" @change="$emit('toggle-grammar', i, $event.target.checked)"> 이해했어요</label>
            </article>
          </div>
        </section>
        <button class="finish-prep" type="button" @click="$emit('go-reader')">이 챕터 읽기</button>
      </div>
    `
  }
})()
