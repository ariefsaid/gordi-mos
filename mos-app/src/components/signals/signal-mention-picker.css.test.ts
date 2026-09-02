// AA guard — #578: the mention picker's active row painted a solid `--accent` fill over both the
// type badge (person/team/bu) and the name, sinking the badge to invisible and the name text to
// low contrast. jsdom can't compute var() chains, so this asserts at the CSS-SOURCE level that
// the active row uses the accent-SUBTLE wash token (the same one the sibling category picker's
// own selected state already uses — signal-card.css `.signal-category-option[aria-selected]`),
// never the solid `--accent` fill.
//
// The person-badge-specific stacked-wash contrast failure this uncovered (two --accent-subtle
// layers compounding to 3.99:1, below AA) is pinned as real numbers in
// src/styles/tokens/contrast.test.ts, not here — this file can only compare CSS source text, it
// cannot compute a contrast ratio.
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

  // Forward guard — passes on the OLD (pre-#578) CSS just as much as the fixed one, since it only
  // checks that each badge variant declares a background somewhere in the file. It is not #578
  // evidence; keep it as a tripwire against a FUTURE edit deleting a badge's own tint outright.
  it('[forward guard] every type-badge variant still declares its own background somewhere', () => {
    for (const selector of ['.type-badge--person', '.type-badge--team', '.type-badge--bu']) {
      expect(css).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*background:`))
    }
  })

  it('the active-row person badge gets an opaque override; team/bu do not (#578)', () => {
    // Person's own badge tint is the SAME --accent-subtle token as the row wash, so stacking the
    // two compounds into a too-dark, too-blue background (3.99:1 on the badge text — pinned in
    // contrast.test.ts). Team/BU use a different hue (violet/warning) and are unaffected, so they
    // must NOT get an active-row override — one would be an unexplained, untested departure from
    // their own AA-proven tint.
    expect(css).toMatch(/\.mention-row\.is-active\s+\.type-badge--person\s*\{/)
    expect(css).not.toMatch(/\.mention-row\.is-active\s+\.type-badge--team/)
    expect(css).not.toMatch(/\.mention-row\.is-active\s+\.type-badge--bu/)
  })

  it('the active-row person badge override uses the opaque theme-invariant chip pair (#578)', () => {
    const overrideIdx = css.indexOf('.mention-row.is-active .type-badge--person')
    expect(overrideIdx).toBeGreaterThanOrEqual(0)
    const overrideBody = ruleBody(css.slice(overrideIdx), '.mention-row.is-active .type-badge--person')
    expect(overrideBody).toMatch(/background:\s*var\(--ds-color-blue\)/)
    expect(overrideBody).toMatch(/color:\s*var\(--ds-font-color-inverted\)/)
  })
})
