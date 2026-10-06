// home-kpis.ts selector tests — TDD (AC-tagged).
// Covers AC-HK01 (trailing margin window sum + prior-window delta) and AC-HK02
// (NULL margin never renders as a fake 0/NaN — "no data"/"no comparison").

import { describe, it, expect } from 'vitest'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import {
  trailingMargin,
  formatMarginKpi,
} from './home-kpis'
import { translateFor } from '@/i18n/use-t'

function marginRow(overrides: Partial<SalesMarginDailyRow>): SalesMarginDailyRow {
  return {
    margin_date: '2026-06-30',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    revenue: 10_000_000,
    cogs_interim_sm: 6_000_000,
    cogs_budget_bom: 5_800_000,
    margin_interim: 4_000_000,
    branch_id: null,
    bom_coverage_pct: 0.95,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'pos_margin_interim.v1',
    ...overrides,
  }
}

// ── trailingMargin (AC-HK01) ──────────────────────────────────────────────────
describe('trailingMargin', () => {
  it('AC-HK01: sums margin_interim over the trailing window anchored to latestDate', () => {
    const rows = [
      marginRow({ margin_date: '2026-06-24', margin_interim: 1_000_000 }),
      marginRow({ margin_date: '2026-06-25', margin_interim: 1_000_000 }),
      marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.current).toBe(4_000_000)
  })

  it('AC-HK01: returns the prior equal-length window sum when prior rows exist', () => {
    const rows = [
      // prior window: 2026-06-16..2026-06-22 (days-7)
      marginRow({ margin_date: '2026-06-18', margin_interim: 500_000 }),
      // current window: 2026-06-24..2026-06-30
      marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.prior).toBe(500_000)
  })

  it('AC-HK01: returns prior=null when no rows exist in the prior window', () => {
    const rows = [marginRow({ margin_date: '2026-06-30', margin_interim: 2_000_000 })]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.prior).toBeNull()
  })

  it('AC-HK02: rows with NULL margin_interim contribute nothing to the sum (never a fake number)', () => {
    const rows = [
      marginRow({ margin_date: '2026-06-29', margin_interim: null, cogs_interim_sm: null }),
      marginRow({ margin_date: '2026-06-30', margin_interim: 1_000_000 }),
    ]
    const w = trailingMargin(rows, '2026-06-30', 7)
    expect(w.current).toBe(1_000_000)
  })
})

// ── formatMarginKpi (AC-HK02) ─────────────────────────────────────────────────
describe('formatMarginKpi', () => {
  it('AC-HK02: formats value + delta + a margin-pct sub when pct is present', () => {
    const display = formatMarginKpi({ current: 4_000_000, prior: 2_000_000 }, 0.4, translateFor('en'))
    expect(display.value).toMatch(/Rp/)
    expect(display.delta.tone).toBe('success')
    expect(display.pctSub).toMatch(/40(\.0)?% margin/)
  })

  it('AC-HK02: pct is null (not NaN) when revenue was 0/absent — sub is blank, delta is "no comparison"', () => {
    const display = formatMarginKpi({ current: 0, prior: null }, null, translateFor('en'))
    expect(display.delta.text).toBe('no comparison')
    expect(display.pctSub).toBe('')
  })
})
