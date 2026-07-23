/**
 * MECH-GUARD R1 — split-view height parity (structural layer).
 *
 * Owner catch (review r2, missed by 5 audit rounds): at ≥1100px in split mode the tasks
 * table card and the record drawer each sat at its own content height, so their bottoms
 * never aligned — the composition read as two mismatched boxes instead of one surface.
 * Skill rule mechanized: taste §7 "Align & Space Perfectly … avoid floating elements with
 * awkward gaps" (.claude/skills/taste/SKILL.md, Layout & Spacing).
 *
 * jsdom has no layout engine, so this layer pins the CSS grammar of the fix verbatim:
 * inside the ≥1100px media block, the non-expanded split grid stretches both tracks to one
 * shared height, and the drawer becomes a flex column that fills it and owns its overflow.
 * The rendered-pixel proof (bounding boxes actually sharing a bottom edge) lives in
 * e2e/guards.geometry.spec.ts (GUARD-R1).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(
  resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first balanced block following `@media (<query>)`. */
function mediaBody(query: string): string {
  const idx = css.indexOf(`@media (${query})`)
  expect(idx, `expected TasksWorkspace.css to contain @media (${query})`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unterminated media block: ${query}`)
}

describe('GUARD-R1: split table + drawer share ONE track height at the split width', () => {
  const body = mediaBody('min-width: 1100px')

  it('GUARD-R1: the live (non-expanded, drawer-open) split grid stretches its items', () => {
    // The exact fix: align-items:stretch scoped to the real split regime only. `start`
    // must stay the base (the nodrawer/modal regimes), so this pins the scoped override.
    expect(body).toMatch(
      /\.split:not\(\.nodrawer\):not\(\.expanded\)\s*\{[^}]*align-items:\s*stretch/,
    )
  })

  it('GUARD-R1: the drawer fills the shared track and owns its overflow internally', () => {
    // Without these, stretch would just grow the aside frame while its content overflowed
    // the card — parity in the grid but not in the rendered surface.
    expect(body).toMatch(
      /\.split:not\(\.expanded\)\s+\.drawer:not\(\.expanded\)\s*\{[^}]*flex-direction:\s*column/,
    )
    expect(body).toMatch(
      /\.split:not\(\.expanded\)\s+\.drawer:not\(\.expanded\)\s*>\s*\.dw-surface\s*\{[^}]*flex:\s*1 1 auto/,
    )
    expect(body).toMatch(
      /\.split:not\(\.expanded\)\s+\.drawer:not\(\.expanded\)\s*>\s*\.dw-surface\s*\{[^}]*overflow:\s*auto/,
    )
  })

  it('GUARD-R1: the base split grid still top-aligns (the stretch is a scoped exception)', () => {
    // Guard the guard: if someone flips the BASE to stretch, the modal/nodrawer regimes
    // would silently change too. The base `.split` rule must keep align-items:start.
    expect(css).toMatch(/\.split\s*\{[^}]*align-items:\s*start/)
  })
})

describe('DO-18(a) (census-sweep R2 tasks FINDING1): condensed-tier Task identity never starves', () => {
  it('the drawer-open condensed tier lets the Task title wrap to a clamped 2 lines', () => {
    // In the squashed split track the one-line ellipsis truncated 6/11 titles at 1280.
    // The condensed tier overrides .task-name's nowrap with a 2-line clamp.
    expect(css).toMatch(
      /\.split:not\(\.nodrawer\):not\(\.expanded\)\s+\.task-name\s*\{[^}]*white-space:\s*normal/,
    )
    expect(css).toMatch(
      /\.split:not\(\.nodrawer\):not\(\.expanded\)\s+\.task-name\s*\{[^}]*-webkit-line-clamp:\s*2/,
    )
  })

  it('the base .task-name keeps its one-line ellipsis (the wrap is a condensed-tier exception)', () => {
    expect(css).toMatch(/\.task-name\s*\{[^}]*white-space:\s*nowrap/)
  })
})
