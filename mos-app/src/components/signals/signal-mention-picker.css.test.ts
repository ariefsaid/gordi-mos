// AA guard — #578: the mention picker's active row painted a solid `--accent` fill over the row
// name, sinking it to low contrast. jsdom can't compute var() chains, so this asserts at the
// CSS-SOURCE level that the active row uses the accent-SUBTLE wash token (the same one the
// sibling category picker's own selected state already uses — signal-card.css
// `.signal-category-option[aria-selected]`), never the solid `--accent` fill.
//
// #855 addendum B3 removed the per-row `.type-badge` (it duplicated the group header's PERSON/
// TEAM/BU label) — the badge-specific contrast-override assertions this file used to carry went
// with it; the "family is genuinely absent" guard below replaces them (same pattern as
// signal-css-coverage.test.ts's retired-class check), so a badge reintroduced without its own
// contrast work would still be caught.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  // Strip CSS comments — the rule's explanatory comment mentions the old token by name.
  return css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('mention-row.is-active — legible badge + name (WCAG-AA)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-mention-picker.css'), 'utf8')
  // The rule now lists `.mention-row.is-active, .mention-row.is-active:hover` (equal-specificity
  // fix, below) — search on the bare class, not a `{`-terminated literal, so this still finds the
  // rule regardless of what else shares its selector list.
  const body = ruleBody(css, '.mention-row.is-active')

  it('uses the --accent-subtle wash, not the solid --accent fill', () => {
    expect(body).toMatch(/background:\s*var\(--accent-subtle\)/)
  })

  it('does NOT use the solid --accent background that swamped the badge + name', () => {
    expect(body).not.toMatch(/background:\s*var\(--accent\)/)
  })

  it('wins over :hover structurally (a combined selector), not by rule order', () => {
    // Equal specificity (one class each) means `:hover` and `.is-active` only resolved by
    // whichever rule comes LAST in the file; `.is-active:hover` in the same rule's selector list
    // makes the active wash win regardless of where a future `:hover` rule lands.
    expect(css).toMatch(/\.mention-row\.is-active:hover/)
  })

  it('[#855 B3] the retired .type-badge family is genuinely absent, not merely unstyled', () => {
    expect(css).not.toMatch(/\.type-badge/)
  })
})
