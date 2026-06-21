// kitchen-pushes.ts data module tests — TDD, AC-tagged.
// S5 Pushes view (/mos/kitchen/pushes) — read-only monitoring surface.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S5.
// Proves: listEsbPushes selects the right columns, orders newest-first,
// applies optional status/module filters, and throws a clear error on DB failure.
// AC-007: ops_lead may READ its org's push rows (RLS — DB authority; here we
//         assert the data fn sends no write payload and the right schema accessor).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { listEsbPushes } from './kitchen-pushes'
import type { EsbPushRow } from './kitchen-pushes'

const schemaMock = vi.mocked(supabase.schema)

// ── Schema mock harness (mirrors kitchen-logs.test.ts pattern) ───────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  orders: Array<[string, unknown]>
  limits: number[]
}

function makeSchema(
  responses: { data: unknown; error: unknown }[],
  rec: Recorder,
) {
  let callIdx = 0
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const selectImpl = (cols: string) => {
      rec.selects.push(cols)
      const orderImpl = (_col: string, opts: unknown) => {
        rec.orders.push([_col, opts])
        const limitImpl = (n: number) => {
          rec.limits.push(n)
          const eqImpl = (col: string, val: unknown) => {
            rec.eqs.push([col, val])
            return { eq: eqImpl, then: (resolve: (v: unknown) => void) => resolve(responses[callIdx++]) }
          }
          return { eq: eqImpl, then: (resolve: (v: unknown) => void) => resolve(responses[callIdx++]) }
        }
        return { limit: limitImpl }
      }
      return { order: orderImpl }
    }
    return { select: selectImpl }
  }
  return { from: fromImpl }
}

const PUSH_ROWS: EsbPushRow[] = [
  {
    id: 'push-1',
    source_module: 'kitchen',
    source_ref: 'PR-20260621-001',
    endpoint: 'assembly-actual',
    target_env: 'goo',
    status: 'posted',
    retry_count: 0,
    last_error: null,
    esb_doc_num: 'SMA-2026-0001',
    created_at: '2026-06-21T05:00:00Z',
    posted_at: '2026-06-21T05:00:10Z',
  },
  {
    id: 'push-2',
    source_module: 'kitchen',
    source_ref: 'PR-20260621-002',
    endpoint: 'assembly-actual',
    target_env: 'dry_run',
    status: 'dead_letter',
    retry_count: 5,
    last_error: 'ESB timeout after 30s',
    esb_doc_num: null,
    created_at: '2026-06-21T04:00:00Z',
    posted_at: null,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listEsbPushes', () => {
  it('reads from the integrations schema (not ops)', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes()

    expect(schemaMock).toHaveBeenCalledWith('integrations')
    expect(rec.fromTables).toContain('esb_push')
  })

  it('selects all required display columns', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes()

    const cols = rec.selects[0]
    expect(cols).toContain('source_module')
    expect(cols).toContain('source_ref')
    expect(cols).toContain('endpoint')
    expect(cols).toContain('target_env')
    expect(cols).toContain('status')
    expect(cols).toContain('retry_count')
    expect(cols).toContain('last_error')
    expect(cols).toContain('esb_doc_num')
    expect(cols).toContain('created_at')
    expect(cols).toContain('posted_at')
  })

  it('orders newest first (created_at descending)', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes()

    expect(rec.orders[0]).toEqual(['created_at', { ascending: false }])
  })

  it('returns rows shaped as EsbPushRow[]', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: PUSH_ROWS, error: null }], rec) as never)

    const rows = await listEsbPushes()

    expect(rows).toHaveLength(2)
    expect(rows[0].source_ref).toBe('PR-20260621-001')
    expect(rows[1].status).toBe('dead_letter')
    expect(rows[1].last_error).toBe('ESB timeout after 30s')
    expect(rows[0].esb_doc_num).toBe('SMA-2026-0001')
  })

  it('throws a clear error on DB failure', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(
      makeSchema([{ data: null, error: { message: 'permission denied' } }], rec) as never,
    )

    await expect(listEsbPushes()).rejects.toThrow('listEsbPushes failed')
  })

  it('applies status filter as an eq when provided', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes({ status: 'dead_letter' })

    expect(rec.eqs).toContainEqual(['status', 'dead_letter'])
  })

  it('applies source_module filter as an eq when provided', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes({ source_module: 'kitchen' })

    expect(rec.eqs).toContainEqual(['source_module', 'kitchen'])
  })

  it('returns empty array (not null) when no rows match', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: null, error: null }], rec) as never)

    const rows = await listEsbPushes()
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(0)
  })
})
