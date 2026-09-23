import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/tasks/TasksWorkspace.css'), 'utf8')
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
  expect(bodies.length, `TasksWorkspace.css must keep ${query}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('MobileGroupedCards phone target contract', () => {
  it('keeps the compact desktop caret while enlarging the phone caret box to 44×44', () => {
    expect(css).toMatch(/\.mgc-caret\s*\{[^}]*width:\s*28px[^}]*height:\s*28px/)

    const phone = mediaBody('@media (max-width: 767.98px)')
    expect(phone).toMatch(/\.mgc-caret\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/)
  })

  it('gives overdue and add actions 44px phone boxes while centering their compact labels', () => {
    const phone = mediaBody('@media (max-width: 767.98px)')
    expect(phone).toMatch(/\.mgc-sub,\s*\.mgc-add\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/)
    expect(phone).toMatch(/\.mgc-sub,\s*\.mgc-add\s*\{[^}]*display:\s*inline-flex/)
    expect(phone).toMatch(/\.mgc-sub,\s*\.mgc-add\s*\{[^}]*align-items:\s*center/)
    expect(phone).toMatch(/\.mgc-sub,\s*\.mgc-add\s*\{[^}]*justify-content:\s*center/)
  })
})
