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
