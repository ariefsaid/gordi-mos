/** CSS guard for the collection-first catalog rows. Desktop is a dense 52px grid; phone rows
 * become compact ~96px scan cards with wrapped identity, primary context, and progress while
 * activation stays one link. */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/catalog/catalog-collection.css'), 'utf8')

describe('catalog row layout stays readable at phone width', () => {
  it('uses a four-column desktop row with a 52px floor', () => {
    expect(css).toMatch(/\.catalog-collection__row\s*\{[\s\S]*?min-height:\s*52px/)
    expect(css).toMatch(/\.catalog-collection__header,[\s\S]*?\.catalog-collection__row-link\s*\{[\s\S]*?grid-template-columns:/)
  })

  it('reflows to a compact two-column 96px phone card', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 767.98px)'))
    expect(phone).toContain('.catalog-collection__row-link')
    expect(phone).toMatch(/min-height:\s*96px/)
    expect(phone).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(100px, auto\)/)
    expect(phone).toMatch(/\.catalog-collection__cell-label\s*\{[\s\S]*?display:\s*none/)
    expect(phone).toMatch(/\.catalog-collection__name\s*\{[\s\S]*?white-space:\s*normal/)
    expect(phone).toMatch(/\.catalog-collection__cell--activity\s*\{[\s\S]*?display:\s*none/)
    expect(phone).toContain('.catalog-collection__table--objective')
    expect(phone).toContain('.catalog-collection__table--work_line')
  })

  it('collapses a desktop split queue to identity + owner + progress', () => {
    const split = css.slice(css.indexOf('@media (min-width: 1100px)'))
    expect(split).toMatch(/\.record-split \.catalog-collection__header,[\s\S]*?\.record-split \.catalog-collection__row-link/)
    expect(split).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(92px, [^)]+\)\s+minmax\(110px, [^)]+\)/)
    expect(split).toMatch(/\.record-split \.catalog-collection__cell--relation,[\s\S]*?\.record-split \.catalog-collection__cell--cadence,[\s\S]*?\.record-split \.catalog-collection__cell--activity\s*\{[\s\S]*?display:\s*none/)
  })

  it('keeps the row activation a plain link with no action-cluster CSS contract', () => {
    expect(css).not.toContain('catalog-collection__actions')
    expect(css).not.toContain('catalog-collection__disclosure')
  })
})
