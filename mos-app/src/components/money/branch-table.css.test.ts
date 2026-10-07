import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/components/money/branch-table.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''

const ruleIn = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
}

describe('Money branch table phone layout', () => {
  it('lets shared table cells shrink and wrap instead of widening the page', () => {
    const phoneCell = ruleIn(phone, '.branch-money-table .money-table__cell')
    expect(phoneCell).toMatch(/text-align:\s*left/)
    expect(phoneCell).toMatch(/white-space:\s*normal/)
    expect(phone).toMatch(/\.branch-money-table \.money-table__cell--branch\s*\{[^}]*min-width:\s*0/)
  })

  it('gives the company margin summary the full phone card width', () => {
    expect(phone).toMatch(/\.branch-money-table \.money-table__row--company \.money-table__cell--margin\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
  })
})
