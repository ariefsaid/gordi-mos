import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-waste-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const selectCss = readFileSync(resolve(process.cwd(), 'src/components/ui/Select.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const captureCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-controls.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const layoutCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/cafe-capture-layout.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const stepperCss = readFileSync(resolve(process.cwd(), 'src/components/kitchen/wip-item-stepper.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const wasteSource = readFileSync(resolve(process.cwd(), 'src/pages/cafe-waste-page.tsx'), 'utf8')

function rule(selector: string, last = false): string {
  const index = last ? css.lastIndexOf(selector) : css.indexOf(selector)
  expect(index, `expected ${selector} in cafe-waste-page.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('Waste capture controls stay paired and complete', () => {
  it('keeps the capture table on the shared content measure beside the summary rail', () => {
    expect(css).not.toMatch(/\.cwl-list|\.cwl-footer|\.cwl-page/)
    expect(layoutCss).toMatch(/\.cafe-capture-table\s*\{[^}]*width:\s*min\(100%, var\(--cafe-capture-content-measure/)
  })

  it('keeps quantity, unit and photo action in an inline desktop track', () => {
    const controls = rule('.cwl-controls {')
    const photo = rule('.cwl-add-photo {', true)
    expect(controls).toMatch(/grid-template-columns:\s*var\(--cafe-capture-quantity-width,[^)]+\)\s+minmax\(0,\s*1fr\)\s+6rem/)
    expect(controls).toMatch(/gap:\s*8px/)
    expect(controls).toMatch(/width:\s*100%/)
    expect(controls).toMatch(/max-width:\s*31\.5rem/)
    expect(css).not.toContain('.dt-table')
    expect(layoutCss).toMatch(/td:last-child\s*\{[^}]*width:\s*min\(25rem, 54%\)[^}]*vertical-align:\s*top/)
    expect(layoutCss).toMatch(/@media\s*\(min-width:\s*1280px\)\s*and\s*\(max-width:\s*1372\.98px\)[\s\S]*?\.cwl-page\.kl-capture-wide\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)[\s\S]*?\.cwl-unit-menu\s*\{\s*font-size:\s*var\(--font-size-label\)/)
    expect(css).toMatch(/\.cwl-unit-menu \.mk-select__option \{ gap: 4px; padding-inline: 6px; \}/)
    expect(photo).toMatch(/justify-self:\s*stretch/)
  })

  it('left-aligns fixed unit labels and shares their quiet typography', () => {
    expect(rule('.cwl-unit-label {')).toMatch(/text-align:\s*left/)
    expect(rule('.cwl-unit-label {')).not.toMatch(/font-size|color:/)
    expect(layoutCss).toMatch(/\.cafe-count__unit,\s*\.cafe-capture-unit-label,\s*\.kls-unit\s*\{[^}]*font-size:\s*var\(--font-size-label\)[^}]*color:\s*var\(--muted-foreground\)/)
    expect(wasteSource).toMatch(/cwl-unit-label cafe-capture-unit cafe-capture-unit-label/)
    expect(selectCss).toMatch(/\.mk-select__field\s*\{[^}]*text-align:\s*left/)
  })

  it('uses one shared unit wrapping rule for Select labels', () => {
    const unit = captureCss.slice(captureCss.indexOf('.cafe-capture-unit {'), captureCss.indexOf('.cafe-capture-action {'))
    const selectLabelSelector = '.cafe-capture-unit .mk-select__field > span:first-child {'
    const selectLabel = captureCss.slice(captureCss.indexOf(selectLabelSelector), captureCss.indexOf('}', captureCss.indexOf(selectLabelSelector)))
    expect(unit).toMatch(/white-space:\s*normal/)
    expect(unit).toMatch(/overflow-wrap:\s*anywhere/)
    expect(selectLabel).toMatch(/white-space:\s*normal/)
    expect(selectLabel).toMatch(/overflow:\s*visible/)
    expect(selectLabel).toMatch(/overflow-wrap:\s*anywhere/)
    expect(selectLabel).toMatch(/text-overflow:\s*clip/)
    expect(captureCss.match(/\.cafe-capture-unit \.mk-select__field > span:first-child\s*\{/g)).toHaveLength(1)
    expect(css.match(/\.cwl-unit-select \.mk-select__field > span:first-child\s*\{/g)).toHaveLength(1)
    expect(stepperCss).not.toContain('.kls-unit-select .mk-select__field > span:first-child {')
    expect(rule('.cwl-unit-label {')).not.toMatch(/white-space|overflow-wrap|text-overflow/)
    expect(css).not.toContain('.cwl-controls .cwl-unit-label {')
  })

  it('inherits shared quantity-field chrome and keeps only Waste-specific alignment', () => {
    expect(captureCss).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field:not\(\.kls-qty\),\s*\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*padding:\s*0 8px[^}]*border:\s*1px solid var\(--input\)[^}]*font:\s*inherit/)
    expect(captureCss).toMatch(/\.cafe-capture-content \.cafe-capture-quantity-field,\s*\.cafe-count \.cafe-capture-quantity-field\s*\{[^}]*width:\s*var\(--cafe-capture-quantity-width\)[^}]*min-height:\s*var\(--cafe-capture-control-height\)/)
    expect(rule('.cwl-quantity-input {', true)).toMatch(/max-width:\s*100%/)
    expect(rule('.cwl-quantity-input {', true)).toMatch(/text-align:\s*right/)
    expect(rule('.cwl-quantity-input {', true)).not.toMatch(/(?:^|;)\s*(?:width|min-width|min-height|height|box-sizing|padding|border|background|color|font|outline)\s*:/)
    expect(css).not.toContain('.cwl-quantity-input:focus-visible')
    expect(css).not.toContain('.cwl-quantity-input[aria-invalid="true"]')
  })

  it('removes the repeated per-item quantity-before-photo hint style', () => {
    expect(css).not.toContain('.cwl-photo-hint')
  })

  it('uses in-gamut semantic warning tokens for the held banner', () => {
    const held = rule('.cwl-held {')
    expect(held).toMatch(/background:\s*var\(--ds-tag-background-amber\)/)
    expect(held).toMatch(/border:\s*1px solid var\(--ds-color-amber11\)/)
    expect(held).not.toMatch(/color-mix/)
  })

  it('keeps phone-specific Select typography without redefining shared wrapping', () => {
    const phoneLabel = rule('.cwl-unit-select .mk-select__field > span:first-child {')
    expect(phoneLabel).toMatch(/font-size:\s*var\(--font-size-control\)/)
    expect(phoneLabel).toMatch(/line-height:\s*1\.3/)
    expect(phoneLabel).not.toMatch(/white-space|overflow|text-overflow/)
    expect(css).not.toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.cwl-unit-label\s*\{/)
  })

  it('keeps shared category context available on phone while preserving dense desktop rows', () => {
    expect(layoutCss).toMatch(/\.cafe-capture-item__category\s*\{\s*display:\s*none/)
    expect(layoutCss).toMatch(/@media\s*\(max-width:\s*639px\)[\s\S]*?\.cafe-capture-item__category\s*\{\s*display:\s*block/)
  })
})

describe('Café Waste quantity-error layout', () => {
  it('uses shared feedback on tables and keeps phone error geometry in the shared skin', () => {
    expect(css).toMatch(/\.cwl-quantity-row,[\s\S]*?\.quantity-field-control--inline,[\s\S]*?\.quantity-field-suffix\s*\{\s*display:\s*contents/)
    expect(css).not.toContain(':has(.quantity-field-error)')
    expect(layoutCss).toMatch(/@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.cwl-controls:has\(\.quantity-field-error\) \.quantity-field-error\s*\{[^}]*grid-column:\s*1\s*\/\s*3;[^}]*grid-row:\s*2/)
    expect(layoutCss).toMatch(/\.cwl-controls:has\(\.quantity-field-error\) \.cwl-add-photo\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*1\s*\/\s*span\s*2/)
    expect(layoutCss).toMatch(/\.cafe-capture-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })
})
