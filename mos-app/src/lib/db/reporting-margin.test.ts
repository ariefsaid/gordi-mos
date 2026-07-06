// reporting-margin.ts data module tests — TDD (AC-tagged).
// Covers the §7a-corrected reporting.sales_margin_daily contract: queries the
// `reporting` schema (mirrors reporting.ts's RLS-backed pattern — org_id is never
// sent, RLS scopes it), the POS-only/no-channel grain, and freshness.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase at module scope — mirrors reporting.test.ts / kitchen-logs.test.ts pattern.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import {
  listSalesMarginDaily,
  latestMarginSnapshotAsOf,
  type SalesMarginDailyRow,
} from './reporting-margin'

const schemaMock = vi.mocked(supabase.schema)

// ── Schema mock harness (mirrors reporting.test.ts) ──────────────────────────
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

const POS_ROW: SalesMarginDailyRow = {
  margin_date: '2026-06-29',
  esb_code: 'GHQ',
  branch_code: 'GHQ',
  branch_name: 'Gordi HQ',
  revenue: 12_300_000,
  cogs_interim_sm: 6_800_000,
  cogs_budget_bom: 6_500_000,
  margin_interim: 5_500_000,
  margin_interim_pct: 0.4472,
  bom_coverage_pct: 0.92,
  snapshot_as_of: '2026-07-01T02:00:00Z',
  source_contract_version: 'pos_margin_interim.v1',
}

const NULL_COGS_ROW: SalesMarginDailyRow = {
  ...POS_ROW,
  margin_date: '2026-06-28',
  cogs_interim_sm: null,
  cogs_budget_bom: null,
  margin_interim: null,
  margin_interim_pct: null,
  bom_coverage_pct: null,
}

describe('listSalesMarginDaily', () => {
  it('queries the reporting schema and sales_margin_daily table, ordered by date', async () => {
    const rec = freshRec()
    schemaMock.mockImplementation((name: string) => {
      rec.schemaNames.push(name)
      return makeSchema(
        { sales_margin_daily: [{ data: [POS_ROW], error: null }] },
        rec,
      ) as never
    })

    const rows = await listSalesMarginDaily()

    expect(schemaMock).toHaveBeenCalledWith('reporting')
    expect(rec.fromTables).toContain('sales_margin_daily')
    expect(rec.orders).toContainEqual(['margin_date', { ascending: true }])
    expect(rows).toHaveLength(1)
  })

  it('never sends org_id as a query filter (RLS scopes it)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_margin_daily: [{ data: [], error: null }] }, rec) as never,
    )

    await listSalesMarginDaily()

    expect(rec.eqs.map(([col]) => col)).not.toContain('org_id')
  })

  it('applies a sinceDays filter as a gte on margin_date when provided', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_margin_daily: [{ data: [], error: null }] }, rec) as never,
    )

    await listSalesMarginDaily({ sinceDays: 60 })

    expect(rec.gtes).toHaveLength(1)
    expect(rec.gtes[0][0]).toBe('margin_date')
  })

  it('passes rows through unchanged, including a NULL-COGS sync-gap day (never a fake margin)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { sales_margin_daily: [{ data: [NULL_COGS_ROW], error: null }] },
        rec,
      ) as never,
    )

    const rows = await listSalesMarginDaily()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(NULL_COGS_ROW)
    expect(rows[0].margin_interim).toBeNull()
    expect(rows[0].margin_interim_pct).toBeNull()
  })

  it('returns an empty array when there are no rows (empty snapshot)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ sales_margin_daily: [{ data: null, error: null }] }, rec) as never,
    )

    const rows = await listSalesMarginDaily()
    expect(rows).toEqual([])
  })

  it('throws a clear, surfaceable error on PostgREST failure', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { sales_margin_daily: [{ data: null, error: { message: 'permission denied' } }] },
        rec,
      ) as never,
    )

    await expect(listSalesMarginDaily()).rejects.toThrow(/listSalesMarginDaily failed/)
  })
})

describe('latestMarginSnapshotAsOf', () => {
  it('returns the max snapshot_as_of across rows', () => {
    const older = { ...POS_ROW, snapshot_as_of: '2026-07-01T01:00:00Z' }
    const newer = { ...POS_ROW, snapshot_as_of: '2026-07-01T03:00:00Z' }
    expect(latestMarginSnapshotAsOf([older, newer])).toBe('2026-07-01T03:00:00Z')
  })

  it('returns null for an empty array', () => {
    expect(latestMarginSnapshotAsOf([])).toBeNull()
  })
})
