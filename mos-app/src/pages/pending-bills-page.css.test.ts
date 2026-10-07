// A narrow bill list keeps age, state and the priority money fields while it wraps long names
// without moving those figures off-canvas; the Money shell owns the surrounding surface.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/pages/pending-bills-page.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const recordHostCss = readFileSync(resolve(process.cwd(), 'src/shell/record-panel-host.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const ruleIn = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? null
}
const rule = (selector: string) => ruleIn(css, selector)
const groupedRule = (source: string, selector: string) => {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].split(',').some((candidate) => candidate.trim() === selector)) return match[2]
  }
  return null
}

describe('pending bills table CSS', () => {
  it('keeps Bill no., Amount and Balance as the columns that survive a narrow table', () => {
    const narrow = css.match(/@media \(min-width:\s*768px\)\s*\{[\s\S]*?@container pending-bills-list \(max-width:\s*979\.98px\)\s*\{([\s\S]*?)\n\s{2}\}/)?.[1] ?? ''
    expect(rule('.pending-bills-table .money-table') ?? '').toMatch(/table-layout:\s*fixed/)
    for (const hidden of ['date', 'branch', 'owes']) {
      expect(narrow).toContain(`.pending-bills-table .money-table__cell--${hidden}`)
    }
    for (const visible of ['age', 'state', 'bill', 'amount', 'balance']) {
      expect(narrow).not.toContain(`.pending-bills-table .money-table__cell--${visible}`)
    }
    expect(css).toMatch(/\.pending-bills-table \.money-table-scroll\s*\{\s*overflow-x:\s*hidden/)
    expect(rule('.pending-bills-list-column') ?? '').toMatch(/container:\s*pending-bills-list\s*\/\s*inline-size/)
  })

  it('keeps date, age, bill number and financial figures on one line in the table', () => {
    for (const column of ['date', 'age', 'bill', 'amount', 'balance']) {
      expect(groupedRule(css, `.pending-bills-table .money-table__cell--${column} .money-table__cell-value`) ?? '').toMatch(/white-space:\s*nowrap/)
    }
  })

  it('lets Who owes absorb the slack and wrap a long counterparty note', () => {
    const owes = rule('.pending-bills__owes')
    expect(owes).toMatch(/min-width:\s*12ch/)
    expect(owes).toMatch(/overflow-wrap:\s*anywhere/)
    expect(owes).not.toMatch(/max-width/)
  })

  it('hides lower-priority columns in a narrow list instead of adding horizontal scroll', () => {
    expect(rule('.pending-bills-table .money-table-scroll') ?? '').not.toMatch(/overflow-x:\s*auto/)
    expect(css).toMatch(/@container pending-bills-list \(max-width:\s*979\.98px\)/)
    expect(css).toMatch(/\.pending-bills-table \.money-table-scroll\s*\{\s*overflow-x:\s*hidden/)
    expect(rule('.pending-bills-list-column') ?? '').toMatch(/min-width:\s*0/)
  })

  it('uses the shared sticky record-panel rule and lets the viewer own scrolling', () => {
    expect(rule('.pending-bill-record-panel.drawer-split:not(.drawer-shell-split):not(.overlay-companion-host)')).toBeNull()
    expect(ruleIn(recordHostCss, '.drawer-split.drawer-split--sticky:not(.drawer-shell-split):not(.overlay-companion-host)')).toMatch(/position:\s*sticky/)
    expect(recordHostCss).toMatch(/\.drawer-split\.drawer-split--sticky\s*>\s*\.record-viewer[\s\S]*?overflow-y:\s*auto/)
  })
})
