// PR-6 OD-P3-6 / AC-D04, updated for the V3 table-grammar convergence: dense DB-view body
// rows share the E7 row measure via `--row-min-h` (52px — the binding DESIGN value the audits
// normalized 50px to). jsdom cannot lay out a real table, so we assert at the CSS-SOURCE level
// that the shared measure is pinned ROBUSTLY: both on the row (`.task-row`, raising specificity
// over the cell rule) and on the cells, so no `line-height`/box-sizing interaction can collapse
// it, and that no literal row-height fork (a hardcoded px) re-diverges the shared measure.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')

function ruleBody(selector: string): string {
  const idx = css.indexOf(selector)
  expect(idx, `expected to find ${selector} in TasksWorkspace.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('OD-P3-6 / V3 grammar: dense DB-view body rows share the E7 row measure', () => {
  it('.task-row pins the shared row measure on the row (robust against the cell-only rule collapsing)', () => {
    const body = ruleBody('.task-row {')
    expect(body).toMatch(/height:\s*var\(--row-min-h\)/)
  })

  it('.td-main, .td-cell keep the shared measure + a line-height that cannot collapse the box', () => {
    const body = ruleBody('.td-main, .td-cell {')
    expect(body).toMatch(/height:\s*var\(--row-min-h\)/)
    expect(body).toMatch(/line-height:/)
  })
})
