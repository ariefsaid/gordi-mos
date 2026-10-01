import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const taskCss = read('src/components/tasks/task-record-document.css')
const recordCss = read('src/components/record/record-page.css')

function mediaBody(css: string, query: string): string {
  const bodies: string[] = []
  let from = 0
  while (from < css.length) {
    const idx = css.indexOf(query, from)
    if (idx < 0) break
    const open = css.indexOf('{', idx)
    let depth = 1
    let i = open + 1
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1
      if (css[i] === '}') depth -= 1
      i += 1
    }
    bodies.push(css.slice(open + 1, i - 1))
    from = i
  }
  expect(bodies.length, `stylesheet must keep ${query}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('Task checklist phone target contract', () => {
  it('keeps a compact desktop retry control', () => {
    expect(taskCss).toMatch(/\.checklist-retry\s*\{[^}]*min-height:\s*24px/)
  })

  it('raises the row menu trigger and retry to the two-axis phone floor', () => {
    // The row menu trigger is the shared record icon button.
    expect(mediaBody(recordCss, '@media (max-width: 767.98px)')).toMatch(/\.rp-icon-btn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/)
    expect(mediaBody(taskCss, '@media (max-width: 767.98px)')).toMatch(/\.checklist-retry\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/)
  })
})
