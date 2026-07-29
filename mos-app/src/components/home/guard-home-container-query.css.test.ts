/**
 * MECH-GUARD — Home's arrangements branch on the CONTAINER, never on the viewport (NFR-923,
 * FR-932, DESIGN.md § Layout → The Container-Query Rule).
 *
 * `home-layouts.css` keyed its two branches off `@media (max-width: 940px / 620px)`, i.e. the
 * WINDOW — but what actually varies is the width the page content HAS, and the 232px rail collapses
 * at 920px independently of it. Measured on the rendered Overview before the fix:
 *
 *   viewport 1440 → work column 812px, bento 6 × 118.66px, row title 315px (1 line)
 *   viewport 1100 → work column 488px, bento 6 × 64.66px,  row title  99px (2 lines), meta 3 lines
 *   viewport 1024 → work column 572px  ← WIDER than at 1100, because the rail collapsed in between
 *
 * A trigger that makes the work column non-monotonic in the viewport is measuring the wrong thing.
 * jsdom has no layout engine and no container-query support, so the authored CSS grammar IS the
 * expressible structural guard: the file must declare a container and carry NO layout `@media`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = readFileSync(join(__dirname, 'home-layouts.css'), 'utf8')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

describe('NFR-923 / FR-932: the Home arrangements branch on their container, not the window', () => {
  it('declares an inline-size container for the Home page content', () => {
    expect(css).toMatch(/container(-type)?:\s*[^;]*inline-size/)
  })

  it('names that container, so the branches cannot capture an unrelated ancestor', () => {
    expect(css).toMatch(/container:\s*home\s*\/\s*inline-size/)
    for (const at of css.match(/@container[^{]*/g) ?? []) {
      expect(at, 'every @container branch must name the `home` container').toMatch(/@container\s+home\b/)
    }
  })

  it('branches the layout AND the bento on the container', () => {
    const branches = css.match(/@container\s+home\s*\(max-width:\s*(\d+)px\)/g) ?? []
    expect(branches.map((b) => b.match(/\d+/)![0]).sort()).toEqual(['620', '940'])
  })

  it('carries ZERO viewport @media breakpoints — the defect this guard exists to prevent', () => {
    expect(css.match(/@media/g) ?? []).toEqual([])
  })
})
