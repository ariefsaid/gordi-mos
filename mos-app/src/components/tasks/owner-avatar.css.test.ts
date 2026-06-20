// AA guard — the OwnerCell avatar (.ownav) initials must be LEGIBLE.
// The avatar background is the brand blue; with dark --brand-navy-text the initials measured
// ~3.67:1 (below WCAG-AA 4.5:1) — the washed-out "RR / CC / KK" the owner flagged. The fix is
// the signed-mockup .av-sm pairing: a blue12→blue9 gradient + --ds-font-color-inverted text. The
// blue12 end flips with the theme (dark in light / light in dark), so inverted initials always
// clear AA (~8:1 light / ~7:1 dark). jsdom can't compute var() chains, so we assert at the
// CSS-SOURCE level that the legible pairing is in place and the low-contrast one is not.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function ruleBody(css: string, selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector}`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('OwnerCell avatar (.ownav) — legible initials (WCAG-AA)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
  const body = ruleBody(css, '.ownav {')

  it('uses --ds-font-color-inverted for the initials (the legible mockup pairing)', () => {
    expect(body).toMatch(/color:\s*var\(--ds-font-color-inverted\)/)
  })

  it('does NOT use the low-contrast --brand-navy-text on the blue avatar (~3.67:1)', () => {
    expect(body).not.toMatch(/--brand-navy-text/)
  })

  it('uses the blue12→blue9 gradient background (theme-flipping, AA in both themes)', () => {
    expect(body).toMatch(/linear-gradient/)
    expect(body).toMatch(/--ds-color-blue12/)
    expect(body).toMatch(/--ds-color-blue9/)
  })
})
