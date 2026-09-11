(() => {
  window.EbookComponents = window.EbookComponents || {}

  const SentenceCard = {
    name: 'SentenceCard',
    props: { line: { type: Object, required: true }, showKorean: { type: Boolean, default: true } },
    emits: ['speak'],
    template: `
      <article class="line-card">
        <div class="line-top">
          <span class="line-no">{{ String(line.id).padStart(3, '0') }}</span>
          <button class="line-speak" type="button" aria-label="문장 듣기" @click="$emit('speak', line.en)">
            <svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          </button>
        </div>
        <p class="line-en">{{ line.en }}</p>
        <p v-if="showKorean && line.ko" class="line-ko">{{ line.ko }}</p>
      </article>
    `
  }

  window.EbookComponents.ReaderView = {
    name: 'ReaderView',
    components: { ChapterSelector: window.EbookComponents.ChapterSelector, SentenceCard },
    props: {
      book: { type: Object, required: true },
      chapter: { type: Number, required: true },
      chapterData: { type: Object, default: null },
      lines: { type: Array, default: () => [] },
      visibleCount: { type: Number, default: 20 },
      readMode: { type: String, default: 'line' },
      showKorean: { type: Boolean, default: true },
      audioPlaying: { type: Boolean, default: false },
      loading: { type: Boolean, default: false },
      status: { type: String, default: '' }
    },
    emits: ['change-chapter', 'set-mode', 'toggle-korean', 'toggle-audio', 'load-more', 'speak'],
    computed: {
      visibleLines() { return this.lines.slice(0, this.visibleCount) },
      roman() { return this.chapterData?.roman || this.chapter },
      hasMore() { return this.visibleCount < this.lines.length }
    },
    template: `
      <div class="reader-panel-component" :class="{ loading }" style="display:grid;gap:18px">
        <section class="reader-top card compact-card">
          <div class="reading-mode" role="tablist" aria-label="읽기 방식">
            <button type="button" :class="{ active: readMode === 'line' }" @click="$emit('set-mode', 'line')">한 줄씩 읽기</button>
            <button type="button" :class="{ active: readMode === 'full' }" @click="$emit('set-mode', 'full')">영어 전체 읽기</button>
          </div>
          <chapter-selector prefix="reader" :chapter="chapter" :chapters="book.chapters" @change="$emit('change-chapter', $event)" />
          <div class="reader-actions">
            <button class="audio-main-btn" :class="{ playing: audioPlaying }" type="button" @click="$emit('toggle-audio')">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7-11-7Z"/></svg><span>{{ audioPlaying ? '듣기 정지' : '챕터 듣기' }}</span>
            </button>
            <button v-if="readMode === 'line'" class="korean-toggle" type="button" @click="$emit('toggle-korean')">
              <svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg><span>{{ showKorean ? '한국어 숨기기' : '한국어 보이기' }}</span>
            </button>
          </div>
        </section>
        <section class="chapter-head">
          <div><p>CHAPTER {{ roman }}</p><h2>{{ book.title }}</h2></div><span>{{ lines.length }}문장</span>
        </section>
        <section v-if="readMode === 'line'">
          <section class="reader-lines"><sentence-card v-for="line in visibleLines" :key="line.id" :line="line" :show-korean="showKorean" @speak="$emit('speak', $event)" /></section>
          <button v-if="hasMore" class="load-more" type="button" @click="$emit('load-more')">다음 문장 더 보기</button>
        </section>
        <section v-else class="full-reader-view">
          <article class="full-english-text"><p v-for="(paragraph, i) in chapterData?.paragraphs || []" :key="i">{{ paragraph }}</p></article>
        </section>
        <div class="reader-status" aria-live="polite">{{ status }}</div>
      </div>
    `
  }
})()
