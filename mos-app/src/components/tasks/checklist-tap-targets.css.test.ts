import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TaskSurface.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function mediaBody(query: string): string {
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
  expect(bodies.length, `TaskSurface.css must keep ${query}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('Task checklist phone target contract', () => {
  it('keeps compact desktop reorder/delete controls', () => {
    expect(css).toMatch(/\.checklist-ctrl-btn\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/)
    expect(css).toMatch(/\.checklist-retry\s*\{[^}]*min-height:\s*24px/)
  })

  it('raises reorder/delete and retry controls to the two-axis phone floor', () => {
    const phone = mediaBody('@media (max-width: 767.98px)')
    expect(phone).toMatch(/\.checklist-ctrl-btn\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/)
    expect(phone).toMatch(/\.checklist-retry\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/)
  })
})
