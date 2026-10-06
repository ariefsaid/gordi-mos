import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-waste-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const selectCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Select.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function rule(selector: string, last = false): string {
  const index = last ? css.lastIndexOf(selector) : css.indexOf(selector)
  expect(index, `expected ${selector} in cafe-waste-page.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('Waste capture controls stay paired and complete', () => {
  it('keeps quantity, unit and photo action in an inline desktop track', () => {
    const controls = rule('.cwl-controls {')
    const photo = rule('.cwl-add-photo {', true)
    expect(controls).toMatch(/grid-template-columns:\s*var\(--cafe-capture-quantity-width,[^)]+\)\s+minmax\(0,\s*1fr\)\s+6rem/)
    expect(controls).toMatch(/gap:\s*8px/)
    expect(controls).toMatch(/width:\s*100%/)
    expect(controls).toMatch(/max-width:\s*31\.5rem/)
    expect(css).toMatch(/dt-table thead th:last-child \{ padding-left: 12px; text-align: left; \}/)
    expect(css).toMatch(/width:\s*32\.5rem/)
    expect(css).toMatch(/@media\s*\(min-width:\s*1280px\)\s*and\s*\(max-width:\s*1372\.98px\)[\s\S]*?\.cwl-page\.kl-capture-wide\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)[\s\S]*?\.cwl-unit-menu\s*\{\s*font-size:\s*var\(--font-size-label\)/)
    expect(css).toMatch(/\.cwl-unit-menu \.mk-select__option \{ gap: 4px; padding-inline: 6px; \}/)
    expect(photo).toMatch(/justify-self:\s*stretch/)
  })

  it('left-aligns fixed unit labels with the quantity-to-unit track', () => {
    expect(rule('.cwl-unit-label {')).toMatch(/text-align:\s*left/)
    expect(selectCss).toMatch(/\.mk-select__field\s*\{[^}]*text-align:\s*left/)
  })

  it('wraps long unit labels inside the flexible desktop track', () => {
    expect(rule('.cwl-unit-label {')).toMatch(/white-space:\s*normal/)
    expect(rule('.cwl-unit-label {')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule('.cwl-controls .cwl-unit-label {')).toMatch(/white-space:\s*normal/)
    expect(rule('.cwl-controls .cwl-unit-label {')).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule('.cwl-unit-select .mk-select__field > span:first-child {')).toMatch(/white-space:\s*normal/)
    expect(rule('.cwl-unit-select .mk-select__field > span:first-child {')).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('keeps the per-item quantity-before-photo hint inside the control row', () => {
    expect(css).toMatch(/\.cwl-field-error,[\s\S]*?\.cwl-photo-hint\s*\{\s*grid-column:\s*1\s*\/\s*-1/)
    expect(css).toMatch(/\.cwl-lock-note,[\s\S]*?\.cwl-photo-hint\s*\{[^}]*font-size:\s*var\(--font-size-label\)/)
  })

  it('uses in-gamut semantic warning tokens for the held banner', () => {
    const held = rule('.cwl-held {')
    expect(held).toMatch(/background:\s*var\(--ds-tag-background-amber\)/)
    expect(held).toMatch(/border:\s*1px solid var\(--ds-color-amber11\)/)
    expect(held).not.toMatch(/color-mix/)
  })

  it('wraps long units on phones instead of hiding their tail', () => {
    const unitRules = css.slice(css.indexOf('.cwl-unit-select .mk-select__field > span:first-child {'), css.lastIndexOf('.cwl-add-photo {'))
    expect(unitRules).toMatch(/text-overflow:\s*clip/)
    expect(unitRules).toMatch(/overflow:\s*visible/)
    expect(unitRules).not.toMatch(/text-overflow:\s*ellipsis/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.cwl-unit-label\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.cwl-unit-select \.mk-select__field > span:first-child,[\s\S]*?white-space:\s*normal/)
  })

  it('keeps category context available on phone while preserving dense desktop rows', () => {
    expect(rule('.cwl-category {')).toMatch(/display:\s*none/)
    expect(css).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.cwl-category\s*\{\s*display:\s*block/)
  })
})

describe('Café Waste quantity-error layout', () => {
  it('places the quantity error under the input and unit, before the photo action', () => {
    expect(css).toMatch(/\.cwl-quantity-row,[\s\S]*?\.quantity-field-control--inline,[\s\S]*?\.quantity-field-suffix\s*\{\s*display:\s*contents/)
    expect(rule('.cwl-controls:has(.quantity-field-error) .quantity-field-error {')).toMatch(/grid-column:\s*1\s*\/\s*3;[\s\S]*grid-row:\s*2/)
    expect(rule('.cwl-controls:has(.quantity-field-error) .cwl-add-photo {')).toMatch(/grid-column:\s*3;[\s\S]*grid-row:\s*1\s*\/\s*span\s*2/)
    expect(css).toMatch(/\.cwl-capture-row:has\(\.quantity-field-error\)[\s\S]*?\.cwl-capture-row__controls\s*\{\s*grid-column:\s*1/)
  })
})
