// #959 pin: the shared desktop form grid — one rule (two-up, ≤600px stacks to one column)
// instead of each form re-inventing its own field widths.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'form-grid.css'), 'utf8')

describe('form-grid — shared desktop form grid (#959)', () => {
  it('lays out two fields per row on desktop', () => {
    expect(css).toMatch(/\.form-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s)
  })

  it('a field can opt into spanning the whole row', () => {
    expect(css).toMatch(/\.form-grid__field--full\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s)
  })

  it('stacks to one column at phone width (≤600px)', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)\s*\{\s*\.form-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s)
  })
})
