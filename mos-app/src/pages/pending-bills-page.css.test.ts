// Tablet bill rows retain identity, payer, money and state within the shared Money shell.
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
  it('keeps branch, payer, bill identity, money and state visible at tablet widths', () => {
    const narrow = css.match(/@media \(min-width:\s*768px\)\s*\{[\s\S]*?@container pending-bills-list \(max-width:\s*979\.98px\)\s*\{([\s\S]*?)\n\s{2}\}/)?.[1] ?? ''
    expect(rule('.pending-bills-table .money-table') ?? '').toMatch(/table-layout:\s*fixed/)
    const hiddenRules = [...narrow.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , declarations]) => /display:\s*none/.test(declarations))
      .map(([, selector]) => selector)
      .join('\n')
    for (const hidden of ['date', 'age']) {
      expect(hiddenRules).toContain(`.pending-bills-table .money-table__cell--${hidden}`)
    }
    for (const visible of ['select', 'branch', 'owes', 'state', 'bill', 'amount', 'balance']) {
      expect(hiddenRules).not.toContain(`.pending-bills-table .money-table__cell--${visible}`)
    }
    expect(rule('.pending-bills__tablet-age-cue') ?? '').toMatch(/display:\s*none/)
    expect(groupedRule(narrow, '.pending-bills__tablet-age-cue') ?? '').toMatch(/display:\s*inline-flex/)
    for (const [column, width] of [['select', '6%'], ['branch', '13%'], ['owes', '19%'], ['state', '17%'], ['bill', '18%'], ['amount', '13%'], ['balance', '14%']]) {
      expect(groupedRule(narrow, `.pending-bills-table .money-table__cell--${column}`) ?? '').toMatch(new RegExp(`width:\\s*${width}`))
    }
    const compact = css.match(/@container pending-bills-list \(max-width:\s*679\.98px\)\s*\{([\s\S]*?)\n\s{2}\}/)?.[1] ?? ''
    const compactHiddenRules = [...compact.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , declarations]) => /display:\s*none/.test(declarations))
      .map(([, selector]) => selector)
      .join('\n')
    for (const hidden of ['branch', 'owes']) expect(compactHiddenRules).toContain(`.pending-bills-table .money-table__cell--${hidden}`)
    for (const visible of ['state', 'bill', 'amount', 'balance']) expect(compactHiddenRules).not.toContain(`.pending-bills-table .money-table__cell--${visible}`)
    for (const [column, width] of [['select', '10%'], ['state', '27%'], ['bill', '24%'], ['amount', '20%'], ['balance', '19%']]) {
      expect(groupedRule(compact, `.pending-bills-table .money-table__cell--${column}`) ?? '').toMatch(new RegExp(`width:\\s*${width}`))
    }
    expect(narrow).toMatch(/\.pending-bills-table \.money-table__head,[\s\S]*?\.pending-bills-table \.money-table__cell\s*\{[^}]*padding:\s*0 6px/)
    expect(css).toMatch(/\.pending-bills-table \.money-table-scroll\s*\{\s*overflow-x:\s*hidden/)
    expect(rule('.pending-bills-list-column') ?? '').toMatch(/container:\s*pending-bills-list\s*\/\s*inline-size/)
  })

  it('wraps narrow status pills and clamps branch labels without losing their full source text', () => {
    const narrow = css.match(/@media \(min-width:\s*768px\)[\s\S]*?@container pending-bills-list \(max-width:\s*979\.98px\)\s*\{([\s\S]*?)\n\s{2}\}/)?.[1] ?? ''
    const branch = groupedRule(narrow, '.pending-bills__branch') ?? ''
    expect(branch).toMatch(/-webkit-line-clamp:\s*2/)
    expect(branch).toMatch(/overflow:\s*hidden/)
    const pill = groupedRule(narrow, '.pending-bills__state-pill') ?? ''
    expect(pill).toMatch(/max-width:\s*100%/)
    expect(pill).toMatch(/white-space:\s*normal/)
    expect(pill).toMatch(/height:\s*auto/)
    expect(groupedRule(narrow, '.pending-bills__state-label') ?? '').toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('keeps date, age, bill number and financial figures on one line in the table', () => {
    for (const column of ['date', 'age', 'bill', 'amount', 'balance']) {
      expect(groupedRule(css, `.pending-bills-table .money-table__cell--${column} .money-table__cell-value`) ?? '').toMatch(/white-space:\s*nowrap/)
    }
  })

  it('clamps long counterparty text to two lines on phone while retaining the full title', () => {
    const owes = rule('.pending-bills__owes')
    expect(owes).toMatch(/min-width:\s*0/)
    const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''
    const phoneOwes = groupedRule(phone, '.pending-bills__owes') ?? ''
    expect(phoneOwes).toMatch(/display:\s*-webkit-box/)
    expect(phoneOwes).toMatch(/-webkit-line-clamp:\s*2/)
    expect(phoneOwes).toMatch(/white-space:\s*normal/)
    expect(phoneOwes).toMatch(/overflow:\s*hidden/)
  })

  it('keeps the phone search and Filters door on one row and wraps disclosed age controls', () => {
    expect(rule('.pending-bills-branch-filter .mk-select__field') ?? '').toMatch(/min-height:\s*44px/)
    expect(rule('.pending-bills-age-filters button') ?? '').toMatch(/min-height:\s*44px/)
    expect(rule('.pending-bills-filter-bar .collection-toolbar__search') ?? '').toMatch(/min-height:\s*44px/)
    expect(rule('.pending-bills-filters-trigger') ?? '').toMatch(/min-height:\s*44px/)
    expect(rule('.pending-bills-filter-count') ?? '').toMatch(/border-radius:\s*var\(--radius-pill\)/)
    const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''
    expect(groupedRule(phone, '.pending-bills-filter-bar') ?? '').toMatch(/display:\s*grid/)
    expect(groupedRule(phone, '.pending-bills-filters-disclosure') ?? '').toMatch(/display:\s*contents/)
    expect(groupedRule(phone, '.pending-bills-filters-trigger') ?? '').toMatch(/grid-column:\s*2;[^}]*grid-row:\s*1/)
    expect(groupedRule(phone, '.pending-bills-filter-panel') ?? '').toMatch(/grid-column:\s*1\s*\/\s*-1/)
    expect(groupedRule(phone, '.pending-bills-filter-panel') ?? '').toMatch(/display:\s*flex/)
    expect(groupedRule(phone, '.pending-bills-age-filters') ?? '').toMatch(/flex-wrap:\s*wrap/)
    expect(groupedRule(phone, '.pending-bills-age-filters') ?? '').toMatch(/overflow:\s*visible/)
    expect(groupedRule(phone, '.pending-bills-age-filters') ?? '').not.toMatch(/overflow-x:\s*auto/)
    expect(groupedRule(phone, '.pending-bills-filter-bar .collection-toolbar__query') ?? '').toMatch(/grid-column:\s*1;[^}]*grid-row:\s*1/)
    expect(groupedRule(phone, '.pending-bills-view-toolbar > .view-tabs') ?? '').toMatch(/position:\s*static/)
    expect(groupedRule(phone, '.pending-bills-view-toolbar') ?? '').toMatch(/display:\s*flex/)
  })

  it('uses the stronger shared Money skeleton tone while loading', () => {
    const shellCss = readFileSync(resolve(process.cwd(), 'src/components/money/money-table-shell.css'), 'utf8')
    expect(shellCss).toMatch(/\.money-skeleton \.skeleton-bar\s*\{\s*background:\s*var\(--border\)/)
  })

  it('hides only allowed low-priority columns instead of adding horizontal scroll', () => {
    expect(rule('.pending-bills-table .money-table-scroll') ?? '').not.toMatch(/overflow-x:\s*auto/)
    expect(css).toMatch(/@container pending-bills-list \(max-width:\s*979\.98px\)/)
    expect(css).toMatch(/\.pending-bills-table \.money-table-scroll\s*\{\s*overflow-x:\s*hidden/)
    expect(rule('.pending-bills-list-column') ?? '').toMatch(/min-width:\s*0/)
  })

  it('keeps the phone summary to one line without a fixed selection overlay', () => {
    const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''
    const summary = groupedRule(phone, '.pending-bills-summary') ?? ''
    expect(summary).toMatch(/white-space:\s*nowrap/)
    expect(summary).toMatch(/font-size:\s*var\(--font-size-label\)/)
    expect(groupedRule(phone, '.pending-bills-selection-bar') ?? '').not.toMatch(/position:\s*fixed|position:\s*sticky/)
  })

  it('keeps phone selection controls tappable and the payment action in the page layout', () => {
    const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''
    expect(phone).toMatch(/\.pending-bills-table \.money-table__cell--select\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/)
    expect(phone).toMatch(/\.pending-bills__checkbox-target\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/)
    expect(phone).toMatch(/\.pending-bills-selection-bar\s*\{[^}]*flex-direction:\s*column/)
    expect(phone).not.toMatch(/\.pending-bills-selection-bar\s*\{[^}]*position:\s*sticky/)
  })

  it('lets the phone page scroll as one document so the list is not trapped in a short inner scroller', () => {
    const phone = css.match(/@media \(max-width:\s*767\.98px\)\s*\{([\s\S]*)$/)?.[1] ?? ''
    expect(groupedRule(phone, '.page-frame--v3:has(.pending-bills-body)') ?? '').toMatch(/overflow-x:\s*hidden;[^}]*overflow-y:\s*auto/)
    expect(groupedRule(phone, '.pending-bills-table .money-table-scroll') ?? '').toMatch(/overflow:\s*visible/)
    expect(groupedRule(phone, '.pending-bills-table .money-table-scroll') ?? '').not.toMatch(/overflow-y:\s*auto/)
    expect(phone).not.toMatch(/\.pending-bills-results\s*\{[^}]*flex:\s*1/)
    expect(phone).not.toMatch(/\.pending-bills-list-column\s*\{[^}]*min-height:\s*0/)
    expect(phone).not.toMatch(/\.pending-bills-selection-bar\s*\{[^}]*position:\s*sticky/)
    expect(groupedRule(phone, '.pending-bills-mobile-select-all') ?? '').toMatch(/display:\s*flex/)
    expect(groupedRule(phone, '.pending-bills-mobile-select-all') ?? '').toMatch(/min-height:\s*44px/)
    expect(groupedRule(phone, '.pending-bills-view-toolbar') ?? '').toMatch(/align-items:\s*center/)
  })

  it('uses the shared sticky record-panel rule and lets the viewer own scrolling', () => {
    expect(rule('.pending-bill-record-panel.drawer-split:not(.drawer-shell-split):not(.overlay-companion-host)')).toBeNull()
    expect(ruleIn(recordHostCss, '.drawer-split.drawer-split--sticky:not(.drawer-shell-split):not(.overlay-companion-host)')).toMatch(/position:\s*sticky/)
    expect(recordHostCss).toMatch(/\.drawer-split\.drawer-split--sticky\s*>\s*\.record-viewer[\s\S]*?overflow-y:\s*auto/)
  })
})
