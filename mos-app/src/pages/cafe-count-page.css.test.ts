import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-count-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const shared = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('Count keeps one shared quantity column without clipping units', () => {
  it('uses one fixed input column and a stable 110px unit column at every width', () => {
    expect(css).toMatch(/\.cafe-count__row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--cafe-capture-control-group-width,\s*25rem\)/)
    expect(css).toMatch(/\.cafe-count__quantity-control\s*\{[^}]*grid-template-columns:\s*var\(--cafe-capture-quantity-width,\s*7\.5rem\)\s*110px/)
    expect(css).toMatch(/\.cafe-count__quantity-control\s*\{[^}]*width:\s*max-content/)
    expect(css).toMatch(/width:\s*var\(--cafe-capture-control-group-width,\s*25rem\)/)
    expect(css).toMatch(/\.cafe-count__quantity-control \.cafe-count__unit\s*\{[^}]*white-space:\s*normal/)
    expect(css).toMatch(/\.cafe-count__quantity-control \.cafe-count__unit\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(css).not.toMatch(/cafe-capture-unit-track-width/)
    expect(css).toMatch(/\.cafe-count__field-error,[\s\S]*?grid-column:\s*1\s*\/\s*-1/)
  })

  it('shares the list width with its footer and brings category context back on phone', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*?\.cafe-count__footer\s*\{[^}]*width:\s*min\(100%,\s*772px\)/)
    expect(css).toMatch(/@media\s*\(max-width:\s*639px\)[\s\S]*?\.cafe-count__category\s*\{\s*display:\s*block/)
    expect(css).toMatch(/\.cafe-count__category\s*\{\s*display:\s*none/)
  })

  it('lets a long unit wrap on phone but never ellipsizes it', () => {
    const unit = shared.slice(shared.indexOf('.cafe-capture-unit {'), shared.indexOf('.cafe-capture-action {'))
    expect(unit).toMatch(/white-space:\s*normal/)
    expect(unit).toMatch(/overflow-wrap:\s*anywhere/)
    expect(unit).toMatch(/text-overflow:\s*clip/)
    expect(unit).not.toMatch(/text-overflow:\s*ellipsis/)
  })
})

describe('Cafe Count quantity errors', () => {
  it('places invalid-row guidance on its own full-width row at desktop and phone widths', () => {
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__input-group\s*\{[^}]*display:\s*contents/)
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__field-error\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })
})
