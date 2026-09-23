/**
 * MECH-GUARD — the phone reflow's Urgent card treatment (#580) must actually WIN the cascade
 * against the archive's own flat-surface floor, not just carry a matching class name.
 *
 * signal-table-presentation.tsx imports its own CSS BEFORE collection-grammar.css. That grammar
 * file's flat-floor rule (`.signal-collection-presentation .dt-card { box-shadow: none }`,
 * pinned by guard-signal-title-clamp.css.test.ts) loads SECOND — so any urgent-card rule tied
 * with it on specificity loses the box-shadow entirely on import order, no matter what the rule
 * says. That is exactly what shipped first: `.dt-card.signal-table-row--urgent` is two classes
 * (specificity 0-2-0), identical to the flat-floor selector's 0-2-0, so the later-loaded floor
 * rule won and silently deleted the 2px warning rule while the amber fill (a separate
 * `background` declaration, untouched by the floor rule) survived — the bug read as "half
 * fixed," not "broken," which is why it shipped.
 *
 * jsdom applies no cascade, so this reads both stylesheets as text and computes real CSS
 * specificity (classes/attrs/pseudo-classes only — every selector here is class-only) to prove
 * the urgent rule's specificity is STRICTLY GREATER than the flat floor's, independent of import
 * order. Reverting the urgent selector to the bare two-class form fails this test.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Class-selector specificity as a class count (every selector under test is class-only: no ids,
 * no elements, no pseudo-elements) — sufficient to order two class-only selectors correctly. */
function classSpecificity(selector: string): number {
  return (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).length
}

/** The selector text of the first rule whose selector list matches `pattern`. */
function ruleSelector(css: string, pattern: RegExp): string | null {
  const m = pattern.exec(css)
  return m ? m[0].replace(/\s*\{$/, '').trim() : null
}

const presentationCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/signals/signal-table-presentation.css'), 'utf8'),
)
const grammarCss = stripComments(
  readFileSync(resolve(process.cwd(), 'src/components/collection-grammar.css'), 'utf8'),
)
const presentationSource = readFileSync(
  resolve(process.cwd(), 'src/components/signals/signal-table-presentation.tsx'),
  'utf8',
)

describe('GUARD: the #580 Urgent phone-card rule beats the archive flat-surface floor', () => {
  it('signal-table-presentation.css imports before collection-grammar.css (so a SPECIFICITY tie would let the floor win)', () => {
    const presentationImport = presentationSource.indexOf("'./signal-table-presentation.css'")
    const grammarImport = presentationSource.indexOf("'@/components/collection-grammar.css'")
    expect(presentationImport).toBeGreaterThan(-1)
    expect(grammarImport).toBeGreaterThan(-1)
    expect(presentationImport).toBeLessThan(grammarImport)
  })

  it('the flat-floor rule strips box-shadow at a known specificity', () => {
    const floorSelector = ruleSelector(grammarCss, /\.signal-collection-presentation \.dt-card\s*\{[^}]*box-shadow:\s*none[^}]*\}/s)
    expect(floorSelector, 'collection-grammar.css must still carry the flat-floor .dt-card rule').not.toBeNull()
    expect(classSpecificity(floorSelector!)).toBe(2)
  })

  it('the urgent-card selector outranks the flat floor — a bare `.dt-card.signal-table-row--urgent` (tied specificity) would lose on import order', () => {
    const urgentSelector = ruleSelector(presentationCss, /[^\n{}]*dt-card\.signal-table-row--urgent\s*\{/)
    expect(urgentSelector, 'signal-table-presentation.css must define the phone-card urgent rule').not.toBeNull()
    expect(classSpecificity(urgentSelector!)).toBeGreaterThan(2)
  })

  it('the urgent-card rule keeps its own box-shadow declaration (the thing the floor rule would otherwise erase)', () => {
    const body = presentationCss.match(/[^\n{}]*dt-card\.signal-table-row--urgent\s*\{([^}]*)\}/s)?.[1]
    expect(body, 'the urgent-card rule body must exist').toBeDefined()
    expect(body!).toMatch(/box-shadow:\s*inset 2px 0 0 0 var\(--warning\)/)
    // The archive card is flat by the same floor this rule must beat — it must never re-introduce
    // a resting shadow the floor was written to remove.
    expect(body!).not.toMatch(/--shadow-rest/)
  })
})
