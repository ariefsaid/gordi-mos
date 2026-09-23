// #411 review guard — Café Review's destructive confirm row must never push Cancel out of reach.
//
// The #400 i18n port changed the confirm's label from the fixed-width "Confirm reject" to an
// interpolated "Konfirmasi tolak ${dish}". Dish names are unbounded, `.btn` is `white-space:
// nowrap`, and `.krow-decide-actions` was a flex row with no `flex-wrap` — so past roughly 25
// characters the confirm grew until Cancel left the card. That is the escape hatch from an
// irreversible action, on a phone, on the surface where the action is irreversible.
//
// The fix is layout, never truncation: truncating the dish name would hide WHICH dish is being
// rejected, which is the whole reason the port put it on the button. So the row wraps, and the
// confirm alone is allowed to set its label over two lines.
//
// DESIGN.md § Responsive: "Phone (390px and ≤767px): … no horizontal page overflow is allowed."
// DESIGN.md § Density: "Standard controls are 32px; phone targets are at least 44px."
//
// Layering: pure fs-read, mirrors tap-targets.css.test.ts / guard-signal-title-clamp.css.test.ts.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-review-page.css'), 'utf8')

/** The declarations of the first rule whose selector list contains `selector`. */
function ruleBody(source: string, selector: string): string {
  const idx = source.indexOf(selector)
  expect(idx, `expected to find a rule for ${selector}`).toBeGreaterThanOrEqual(0)
  const open = source.indexOf('{', idx)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

/** The body of an at-rule block, brace-balanced. */
function mediaBody(source: string, query: string): string {
  const idx = source.indexOf(query)
  expect(idx, `expected to find ${query}`).toBeGreaterThanOrEqual(0)
  const open = source.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated at-rule: ${query}`)
}

// (title does not lead with the issue number: a leading `#411` parses as a 3-digit hex colour
// and trips the no-hard-coded-colour lint rule)
describe('Café Review confirm row (#411) — Cancel stays reachable at phone width', () => {
  it('the decide-actions row wraps instead of overflowing', () => {
    expect(ruleBody(css, '.krow-decide-actions {')).toMatch(/flex-wrap:\s*wrap/)
  })

  it('the confirm is capped at the row width and wraps its label rather than pushing Cancel out', () => {
    const body = ruleBody(css, '.krow-decide-actions .krow-confirm {')
    expect(body).toMatch(/max-width:\s*100%/)
    expect(body).toMatch(/white-space:\s*normal/)
    // a wrapping label needs the height to follow the content
    expect(body).toMatch(/height:\s*auto/)
  })

  it('a wrapping confirm still meets the 32px desktop control floor', () => {
    expect(ruleBody(css, '.krow-decide-actions .krow-confirm {')).toMatch(/min-height:\s*32px/)
  })

  it('and still meets the 44px phone tap floor it would otherwise have inherited from .btn', () => {
    // `height: auto` above out-specifies Button.css, so the phone floor is restated here at the
    // same specificity — a media query adds none of its own, and import order is not a contract.
    const phone = mediaBody(css, '@media (max-width: 767.98px)')
    expect(phone).toMatch(/\.krow-decide-actions\s+\.krow-confirm[\s\S]*?min-height:\s*44px/)
  })
})
