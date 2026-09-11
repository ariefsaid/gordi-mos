import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, 'home-daily-brief.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Home daily brief composition contract', () => {
  it('makes the wrapper the named container for responsive composition', () => {
    expect(css).toMatch(/\.home-frame\s*\{[^}]*container:\s*home\s*\/\s*inline-size/)
  })

  it('styles only the supporting rail classes emitted by HomeDailyBrief', () => {
    expect(css).toMatch(/\.home-brief-aside,\s*\.home-brief-feed,\s*\.home-brief-objectives\s*\{[^}]*min-width:\s*0/)
    expect(css).toMatch(/\.home-brief-feed\s*\{[^}]*border-top:\s*1px\s+solid\s+var\(--border\)[^}]*padding-top:\s*16px/)
    expect(css).toMatch(/\.home-brief-aside\s+\.signal-feed-section\s*\{[^}]*margin-top:\s*0/)
  })

  it('does not retain selectors from the removed legacy renderer', () => {
    expect(css).not.toMatch(/\.home-daily-brief\b/)
    expect(css).not.toMatch(/\.home-brief-(?:main|attention|secondary|lane|section-head|route-link)\b/)
  })
})
