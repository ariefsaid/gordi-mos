import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'bottom-tab-bar.css'), 'utf8')

describe('phone bottom tab contract (#755)', () => {
  it('keeps labels on the overline rung and gives each tab a 44px hit floor', () => {
    expect(css).toMatch(/\.bottom-tab-label\s*\{[\s\S]*font-size:\s*var\(--font-size-overline\)/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*\.bottom-tab\s*\{[\s\S]*min-height:\s*44px/)
  })
})
