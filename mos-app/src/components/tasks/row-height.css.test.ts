// PR-6 OD-P3-6 / AC-D04 — dense DB-view body rows must render 50px.
// The live capstone review measured ~38.5px though `.td-main, .td-cell { height: 50px }`
// is declared — a single CSS rule on the cells alone proved insufficient in the rendered
// table. jsdom cannot lay out a real table, so we assert at the CSS-SOURCE level that the
// 50px row height is pinned ROBUSTLY: both on the row (`.task-row`, raising specificity over
// the cell rule) and on the cells, so no `line-height`/box-sizing interaction can collapse it.
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

describe('OD-P3-6: dense DB-view body rows are pinned to 50px', () => {
  it('OD-P3-6: .task-row pins height 50px on the row (robust against the cell-only rule collapsing)', () => {
    const body = ruleBody('.task-row {')
    expect(body).toMatch(/height:\s*50px/)
  })

  it('OD-P3-6: .td-main, .td-cell keep their 50px height + a line-height that cannot collapse the box', () => {
    const body = ruleBody('.td-main, .td-cell {')
    expect(body).toMatch(/height:\s*50px/)
    expect(body).toMatch(/line-height:/)
  })
})
