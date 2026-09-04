import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'signal-feed-rows.css'), 'utf8')

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

describe('Signal feed row copy typography', () => {
  it('keeps the body text plain rather than underlining the copy', () => {
    expect(ruleBody('\\.home-signal-body-text')).toMatch(/text-decoration:\s*none/)
  })
})
