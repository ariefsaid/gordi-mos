import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { attentionSlug, type Attention, type MentionKind } from '@/lib/db/signals.types'

// REGRESSION INVARIANT (design-review step-4, reviewer-mandated): "markup without skin" — a
// component ships a className with no matching CSS rule anywhere the app actually loads it —
// must fail a test, not slip through render-only unit tests that never assert on styling. This
// reads each Signal component's real source + its real CSS file(s) and asserts every class the
// component can produce has a matching `.class` selector. The dynamic (template-literal) class
// names are wired from the app's own enums (Attention/MentionKind in lib/db/signals.types.ts),
// not hand-copied, so a new attention level or mention kind with no CSS rule fails this test too.

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

/** Every class token from a plain `className="a b"` / `class="a b"` literal in the source
 * (skips `className={...}` expressions — those are handled per-suite via `extraClasses`,
 * since they're the small, enumerable set of dynamic modifier classes below). */
function staticClassTokens(src: string): string[] {
  const out = new Set<string>()
  for (const m of src.matchAll(/class(?:Name)?="([^"{}]+)"/g)) {
    for (const tok of m[1].trim().split(/\s+/)) if (tok) out.add(tok)
  }
  return [...out]
}

const ATTENTION_VALUES: Attention[] = ['FYI', 'Needs attention', 'Urgent']
// signal-card.tsx / signal-record.tsx: `signal-attention signal-attention--${attentionSlug(...)}`
const SIGNAL_ATTENTION_CLASSES = [
  'signal-attention',
  ...ATTENTION_VALUES.map((a) => `signal-attention--${attentionSlug(a)}`),
]
// signals-archive-page.tsx attentionClass(): `signal-row-attention signal-row-attention--${slug}`
const ARCHIVE_ROW_ATTENTION_CLASSES = [
  'signal-row-attention',
  ...ATTENTION_VALUES.map((a) => `signal-row-attention--${attentionSlug(a)}`),
]
const MENTION_KIND_VALUES: MentionKind[] = ['person', 'team', 'bu']
// signal-mention-picker.tsx: `type-badge type-badge--${kind}`
const TYPE_BADGE_CLASSES = ['type-badge', ...MENTION_KIND_VALUES.map((k) => `type-badge--${k}`)]
// signal-table-presentation.tsx: `signal-table-attention signal-table-attention--${slug}` + row states.
const SIGNAL_TABLE_CLASSES = [
  'signal-table-attention',
  ...ATTENTION_VALUES.map((a) => `signal-table-attention--${attentionSlug(a)}`),
  'signal-table-row--retracted',
  'signal-table-row--needs-attention',
]

interface Suite { component: string; css: string[]; extraClasses?: string[]; ignoreClasses?: string[] }

const SUITES: Suite[] = [
  // signal-card.tsx / signal-feed.tsx deleted as fossils (zero live consumers; interrogation
  // fossil-delete list). Their CSS files remain — category-picker and signal-record share rules.
  { component: 'src/components/signals/signal-table-presentation.tsx', css: ['src/components/signals/signal-table-presentation.css'], extraClasses: SIGNAL_TABLE_CLASSES },
  { component: 'src/components/signals/signal-composer.tsx', css: ['src/components/signals/signal-composer.css'] },
  { component: 'src/components/signals/signal-mention-picker.tsx', css: ['src/components/signals/signal-mention-picker.css'], extraClasses: TYPE_BADGE_CLASSES },
  { component: 'src/components/signals/signal-category-picker.tsx', css: ['src/components/signals/signal-card.css'] },
  {
    component: 'src/components/signals/signal-record.tsx',
    css: ['src/components/signals/signal-record.css', 'src/components/signals/signal-card.css'],
    extraClasses: SIGNAL_ATTENTION_CLASSES,
  },
  { component: 'src/components/signals/signal-record-host.tsx', css: ['src/components/signals/signal-record-host.css'] },
  {
    component: 'src/shell/signal-composer-host.tsx',
    css: ['src/shell/signal-composer-host.css', 'src/styles/drawer.css'],
    // Identity-only companion class riding alongside .drawer-modal-root (which carries all the
    // positioning chrome) — intentionally has no rule of its own.
    ignoreClasses: ['signal-composer-host-root'],
  },
  {
    component: 'src/pages/signals-archive-page.tsx',
    css: ['src/pages/signals-archive-page.css', 'src/styles/drawer.css'],
    extraClasses: ARCHIVE_ROW_ATTENTION_CLASSES,
    ignoreClasses: ['signal-record-drawer-root'],
  },
]

// Class prefixes this suite owns — Button/Select/Toggle/EmptyState/etc render their OWN
// className internally (mk-*, empty-state, …) via their own kit CSS, forwarded through as a
// literal in the component's JSX only incidentally; they're covered by their own component's
// test, not this Signal-surface pairing.
const OWNED_PREFIX = /^(signal-|mention-|type-badge|drawer-|muted-2)/

describe('Signal CSS coverage — every className a Signal component renders has a matching CSS rule (design-review step-4 regression invariant)', () => {
  for (const suite of SUITES) {
    it(`${suite.component} → ${suite.css.join(', ')}`, () => {
      const src = read(suite.component)
      const cssText = suite.css.map(read).join('\n')
      const classes = new Set([...staticClassTokens(src), ...(suite.extraClasses ?? [])])
      const ignore = new Set(suite.ignoreClasses ?? [])
      const owned = [...classes].filter((c) => OWNED_PREFIX.test(c) && !ignore.has(c))
      expect(owned.length).toBeGreaterThan(0) // sanity — the suite must actually exercise something
      for (const cls of owned) {
        const selector = `.${cls}`
        expect(
          cssText.includes(selector),
          `expected ${selector} to be styled in ${suite.css.join(', ')} (rendered by ${suite.component})`,
        ).toBe(true)
      }
    })
  }

  it('no signal CSS file references the mockup-only --e7-* token namespace (design-authority-audit-2026-07-17.md)', () => {
    const allCss = [...new Set(SUITES.flatMap((s) => s.css)), 'src/styles/drawer.css']
    for (const path of [...new Set(allCss)]) {
      // Strip comments first — prose documenting "no --e7-* names" (this very rule's rationale)
      // must not trip the guard; only real token usage (var(--e7-…) or a --e7-… declaration) does.
      const withoutComments = read(path).replace(/\/\*[\s\S]*?\*\//g, '')
      expect(/--e7-/.test(withoutComments), `${path} must not use --e7-* (mockup-only namespace)`).toBe(false)
    }
  })
})
