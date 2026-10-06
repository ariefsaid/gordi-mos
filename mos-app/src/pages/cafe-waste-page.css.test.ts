import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/cafe-waste-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function rule(selector: string): string {
  const index = css.indexOf(selector)
  expect(index, `expected ${selector} in cafe-waste-page.css`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

describe('Waste capture controls stay paired and complete', () => {
  it('keeps quantity, unit and photo action in an inline desktop track', () => {
    const controls = rule('.cwl-controls {')
    const photo = rule('.cwl-add-photo {')
    expect(controls).toMatch(/grid-template-columns:\s*var\(--cafe-capture-quantity-width,[^)]+\)\s+var\(--cafe-capture-unit-track-width,[^)]+\)\s+6rem/)
    expect(controls).toMatch(/gap:\s*8px/)
    expect(controls).toMatch(/width:\s*31\.5rem/)
    expect(css).toMatch(/dt-table thead th:last-child \{ padding-left: 12px; text-align: left; \}/)
    expect(css).toMatch(/@media\s*\(min-width:\s*768px\)[\s\S]*?\.cwl-unit-menu\s*\{\s*font-size:\s*var\(--font-size-label\)/)
    expect(css).toMatch(/\.cwl-unit-menu \.mk-select__option \{ gap: 4px; padding-inline: 6px; \}/)
    expect(photo).toMatch(/justify-self:\s*stretch/)
  })

  it('wraps long units on phones instead of hiding their tail', () => {
    const unitRules = css.slice(css.indexOf('.cwl-unit-select .mk-select__field > span:first-child {'), css.indexOf('.cwl-add-photo {'))
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
