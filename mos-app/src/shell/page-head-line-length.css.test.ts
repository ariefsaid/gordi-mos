import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'page-head.css'), 'utf8')

describe('PageHead job sentence measure', () => {
  it('keeps explanatory copy within a readable line length', () => {
    expect(css).toMatch(/\.page-head--v3 \.page-head-job\s*\{[^}]*max-width:\s*60ch;/s)
  })
})
