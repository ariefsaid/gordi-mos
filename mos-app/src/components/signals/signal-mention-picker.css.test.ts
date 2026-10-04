// AA guard — #578: the mention picker's active row painted a solid `--accent` fill over the row
// name, sinking it to low contrast. jsdom can't compute var() chains, so this asserts at the
// CSS-SOURCE level that the active row uses the accent-SUBTLE wash token (the same one the
// sibling category picker's own selected state already uses — signal-card.css
// `.signal-category-option[aria-selected]`), never the solid `--accent` fill.
//
// The per-row `.type-badge` is retired (it duplicated the group header's PERSON/TEAM/BU label) —
// the guard below (same pattern as signal-css-coverage.test.ts's retired-class check) keeps it
// genuinely absent, so a badge reintroduced without its own contrast work would still be caught.
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

  it('the retired .type-badge family is genuinely absent, not merely unstyled', () => {
    expect(css).not.toMatch(/\.type-badge/)
  })
})

describe('mention popup stays inside its collision-bounded viewport', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-mention-picker.css'), 'utf8')

  it('leaves popup positioning to the adopted overlay and clamps its width to available space', () => {
    const popup = ruleBody(css, '.mention-pop')
    expect(popup).not.toMatch(/position:\s*absolute/)
    expect(popup).toMatch(/max-width:\s*min\(320px,\s*calc\(100vw - 24px\),\s*var\(--radix-popover-content-available-width/)
  })

  it('bounds list scrolling to the available popup height', () => {
    const list = ruleBody(css, '.mention-pop__list')
    expect(list).toMatch(/max-height:\s*min\(280px,\s*var\(--radix-popover-content-available-height/)
    expect(list).toMatch(/overflow-y:\s*auto/)
    expect(list).toMatch(/overscroll-behavior:\s*contain/)
  })

  it('allows long unbroken display names to wrap inside an option', () => {
    expect(ruleBody(css, '.mention-row .nm')).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
