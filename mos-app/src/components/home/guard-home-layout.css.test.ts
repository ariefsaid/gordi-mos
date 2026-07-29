import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')

// AC-932: the primitives must have EXACTLY ONE definition each. Before the mockup refactor the
// equivalents were declared 3-4x, once per view — which is how three "options" quietly become
// three surfaces that diverge on the next change.
describe('AC-932: Home layout primitives are defined once', () => {
  for (const selector of ['.home-layout', '.home-bento', '.home-tile', '.home-tabs']) {
    it(`${selector} has exactly one base definition`, () => {
      const re = new RegExp(`^\\${selector} \\{`, 'gm')
      expect(css.match(re)?.length ?? 0).toBe(1)
    })
  }

  // NFR-923: a grid child defaults to min-content width. Omitting minmax(0, …) is what lets long
  // titles push a grid past its container — the exact defect found in the mockups.
  it('every grid track uses minmax(0, …)', () => {
    const tracks = css.match(/grid-template-columns:[^;]+;/g) ?? []
    const bad = tracks.filter((t) => /\b1fr\b/.test(t) && !t.includes('minmax(0'))
    expect(bad).toEqual([])
  })
})

// ── The Overview lead tile carries a tonal lift ────────────────────────────────────────────────
// `needs-you` leads by being first, top-left and wide — but `my-work` is ALSO wide, so weight alone
// does not mark the lead. A one-step tonal lift on the region does. Keyed to the REGION, never to
// the weight (both wide tiles would take it). Previously declined on the claim that it collides
// with `.stream-row-link:hover`; that was wrong — hover uses `--secondary` (→ `--surface-secondary`)
// and this is `--surface-tertiary`, a different step of the same ramp (measured in the browser:
// secondary = color(display-p3 0.984 0.976 0.957), tertiary = color(display-p3 0.969 0.957 0.933)).
describe('OD-V4-7 constraint 1: the lead region is marked, and not by weight alone', () => {
  it('the tonal lift is keyed to the needs-you REGION, not to the wide weight', () => {
    expect(css).toMatch(/\.home-tile\[data-region="needs-you"\]\s*\{[^}]*background:\s*var\(--surface-tertiary\)/)
    expect(css, 'a weight-keyed lift would also raise my-work')
      .not.toMatch(/\.home-tile\[data-weight="wide"\]\s*\{[^}]*background:/)
  })

  it('it does not reuse the row-hover fill, which would make the tile read as hovered', () => {
    const rule = /\.home-tile\[data-region="needs-you"\]\s*\{([^}]*)\}/.exec(css)![1]
    expect(rule).not.toMatch(/var\(--secondary\)/)
  })
})

// ── The tile's own name is not the quietest thing in the tile ──────────────────────────────────
// `.home-tile-name` sat at the 12px label rung inside 15px row titles, so the region's identity
// read below the rows it heads.
describe('the tile name outranks the rows beneath it', () => {
  it('.home-tile-name takes the body-lg rung, not the label rung', () => {
    const rule = /\.home-tile-name\s*\{([^}]*)\}/.exec(css)![1]
    expect(rule).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
  })
})
