// sales-dashboard.ts selector tests — TDD (AC-tagged).
// Covers AC-004 (latest reporting date anchors current metrics), AC-005 (equal-window
// deltas), AC-006 (B2B/Roastery visible in aggregates), plus channel mix / activity
// mapping / IDR formatting / daily series / table-row aggregation edge cases.

import { describe, it, expect } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import {
  activityMap,
  formatIDRCompact,
  formatIDRFull,
  trailingWindow,
  formatDelta,
  channelMixLabel,
  dailySeries,
  revenueTableRows,
  sortRevenueRows,
  computeSalesKpis,
} from './sales-dashboard'

function row(overrides: Partial<SalesDailyRevenueRow>): SalesDailyRevenueRow {
  return {
    revenue_date: '2026-06-30',
    channel: 'POS',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
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

// ── activityMap ────────────────────────────────────────────────────────────────
describe('activityMap', () => {
  it('maps POS to Cafe Ops', () => {
    expect(activityMap(row({ channel: 'POS', esb_code: 'GHQ' }))).toBe('Cafe Ops')
    expect(activityMap(row({ channel: 'POS', esb_code: 'SKC' }))).toBe('Cafe Ops')
    expect(activityMap(row({ channel: 'POS', esb_code: 'GGS' }))).toBe('Cafe Ops')
    expect(activityMap(row({ channel: 'POS', esb_code: 'RRS' }))).toBe('Cafe Ops')
  })

  it('AC-006: maps B2B/GRI to Roastery', () => {
    expect(activityMap(B2B_ROASTERY)).toBe('Roastery')
  })

  it('maps unknown channel/esb_code to Unmapped', () => {
    expect(activityMap(row({ channel: 'ONLINE', esb_code: 'XYZ' }))).toBe('Unmapped')
  })
})

// ── IDR formatting ─────────────────────────────────────────────────────────────
describe('formatIDRFull', () => {
  it('formats a whole-rupiah amount with thousands grouping', () => {
    expect(formatIDRFull(1_284_500_000)).toBe('Rp 1.284.500.000')
  })

  it('formats negative amounts with a leading minus before Rp', () => {
    expect(formatIDRFull(-500_000)).toBe('-Rp 500.000')
  })

  it('formats zero', () => {
    expect(formatIDRFull(0)).toBe('Rp 0')
  })
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
  it('formats a positive delta as success tone with a % string', () => {
    const d = formatDelta({ current: 1_100_000, prior: 1_000_000 })
    expect(d.tone).toBe('success')
    expect(d.text).toContain('+10')
    expect(d.text).toContain('%')
  })

  it('formats a negative delta as destructive tone', () => {
    const d = formatDelta({ current: 900_000, prior: 1_000_000 })
    expect(d.tone).toBe('destructive')
    expect(d.text).toContain('-10')
  })

  it('renders neutral "no comparison" (never 0%/NaN) when prior is null', () => {
    const d = formatDelta({ current: 500_000, prior: null })
    expect(d.tone).toBe('neutral')
    expect(d.text).toBe('no comparison')
    expect(d.text).not.toMatch(/NaN|Infinity/)
  })

  it('renders neutral "no comparison" when prior is exactly 0 (avoids +Infinity%)', () => {
    const d = formatDelta({ current: 500_000, prior: 0 })
    expect(d.tone).toBe('neutral')
    expect(d.text).not.toMatch(/NaN|Infinity/)
  })
})

// ── channelMixLabel ─────────────────────────────────────────────────────────────
describe('channelMixLabel', () => {
  it('AC-006: shows a POS/B2B split string with Roastery revenue included', () => {
    const rows = [
      row({ channel: 'POS', clean_revenue: 8_000_000 }),
      B2B_ROASTERY, // clean_revenue 4_500_000, channel B2B
    ]
    const label = channelMixLabel(rows)
    expect(label).toContain('POS')
    expect(label).toContain('B2B')
    // 8m / 12.5m = 64%, 4.5m / 12.5m = 36%
    expect(label).toMatch(/POS 64%/)
    expect(label).toMatch(/B2B 36%/)
  })

  it('returns "No revenue" for an empty rows list', () => {
    expect(channelMixLabel([])).toBe('No revenue')
  })
})

// ── dailySeries ──────────────────────────────────────────────────────────────────
describe('dailySeries', () => {
  it('groups revenue by date and channel, sorted ascending by date', () => {
    const rows = [
      row({ revenue_date: '2026-06-30', channel: 'POS', clean_revenue: 1_000_000 }),
      { ...B2B_ROASTERY, revenue_date: '2026-06-30' },
      row({ revenue_date: '2026-06-29', channel: 'POS', clean_revenue: 500_000 }),
    ]
    const series = dailySeries(rows)
    expect(series).toHaveLength(2)
    expect(series[0].date).toBe('2026-06-29')
    expect(series[1].date).toBe('2026-06-30')
    expect(series[1].byChannel.POS).toBe(1_000_000)
    expect(series[1].byChannel.B2B).toBe(4_500_000)
    expect(series[1].total).toBe(5_500_000)
  })

  it('returns an empty array for no rows', () => {
    expect(dailySeries([])).toEqual([])
  })
})

// ── revenueTableRows ──────────────────────────────────────────────────────────────
describe('revenueTableRows', () => {
  const rows = [
    row({ branch_code: 'GHQ', branch_name: 'Gordi HQ', channel: 'POS', clean_revenue: 8_000_000, transactions: 80 }),
    { ...B2B_ROASTERY, transactions: 12, clean_revenue: 2_000_000 },
  ]

  it('AC-006: Branch cut keeps B2B/Roastery visible with its own branch row', () => {
    const table = revenueTableRows(rows, 'Branch')
    const roastery = table.find(r => r.dimension === 'Gordi Roastery')
    expect(roastery).toBeDefined()
    expect(roastery!.channel).toBe('B2B')
    expect(roastery!.revenue).toBe(2_000_000)
  })

  it('Activity cut groups POS under Cafe Ops and B2B under Roastery', () => {
    const table = revenueTableRows(rows, 'Activity')
    expect(table.find(r => r.dimension === 'Cafe Ops')).toBeDefined()
    expect(table.find(r => r.dimension === 'Roastery')).toBeDefined()
  })

  it('computes share-of-total and avg revenue per transaction', () => {
    const table = revenueTableRows(rows, 'Branch')
    const ghq = table.find(r => r.dimension === 'Gordi HQ')!
    // total = 10,000,000; GHQ share = 80%
    expect(ghq.sharePct).toBe(80)
    expect(ghq.avgRevenuePerTxn).toBe(100_000)
  })

  it('groups unmapped branch/channel under Unmapped in Activity view only', () => {
    const onlineRow = row({ channel: 'ONLINE', esb_code: 'XYZ', branch_code: 'XYZ', branch_name: 'Unknown Channel', clean_revenue: 300_000 })
    const activityTable = revenueTableRows([...rows, onlineRow], 'Activity')
    expect(activityTable.find(r => r.dimension === 'Unmapped')).toBeDefined()

    const branchTable = revenueTableRows([...rows, onlineRow], 'Branch')
    expect(branchTable.find(r => r.dimension === 'Unmapped')).toBeUndefined()
    expect(branchTable.find(r => r.dimension === 'Unknown Channel')).toBeDefined()
  })

  it('returns an empty array for no rows', () => {
    expect(revenueTableRows([], 'Branch')).toEqual([])
  })
})

// ── sortRevenueRows (FR-009) ────────────────────────────────────────────────────────
describe('sortRevenueRows', () => {
  const table = revenueTableRows(
    [
      row({ branch_code: 'GHQ', branch_name: 'Gordi HQ', channel: 'POS', clean_revenue: 8_000_000, transactions: 80 }),
      { ...B2B_ROASTERY, transactions: 12, clean_revenue: 2_000_000 },
    ],
    'Branch',
  )

  it('sorts by a numeric column ascending', () => {
    const sorted = sortRevenueRows(table, { key: 'revenue', dir: 'asc' })
    expect(sorted.map(r => r.dimension)).toEqual(['Gordi Roastery', 'Gordi HQ'])
  })

  it('sorts by a numeric column descending', () => {
    const sorted = sortRevenueRows(table, { key: 'revenue', dir: 'desc' })
    expect(sorted.map(r => r.dimension)).toEqual(['Gordi HQ', 'Gordi Roastery'])
  })

  it('sorts by a string column (dimension) ascending/descending', () => {
    expect(sortRevenueRows(table, { key: 'dimension', dir: 'asc' }).map(r => r.dimension)).toEqual([
      'Gordi HQ',
      'Gordi Roastery',
    ])
    expect(sortRevenueRows(table, { key: 'dimension', dir: 'desc' }).map(r => r.dimension)).toEqual([
      'Gordi Roastery',
      'Gordi HQ',
    ])
  })

  it('does not mutate the input array', () => {
    const original = [...table]
    sortRevenueRows(table, { key: 'revenue', dir: 'asc' })
    expect(table).toEqual(original)
  })

  it('returns the input order unchanged when sort is undefined', () => {
    expect(sortRevenueRows(table, undefined)).toEqual(table)
  })
})

// ── computeSalesKpis ──────────────────────────────────────────────────────────────
describe('computeSalesKpis', () => {
  it('AC-004/005/006: bundles latest-day, 7d/30d windows, and channel mix anchored to latestDate', () => {
    const rows = [
      row({ revenue_date: '2026-06-30', channel: 'POS', clean_revenue: 8_000_000 }),
      { ...B2B_ROASTERY, revenue_date: '2026-06-30' },
    ]
    const kpis = computeSalesKpis(rows, '2026-06-30')
    expect(kpis.latestReportingDate).toBe('2026-06-30')
    expect(kpis.latestDayRevenue).toBe(8_000_000 + 4_500_000)
    expect(kpis.trailing7d.current).toBe(8_000_000 + 4_500_000)
    expect(kpis.trailing30d.current).toBe(8_000_000 + 4_500_000)
    expect(kpis.channelMix).toContain('POS')
    expect(kpis.channelMix).toContain('B2B')
  })
})
