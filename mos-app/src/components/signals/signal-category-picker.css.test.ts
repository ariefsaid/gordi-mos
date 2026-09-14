import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/signals/signal-card.css'), 'utf8')
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
  expect(bodies.length, `signal-card.css must keep ${query}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('Signal category picker phone target contract', () => {
  it('keeps the compact desktop option but gives each phone option a centered 44px row', () => {
    expect(css).toMatch(/\.signal-category-option\s*\{[^}]*min-height:\s*36px/)

    const phone = mediaBody('@media (max-width: 767.98px)')
    expect(phone).toMatch(/\.signal-category-option\s*\{[^}]*min-height:\s*44px/)
    expect(phone).toMatch(/\.signal-category-option\s*\{[^}]*display:\s*flex/)
    expect(phone).toMatch(/\.signal-category-option\s*\{[^}]*align-items:\s*center/)
  })
})
