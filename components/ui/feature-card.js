(() => {
  window.ToeicComponents = window.ToeicComponents || {}

  window.ToeicComponents.FeatureCard = {
    name: 'FeatureCard',
    props: {
      href: { type: String, default: '' },
      title: { type: String, required: true },
      description: { type: String, required: true },
      icon: { type: String, default: 'book' },
      ariaLabel: { type: String, default: '' }
    },
    emits: ['click'],
    computed: {
      tag() { return this.href ? 'a' : 'button' },
      attrs() {
        return this.href
          ? { href: this.href }
          : { type: 'button' }
      }
    },
    template: `
      <component
        :is="tag"
        v-bind="attrs"
        class="lc-feature-card feature-card-component"
        style="text-decoration:none;color:inherit"
        :aria-label="ariaLabel || title"
        @click="$emit('click', $event)"
      >
        <div class="lc-feature-icon" aria-hidden="true">
          <svg v-if="icon === 'sentences'" viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/><path d="m16 14 3 2-3 2v-4Z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5v-16Z"/></svg>
        </div>
        <div class="lc-feature-copy">
          <b>{{ title }}</b>
          <span>{{ description }}</span>
        </div>
        <span class="lc-feature-open" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </component>
    `
  }
})()
