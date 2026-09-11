(() => {
  window.EbookComponents = window.EbookComponents || {}

  window.EbookComponents.ChapterSelector = {
    name: 'ChapterSelector',
    props: {
      chapter: { type: Number, required: true },
      chapters: { type: Number, required: true },
      prefix: { type: String, default: 'chapter' }
    },
    emits: ['change'],
    methods: {
      change(value) { this.$emit('change', Number(value)) },
      previous() { this.change(Math.max(1, this.chapter - 1)) },
      next() { this.change(Math.min(this.chapters, this.chapter + 1)) }
    },
    template: `
      <div class="chapter-row">
        <button class="square-btn" type="button" aria-label="이전 챕터" :disabled="chapter <= 1" @click="previous">
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <label class="chapter-select-wrap">
          <span>CHAPTER</span>
          <select :id="prefix + 'ChapterSelect'" :value="chapter" @change="change($event.target.value)">
            <option v-for="n in chapters" :key="n" :value="n">Chapter {{ n }}</option>
          </select>
        </label>
        <button class="square-btn" type="button" aria-label="다음 챕터" :disabled="chapter >= chapters" @click="next">
          <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    `
  }
})()
