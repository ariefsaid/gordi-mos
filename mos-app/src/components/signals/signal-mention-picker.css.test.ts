// AA guard — #578: the mention picker's active row painted a solid `--accent` fill over both the
// type badge (person/team/bu) and the name, sinking the badge to invisible and the name text to
// low contrast. jsdom can't compute var() chains, so this asserts at the CSS-SOURCE level that
// the active row uses the accent-SUBTLE wash token (the same one the sibling category picker's
// own selected state already uses — signal-card.css `.signal-category-option[aria-selected]`),
// never the solid `--accent` fill.
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
  const body = ruleBody(css, '.mention-row.is-active {')

  it('uses the --accent-subtle wash, not the solid --accent fill', () => {
    expect(body).toMatch(/background:\s*var\(--accent-subtle\)/)
  })

  it('does NOT use the solid --accent background that swamped the badge + name', () => {
    expect(body).not.toMatch(/background:\s*var\(--accent\)/)
  })

  it('leaves the type badges (person/team/bu) their own tinted background untouched', () => {
    // Each badge variant keeps its own background so it stays visible over the row's wash —
    // the active row must never override `.type-badge*` backgrounds.
    for (const selector of ['.type-badge--person', '.type-badge--team', '.type-badge--bu']) {
      expect(css).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*background:`))
    }
    expect(css).not.toMatch(/\.mention-row\.is-active\s+\.type-badge/)
  })
})
