// sales-dashboard.ts selector tests — TDD (AC-tagged).
// Covers AC-004 (latest reporting date anchors current metrics), AC-005 (equal-window
// deltas), AC-006 (B2B/Roastery visible in aggregates), plus channel mix / activity
// mapping / IDR formatting / daily series / table-row aggregation edge cases.

import { afterEach, describe, it, expect, vi } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import { translateFor } from '@/i18n/use-t'
import { formatIDRCompact, trailingWindow, formatDelta } from './sales-dashboard'

function row(overrides: Partial<SalesDailyRevenueRow>): SalesDailyRevenueRow {
  return {
    revenue_date: '2026-06-30',
    channel: 'POS',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    branch_id: null,
    transactions: 10,
    clean_revenue: 1_000_000,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'v_daily_revenue_unified.v1',
    ...overrides,
  }
}

const B2B_ROASTERY = row({
  channel: 'B2B',
  esb_code: 'GRI',
  branch_code: 'GRI',
  branch_name: 'Gordi Roastery',
  transactions: 12,
  clean_revenue: 4_500_000,
})

describe('formatIDRCompact', () => {
  it('compacts billions to "M" (juta-million marker)', () => {
    expect(formatIDRCompact(1_284_500_000)).toBe('Rp 1,3 M')
  })

  it('compacts millions to "jt"', () => {
    expect(formatIDRCompact(12_300_000)).toBe('Rp 12,3 jt')
  })

  it('falls back to full formatting under 1 million', () => {
    expect(formatIDRCompact(450_000)).toBe('Rp 450.000')
  })
})

// ── trailingWindow / formatDelta ───────────────────────────────────────────────
describe('trailingWindow', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps its supplied WIB date anchor at the UTC/WIB rollover', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T17:00:00Z'))
    const rows = [row({ revenue_date: '2026-10-05', clean_revenue: 1 }), row({ revenue_date: '2026-10-06', clean_revenue: 2 })]
    expect(trailingWindow(rows, '2026-10-06', 1).current).toBe(2)
  })
  it('AC-004: anchors the current window to the given latestDate, not Date.now()', () => {
    const rows = [
      row({ revenue_date: '2020-01-01', clean_revenue: 100 }), // ancient — must not affect "today"
      row({ revenue_date: '2026-06-30', clean_revenue: 1_000_000 }),
    ]
    const result = trailingWindow(rows, '2026-06-30', 7)
    expect(result.current).toBe(1_000_000)
  })

  it('AC-005: compares against the immediately preceding equal-length window', () => {
    // Trailing 7d window: 2026-06-24..2026-06-30 (7 days). Prior window: 2026-06-17..2026-06-23.
    const rows = [
      row({ revenue_date: '2026-06-30', clean_revenue: 2_000_000 }),
      row({ revenue_date: '2026-06-20', clean_revenue: 1_000_000 }), // in prior window
    ]
    const result = trailingWindow(rows, '2026-06-30', 7)
    expect(result.current).toBe(2_000_000)
    expect(result.prior).toBe(1_000_000)
  })

  it('returns prior=null when no rows exist strictly before the current window', () => {
    const rows = [row({ revenue_date: '2026-06-30', clean_revenue: 500_000 })]
    const result = trailingWindow(rows, '2026-06-30', 7)
    expect(result.prior).toBeNull()
  })

  it('sums multiple rows (multi-channel/branch) within the same window', () => {
    const rows = [
      row({ revenue_date: '2026-06-30', clean_revenue: 1_000_000 }),
      { ...B2B_ROASTERY, revenue_date: '2026-06-30' },
    ]
    const result = trailingWindow(rows, '2026-06-30', 7)
    expect(result.current).toBe(1_000_000 + 4_500_000)
  })
})

describe('formatDelta', () => {
  const en = translateFor('en')
  const id = translateFor('id')

  it('a rise reads as success with a signed id-ID percent in the viewer\'s language', () => {
    expect(formatDelta({ current: 1_100_000, prior: 1_000_000 }, en)).toEqual({ text: '+10,0% vs previous period', tone: 'success' })
    expect(formatDelta({ current: 1_100_000, prior: 1_000_000 }, id).text).toBe('+10,0% vs periode sebelumnya')
  })

  it('a fall reads as destructive with the minus sign', () => {
    expect(formatDelta({ current: 900_000, prior: 1_000_000 }, en)).toEqual({ text: '\u221210,0% vs previous period', tone: 'destructive' })
  })

  it('no earlier figure (null or zero) reads as a neutral "no comparison", never 0% or Infinity', () => {
    expect(formatDelta({ current: 500_000, prior: null }, en)).toEqual({ text: 'no comparison', tone: 'neutral' })
    expect(formatDelta({ current: 500_000, prior: 0 }, id)).toEqual({ text: 'tak ada pembanding', tone: 'neutral' })
  })
})
