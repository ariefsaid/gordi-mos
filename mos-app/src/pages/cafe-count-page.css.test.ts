import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-count-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('Cafe Count quantity errors', () => {
  it('places invalid-row guidance on its own full-width row at desktop and phone widths', () => {
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__input-group\s*\{[^}]*display:\s*contents/)
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__field-error\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })
})
