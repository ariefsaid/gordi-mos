import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'home-daily-brief.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Home daily brief composition contract', () => {
  it('makes the wrapper the named container for responsive composition', () => {
    expect(css).toMatch(/\.home-frame\s*\{[^}]*container:\s*home\s*\/\s*inline-size/)
    expect(css).toMatch(/@container\s+home\b/)
  })

  it('gives the attention queue the dominant structural edge and keeps a wide two-track surface', () => {
    expect(css).toMatch(/\.home-daily-brief\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*344px\)/)
    expect(css).toMatch(/\.home-brief-attention\s*\{[^}]*border-top:\s*2px\s+solid\s+var\(--brand-navy\)/)
  })

  it('collapses to one track and then stacks supporting content without viewport-width assumptions', () => {
    expect(css).toMatch(/@container\s+home\s*\(max-width:\s*960px\)/)
    expect(css).toMatch(/@container\s+home\s*\(max-width:\s*620px\)/)
  })
})
