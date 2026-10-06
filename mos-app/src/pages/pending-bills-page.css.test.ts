// The desktop bill list keeps every figure, age and bill number on one line, lets Who owes take the
// wrapping, and only scrolls sideways inside a container too narrow for the table — so the
// DataTable's sticky header keeps its page scroll container at desktop widths.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/pending-bills-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
}

describe('pending bills table CSS', () => {
  it('keeps amount, balance and age cells on one line', () => {
    expect(rule('.pending-bills-scroll td.dt-num')).toMatch(/white-space:\s*nowrap/)
  })

  it('keeps a bill number or branch code on one line in the table', () => {
    expect(rule('.pending-bills-scroll td .pending-bills__code')).toMatch(/white-space:\s*nowrap/)
  })

  it('lets Who owes absorb the slack: a floor, no ceiling', () => {
    const owes = rule('.pending-bills__owes')
    expect(owes).toMatch(/min-width:\s*12ch/)
    expect(owes).not.toMatch(/max-width/)
  })

  it('scrolls sideways only inside a container too narrow for the table', () => {
    expect(rule('.pending-bills-body')).toMatch(/container:\s*pending-bills\s*\/\s*inline-size/)
    expect(rule('.pending-bills-scroll')).not.toMatch(/overflow-x/)
    expect(css).toMatch(/@container pending-bills \(max-width:\s*979\.98px\)\s*\{\s*\.pending-bills-scroll\s*\{[^}]*overflow-x:\s*auto/)
  })
})
