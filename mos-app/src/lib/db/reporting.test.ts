// reporting.ts data module tests — TDD (AC-tagged).
// Covers FR-002 (RLS-backed reporting read), FR-003 (freshness), FR-004 (latest reporting day):
//  - queries the `reporting` schema — AC-003
//  - B2B/Roastery rows pass through unchanged — AC-006
//  - freshness helper returns the max snapshot_as_of — AC-007

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase at module scope — mirrors kitchen-logs.test.ts / ops-log.test.ts pattern.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import {
  listSalesDailyRevenue,
  latestSnapshotAsOf,
  latestReportingDate,
  type SalesDailyRevenueRow,
} from './reporting'

const schemaMock = vi.mocked(supabase.schema)

// ── Schema mock harness (mirrors kitchen-logs.test.ts) ──────────────────────
interface Recorder {
  schemaNames: string[]
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  gtes: Array<[string, unknown]>
  orders: Array<[string, unknown]>
}

function makeSchema(
  responses: Record<string, { data: unknown; error: unknown }[]>,
  rec: Recorder,
) {
  const counters: Record<string, number> = {}
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const result = () => {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const queue = responses[table] ?? []
      return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
    }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => {
      if (s) rec.selects.push(s)
      return builder
    })
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.gte = vi.fn((c: string, v: unknown) => {
      rec.gtes.push([c, v])
      return builder
    })
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { schemaNames: [], fromTables: [], selects: [], eqs: [], gtes: [], orders: [] }
}

beforeEach(() => vi.clearAllMocks())

const B2B_ROASTERY_ROW: SalesDailyRevenueRow = {
  revenue_date: '2026-06-30',
  channel: 'B2B',
  esb_code: 'GRI',
  branch_code: 'GRI',
  branch_name: 'Gordi Roastery',
  transactions: 12,
  clean_revenue: 4_500_000,
  snapshot_as_of: '2026-07-01T02:00:00Z',
  source_contract_version: 'v_daily_revenue_unified.v1',
}

const POS_ROW: SalesDailyRevenueRow = {
  revenue_date: '2026-06-29',
  channel: 'POS',
  esb_code: 'GHQ',
  branch_code: 'GHQ',
  branch_name: 'Gordi HQ',
  transactions: 80,
  clean_revenue: 12_300_000,
  snapshot_as_of: '2026-07-01T02:00:00Z',
  source_contract_version: 'v_daily_revenue_unified.v1',
}

// ── listSalesDailyRevenue ─────────────────────────────────────────────────────
describe('listSalesDailyRevenue', () => {
  it('queries the reporting schema and sales_daily_revenue table, ordered by date — AC-003', async () => {
    const rec = freshRec()
    schemaMock.mockImplementation((name: string) => {
      rec.schemaNames.push(name)
      return makeSchema(
        { sales_daily_revenue: [{ data: [POS_ROW, B2B_ROASTERY_ROW], error: null }] },
        rec,
      ) as never
    })

    const rows = await listSalesDailyRevenue()

    expect(schemaMock).toHaveBeenCalledWith('reporting')
    expect(rec.fromTables).toContain('sales_daily_revenue')
    expect(rec.orders).toContainEqual(['revenue_date', { ascending: true }])
    expect(rows).toHaveLength(2)
  })

  it('never sends org_id as a query filter (RLS scopes it)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_daily_revenue: [{ data: [], error: null }] }, rec) as never,
    )

    await listSalesDailyRevenue()

    expect(rec.eqs.map(([col]) => col)).not.toContain('org_id')
  })

  it('applies a sinceDays filter as a gte on revenue_date when provided', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_daily_revenue: [{ data: [], error: null }] }, rec) as never,
    )

    await listSalesDailyRevenue({ sinceDays: 30 })

    expect(rec.gtes).toHaveLength(1)
    expect(rec.gtes[0][0]).toBe('revenue_date')
  })

  it('passes B2B/Roastery rows through unchanged — AC-006', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { sales_daily_revenue: [{ data: [B2B_ROASTERY_ROW], error: null }] },
        rec,
      ) as never,
    )

    const rows = await listSalesDailyRevenue()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(B2B_ROASTERY_ROW)
    expect(rows[0].channel).toBe('B2B')
    expect(rows[0].branch_code).toBe('GRI')
    expect(rows[0].branch_name).toBe('Gordi Roastery')
  })

  it('returns an empty array when there are no rows (empty snapshot)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_daily_revenue: [{ data: null, error: null }] }, rec) as never,
    )

    const rows = await listSalesDailyRevenue()
    expect(rows).toEqual([])
  })

  it('throws a clear, surfaceable error on PostgREST failure', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { sales_daily_revenue: [{ data: null, error: { message: 'permission denied' } }] },
        rec,
      ) as never,
    )

    await expect(listSalesDailyRevenue()).rejects.toThrow('listSalesDailyRevenue failed')
  })
})

// ── latestSnapshotAsOf ─────────────────────────────────────────────────────────
describe('latestSnapshotAsOf', () => {
  it('returns the max snapshot_as_of across rows — AC-007 (freshness)', () => {
    const rows: SalesDailyRevenueRow[] = [
      { ...POS_ROW, snapshot_as_of: '2026-06-30T02:00:00Z' },
      { ...B2B_ROASTERY_ROW, snapshot_as_of: '2026-07-01T02:00:00Z' },
    ]
    expect(latestSnapshotAsOf(rows)).toBe('2026-07-01T02:00:00Z')
  })

  it('returns null for an empty list', () => {
    expect(latestSnapshotAsOf([])).toBeNull()
  })
})

// ── latestReportingDate ────────────────────────────────────────────────────────
describe('latestReportingDate', () => {
  it('returns the max revenue_date across rows — FR-004', () => {
    const rows: SalesDailyRevenueRow[] = [
      { ...POS_ROW, revenue_date: '2026-06-29' },
      { ...B2B_ROASTERY_ROW, revenue_date: '2026-06-30' },
    ]
    expect(latestReportingDate(rows)).toBe('2026-06-30')
  })

  it('returns null for an empty list', () => {
    expect(latestReportingDate([])).toBeNull()
  })
})
