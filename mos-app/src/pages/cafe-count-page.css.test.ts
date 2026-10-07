import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-count-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const shared = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const aliases = readFileSync(resolve(process.cwd(), 'src/styles/tokens/aliases.css'), 'utf8')

describe('Count keeps one shared quantity column without clipping units', () => {
  it('uses one fixed input column and a stable 110px unit column at every width', () => {
    expect(css).toMatch(/\.cafe-count__row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--cafe-capture-control-group-width,\s*25rem\)/)
    expect(css).toMatch(/\.cafe-count__quantity-control\s*\{[^}]*grid-template-columns:\s*var\(--cafe-capture-quantity-width,\s*7\.5rem\)\s*110px/)
    expect(css).not.toMatch(/minmax\(110px,\s*1fr\)/)
    expect(css).toMatch(/\.cafe-count__quantity-control\s*\{[^}]*width:\s*max-content/)
    expect(css).toMatch(/width:\s*var\(--cafe-capture-control-group-width,\s*25rem\)/)
    expect(css).not.toContain('.cafe-count__quantity-control .cafe-count__unit {')
    expect(css).not.toMatch(/cafe-capture-unit-track-width/)
    expect(css).toMatch(/\.cafe-count__field-error,[\s\S]*?grid-column:\s*1\s*\/\s*-1/)
  })

  it('shares the list width with its footer and brings category context back on phone', () => {
    expect(aliases).toMatch(/--cafe-capture-content-measure:\s*772px/)
    expect(css).toMatch(/\.cafe-count__list\s*\{[^}]*max-width:\s*var\(--cafe-capture-content-measure\)/)
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)[\s\S]*?\.cafe-count__footer\s*\{[^}]*width:\s*min\(100%,\s*var\(--cafe-capture-content-measure\)\)/)
    expect(css).not.toContain('772px')
    expect(css).toMatch(/@media\s*\(max-width:\s*639px\)[\s\S]*?\.cafe-count__category\s*\{\s*display:\s*block/)
    expect(css).toMatch(/\.cafe-count__category\s*\{\s*display:\s*none/)
  })

  it('keeps quantity field geometry and chrome in the shared capture rule', () => {
    expect(shared).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field,\s*\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*width:\s*var\(--cafe-capture-quantity-width\)[^}]*min-height:\s*var\(--cafe-capture-control-height\)[^}]*box-sizing:\s*border-box/)
    expect(shared).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\),\s*\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*padding:\s*0 8px[^}]*border:\s*1px solid var\(--input\)[^}]*font:\s*inherit/)
    expect(shared).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\):focus-visible,[\s\S]*?\.cafe-count \.cafe-capture-quantity-field:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/)
    expect(shared).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\)\[aria-invalid="true"\],[\s\S]*?\.cafe-count \.cafe-capture-quantity-field\[aria-invalid="true"\]\s*\{[^}]*border-color:\s*var\(--destructive\)/)
    expect(css).toMatch(/\.cafe-count__quantity-control input\s*\{\s*font-variant-numeric:\s*tabular-nums;\s*\}/)
    expect(css).not.toMatch(/\.cafe-count__quantity-control input\s*\{[^}]*\b(?:width|min-width|min-height|height|box-sizing|padding|border|background|color|font-size|flex(?:-basis)?)\s*:/)
    expect(css).not.toContain('flex-basis: var(--cafe-capture-quantity-width')
    expect(css).not.toContain('.cafe-count__quantity-control input:focus-visible')
    expect(css).not.toContain('.cafe-count__quantity-control input[aria-invalid="true"]')
  })

  it('lets a long unit wrap on phone but never ellipsizes it', () => {
    const unit = shared.slice(shared.indexOf('.cafe-capture-unit {'), shared.indexOf('.cafe-capture-action {'))
    expect(unit).toMatch(/white-space:\s*normal/)
    expect(unit).toMatch(/overflow-wrap:\s*anywhere/)
    expect(unit).toMatch(/text-overflow:\s*clip/)
    expect(unit).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(shared).not.toMatch(/@media\s*\(min-width:\s*768px\)[\s\S]*?\.cafe-capture-unit\s*\{[^}]*white-space:\s*nowrap/)
  })
})

describe('Cafe Count quantity errors', () => {
  it('places invalid-row guidance on its own full-width row at desktop and phone widths', () => {
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__input-group\s*\{[^}]*display:\s*contents/)
    expect(css).toMatch(/\.cafe-count__row:has\(\.cafe-count__field-error\)\s+\.cafe-count__field-error\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })
})
