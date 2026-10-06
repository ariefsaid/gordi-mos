import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-waste-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('Café Waste quantity-error layout', () => {
  it('moves the invalid quantity under its unit and lets the message use the full phone row', () => {
    expect(css).toMatch(/\.cwl-capture-row:has\(\.quantity-field-error\)\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(css).toMatch(/\.cwl-controls:has\(\.quantity-field-error\) \.cwl-quantity-row,[\s\S]*?\.quantity-field\s*\{\s*display:\s*contents/)
    expect(css).toMatch(/\.cwl-controls:has\(\.quantity-field-error\) \.quantity-field-error\s*\{[^}]*width:\s*100%/)
  })
})
