// dashboard.test.ts — pure-selector tests for the /dashboard KPI set (Track B).
// AC-tagged per AGENTS.md test-pyramid rule. Covers the new selectors in
// lib/dashboard.ts: revenue KPIs, gross margin/COGS (basis-labelled), cut
// aggregation, window-spec, DQ badge, NULL-margin handling.

import { describe, it, expect } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import {
  computeRevenueKpis,
  computeGrossMarginKpis,
  aggregateByCut,
  resolveWindow,
  compareWindow,
  availableWindowBounds,
  basisLabel,
  formatGrossMarginValue,
  formatMarginPct,
  DEFAULT_WINDOW,
} from '@/lib/dashboard'

// ── Fixtures ─────────────────────────────────────────────────────────────────────
// 60 days of revenue: POS + B2B across two branches. latestDate = 2026-06-30.
function makeRevenueRow(
  date: string,
  channel: 'POS' | 'B2B',
  branchCode: string,
  branchName: string,
  revenue: number,
  txn = 100,
  esbCode = channel === 'B2B' ? 'GRI' : 'GKID',
): SalesDailyRevenueRow {
  return {
    revenue_date: date,
    channel,
    esb_code: esbCode,
    branch_code: branchCode,
    branch_name: branchName,
    transactions: txn,
    clean_revenue: revenue,
    snapshot_as_of: '2026-07-01T00:00:00Z',
    source_contract_version: 'v1',
  }
}

const LATEST = '2026-06-30'

function isoDaysFrom(dateIso: string, delta: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// 60 days ending at LATEST: POS @ GHQ 10M/day, B2B @ GRI 5M/day.
function sixtyDaysRevenue(): SalesDailyRevenueRow[] {
  const rows: SalesDailyRevenueRow[] = []
  for (let i = 59; i >= 0; i--) {
    const d = isoDaysFrom(LATEST, -i)
    rows.push(makeRevenueRow(d, 'POS', 'GHQ', 'Gordi HQ', 10_000_000, 200))
    rows.push(makeRevenueRow(d, 'B2B', 'GRI', 'Gordi Roastery', 5_000_000, 10))
  }
  return rows
}

// Margin rows: POS @ GHQ only, revenue 10M, cogs 6M → margin 4M (40%).
function sixtyDaysMargin(coverage = 0.95): SalesMarginDailyRow[] {
  const rows: SalesMarginDailyRow[] = []
  for (let i = 59; i >= 0; i--) {
    const d = isoDaysFrom(LATEST, -i)
    rows.push({
      margin_date: d,
      esb_code: 'GKID',
      branch_code: 'GHQ',
      branch_name: 'Gordi HQ',
      revenue: 10_000_000,
      cogs_interim_sm: 6_000_000,
      cogs_budget_bom: 5_500_000,
      margin_interim: 4_000_000,
      margin_interim_pct: 0.4,
      bom_coverage_pct: coverage,
      snapshot_as_of: '2026-07-01T00:00:00Z',
      source_contract_version: 'pos_margin_interim.v1',
    })
  }
  return rows
}

// ── resolveWindow + compareWindow ────────────────────────────────────────────────
describe('resolveWindow', () => {
  it('AC-013: preset 7d resolves to [latestDate-6, latestDate]', () => {
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    expect(start).toBe(isoDaysFrom(LATEST, -6))
    expect(end).toBe(LATEST)
  })

  it('AC-013: preset 30d resolves to [latestDate-29, latestDate]', () => {
    const { start, end } = resolveWindow({ kind: 'preset', days: 30 }, LATEST)
    expect(start).toBe(isoDaysFrom(LATEST, -29))
    expect(end).toBe(LATEST)
  })

  it('AC-014: custom range passes through unchanged', () => {
    const { start, end } = resolveWindow({ kind: 'custom', from: '2026-06-10', to: '2026-06-20' }, LATEST)
    expect(start).toBe('2026-06-10')
    expect(end).toBe('2026-06-20')
  })
})

describe('compareWindow', () => {
  it('AC-014: custom range compare = same-length immediately preceding window', () => {
    // window 2026-06-10 → 2026-06-20 (11 days). Prior = 2026-05-30 → 2026-06-09.
    const cw = compareWindow({ kind: 'custom', from: '2026-06-10', to: '2026-06-20' })
    expect(cw.days).toBe(11)
    expect(cw.from).toBe('2026-05-30')
    expect(cw.to).toBe('2026-06-09')
  })
})

describe('availableWindowBounds', () => {
  it('returns earliest + latest revenue_date for date-picker bounds', () => {
    const rows = sixtyDaysRevenue()
    const bounds = availableWindowBounds(rows)
    expect(bounds).not.toBeNull()
    expect(bounds!.latest).toBe(LATEST)
    expect(bounds!.earliest).toBe(isoDaysFrom(LATEST, -59))
  })

  it('returns null for empty rows', () => {
    expect(availableWindowBounds([])).toBeNull()
  })
})

// ── computeRevenueKpis ───────────────────────────────────────────────────────────
describe('computeRevenueKpis', () => {
  it('AC-005: anchors to latestDate, not Date.now() (latest date before today)', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // 7 days × (10M POS + 5M B2B) = 105M
    expect(kpis.trailing.current).toBe(105_000_000)
  })

  it('AC-006: delta compares equal windows (7d WoW)', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // Uniform daily revenue → prior == current → 0% change effectively, but prior is non-null.
    expect(kpis.trailing.prior).toBe(105_000_000)
  })

  it('AC-006: detects a WoW change when recent days differ', () => {
    const rows = sixtyDaysRevenue()
    // Bump the last 3 days POS revenue to 15M (+50%).
    for (let i = 0; i < 3; i++) {
      const r = rows.find(r => r.revenue_date === isoDaysFrom(LATEST, -i) && r.channel === 'POS')!
      r.clean_revenue = 15_000_000
    }
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // current = 4×10M + 3×15M + 7×5M = 40+45+35 = 120M; prior = 105M
    expect(kpis.trailing.current).toBe(120_000_000)
    expect(kpis.trailing.prior).toBe(105_000_000)
  })

  it('AC-007: B2B/Roastery revenue included in totals', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // B2B = 5M/day × 7 = 35M included.
    expect(kpis.trailing.current).toBeGreaterThan(35_000_000)
  })

  it('AC-009: channelMix is a "POS x% · B2B y%" string', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.channelMix).toMatch(/POS \d+% · B2B \d+%/)
    expect(kpis.channelMix).toBe('POS 67% · B2B 33%')
  })

  it('computes avgCheck = revenue / transactions', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // revenue 105M, transactions (200+10)×7 = 1470 → avgCheck = 71428
    expect(kpis.avgCheck).toBe(Math.round(105_000_000 / 1470))
  })

  it('latestDay = revenue on the latest reporting date', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, DEFAULT_WINDOW, LATEST)
    expect(kpis.latestDay).toBe(15_000_000) // 10M POS + 5M B2B
  })

  it('AC-014: custom range computes current + prior correctly', () => {
    const rows = sixtyDaysRevenue()
    const kpis = computeRevenueKpis(rows, { kind: 'custom', from: isoDaysFrom(LATEST, -6), to: LATEST }, LATEST)
    expect(kpis.trailing.current).toBe(105_000_000) // same 7 days
    expect(kpis.trailing.prior).toBe(105_000_000) // uniform → equal
  })

  it('returns prior=null when no rows exist before the window', () => {
    // Only 3 days of data — a 7d window can't have a prior 7d window.
    const rows = [
      makeRevenueRow(isoDaysFrom(LATEST, -2), 'POS', 'GHQ', 'Gordi HQ', 10_000_000),
      makeRevenueRow(isoDaysFrom(LATEST, -1), 'POS', 'GHQ', 'Gordi HQ', 10_000_000),
      makeRevenueRow(LATEST, 'POS', 'GHQ', 'Gordi HQ', 10_000_000),
    ]
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.trailing.prior).toBeNull()
  })

  it('avgCheck=null when no transactions', () => {
    const rows = [makeRevenueRow(LATEST, 'POS', 'GHQ', 'Gordi HQ', 10_000_000, 0)]
    const kpis = computeRevenueKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.avgCheck).toBeNull()
  })
})

// ── computeGrossMarginKpis ───────────────────────────────────────────────────────
describe('computeGrossMarginKpis', () => {
  it('AC-008: margin tiles carry basis label "interim — stock-movement"', () => {
    const kpis = computeGrossMarginKpis(sixtyDaysMargin(), DEFAULT_WINDOW, LATEST)
    expect(kpis.basis).toBe('interim-stock-movement')
    expect(basisLabel(kpis.basis)).toBe('interim — stock-movement')
  })

  it('computes margin = revenue - cogs over the window', () => {
    const kpis = computeGrossMarginKpis(sixtyDaysMargin(), { kind: 'preset', days: 7 }, LATEST)
    // 7 days × (10M rev - 6M cogs) = 28M margin
    expect(kpis.marginAmount).toBe(28_000_000)
    expect(kpis.cogsAmount).toBe(42_000_000)
  })

  it('computes marginPct = margin / revenue', () => {
    const kpis = computeGrossMarginKpis(sixtyDaysMargin(), { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.marginPct).toBeCloseTo(0.4, 2) // 28M / 70M = 0.4
  })

  it('AC-024: DQ badge = good when bom_coverage ≥ 0.9', () => {
    const kpis = computeGrossMarginKpis(sixtyDaysMargin(0.95), { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.dq).toBe('good')
  })

  it('AC-024: DQ badge = partial when bom_coverage 0.5–0.9', () => {
    const kpis = computeGrossMarginKpis(sixtyDaysMargin(0.7), { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.dq).toBe('partial')
  })

  it('AC-024: DQ badge = unknown when bom_coverage null/all-null', () => {
    const rows = sixtyDaysMargin().map(r => ({ ...r, bom_coverage_pct: null }))
    const kpis = computeGrossMarginKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.dq).toBe('unknown')
  })

  it('NULL cogs (sync-gap day): excluded from sums, margin never faked to 0', () => {
    const rows = sixtyDaysMargin()
    // Null out the COGS for 3 days in the 7d window.
    rows[59].cogs_interim_sm = null // latest day
    rows[58].cogs_interim_sm = null
    rows[57].cogs_interim_sm = null
    const kpis = computeGrossMarginKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    // 4 known days × 4M margin = 16M (3 sync-gap days excluded)
    expect(kpis.marginAmount).toBe(16_000_000)
    expect(kpis.cogsAmount).toBe(24_000_000)
  })

  it('marginAmount=null when ALL days in window are sync-gap (null cogs)', () => {
    const rows = sixtyDaysMargin().map(r => ({ ...r, cogs_interim_sm: null }))
    const kpis = computeGrossMarginKpis(rows, { kind: 'preset', days: 7 }, LATEST)
    expect(kpis.marginAmount).toBeNull()
    expect(kpis.cogsAmount).toBeNull()
    expect(kpis.marginPct).toBeNull()
    expect(kpis.delta).toBeNull()
  })
})

// ── aggregateByCut ───────────────────────────────────────────────────────────────
describe('aggregateByCut', () => {
  it('AC-012: Branch cut groups by branch', () => {
    const rev = sixtyDaysRevenue().slice(-14) // last 14 days
    const marg = sixtyDaysMargin().slice(-14)
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    const rows = aggregateByCut(rev, marg, 'Branch', start, end)
    const dims = rows.map(r => r.dimension)
    expect(dims).toContain('Gordi HQ')
    expect(dims).toContain('Gordi Roastery')
  })

  it('AC-012: Channel cut collapses to POS vs B2B', () => {
    const rev = sixtyDaysRevenue().slice(-14)
    const marg = sixtyDaysMargin().slice(-14)
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    const rows = aggregateByCut(rev, marg, 'Channel', start, end)
    const dims = rows.map(r => r.dimension).sort()
    expect(dims).toEqual(['B2B', 'POS'])
  })

  it('AC-012: Activity cut groups POS→Cafe Ops, B2B→Roastery', () => {
    const rev = sixtyDaysRevenue().slice(-14)
    const marg = sixtyDaysMargin().slice(-14)
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    const rows = aggregateByCut(rev, marg, 'Activity', start, end)
    const dims = rows.map(r => r.dimension).sort()
    expect(dims).toEqual(['Cafe Ops', 'Roastery'])
  })

  it('computes sharePct and avgCheck per group', () => {
    const rev = sixtyDaysRevenue().slice(-14)
    const marg = sixtyDaysMargin().slice(-14)
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    const rows = aggregateByCut(rev, marg, 'Channel', start, end)
    const pos = rows.find(r => r.dimension === 'POS')!
    expect(pos.sharePct).toBeCloseTo(66.7, 1) // 70M / 105M
    expect(pos.avgCheck).toBe(50_000) // 70M / 1400 txn
  })

  it('returns empty array for no rows', () => {
    const { start, end } = resolveWindow({ kind: 'preset', days: 7 }, LATEST)
    expect(aggregateByCut([], [], 'Branch', start, end)).toEqual([])
  })
})

// ── Display helpers ──────────────────────────────────────────────────────────────
describe('formatGrossMarginValue', () => {
  it('formats a non-null amount compactly', () => {
    expect(formatGrossMarginValue(28_000_000)).toBe('Rp 28 jt')
  })
  it('returns em-dash for null (sync-gap)', () => {
    expect(formatGrossMarginValue(null)).toBe('—')
  })
})

describe('formatMarginPct', () => {
  it('formats a percentage with comma decimal', () => {
    expect(formatMarginPct(0.423)).toBe('42,3%')
  })
  it('returns em-dash for null', () => {
    expect(formatMarginPct(null)).toBe('—')
  })
})

describe('basisLabel', () => {
  it('labels each basis distinctly', () => {
    expect(basisLabel('interim-stock-movement')).toBe('interim — stock-movement')
    expect(basisLabel('budget-bom')).toBe('budget — BOM')
    expect(basisLabel('certified-gl')).toBe('certified — GL')
  })
})
