// kitchen-pushes.ts data module tests — TDD, AC-tagged.
// S5 Pushes view (/mos/kitchen/pushes) — read-only monitoring surface.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S5.
// Proves: listEsbPushes selects the right columns, ranks worst-first in SQL,
// applies optional status/module filters, and throws a clear error on DB failure.
// AC-007: ops_lead may READ its org's push rows (RLS — DB authority; here we
//         assert the data fn sends no write payload and the right schema accessor).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { listEsbPushes, sortPushRows, SEVERITY_RANK } from './kitchen-pushes'
import type { EsbPushRow, EsbPushStatus } from './kitchen-pushes'

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
        // .order() is chainable (severity rank, then recency within it — #416)
        return { order: orderImpl, limit: limitImpl }
      }
      return { order: orderImpl }
    }
    return { select: selectImpl }
  }
  return { from: fromImpl }
}

/**
 * A schema fake that ORDERS AND TRUNCATES the way Postgres does, instead of replaying a
 * canned response: it applies whatever `.eq()/.order()/.limit()` the module actually asked
 * for to a fixture table. That is what lets the ">limit" test below fail honestly — a read
 * ranked only by created_at drops an old dead-letter before the client ever sees it, and a
 * canned-response mock could never show that.
 */
function makeDbSchema(table: EsbPushRow[]) {
  const orders: Array<[keyof EsbPushRow, boolean]> = []
  const eqs: Array<[keyof EsbPushRow, unknown]> = []
  let max = Number.POSITIVE_INFINITY

  const run = () => {
    const filtered = table.filter(row => eqs.every(([col, val]) => row[col] === val))
    const sorted = [...filtered].sort((a, b) => {
      for (const [col, ascending] of orders) {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        if (av !== bv) return (av < bv ? -1 : 1) * (ascending ? 1 : -1)
      }
      return 0
    })
    return { data: sorted.slice(0, max), error: null }
  }

  const terminal = () => {
    const eqImpl = (col: string, val: unknown) => {
      eqs.push([col as keyof EsbPushRow, val])
      return terminal()
    }
    return {
      eq: eqImpl,
      then: (resolve: (v: unknown) => void) => resolve(run()),
    }
  }

  const limitImpl = (n: number) => {
    max = n
    return terminal()
  }
  const orderImpl = (col: string, opts?: { ascending?: boolean }) => {
    orders.push([col as keyof EsbPushRow, opts?.ascending !== false])
    return { order: orderImpl, limit: limitImpl, ...terminal() }
  }

  return {
    from: () => ({ select: () => ({ order: orderImpl }) }),
  }
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

  it('ranks by severity in SQL, newest-first within a tier (#416)', async () => {
    const rec: Recorder = { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
    schemaMock.mockReturnValue(makeSchema([{ data: [], error: null }], rec) as never)

    await listEsbPushes()

    // status FIRST: the rank has to happen before the DB truncates at `limit`,
    // or an old dead-letter never reaches the client at all.
    expect(rec.orders[0]).toEqual(['status', { ascending: true }])
    expect(rec.orders[1]).toEqual(['created_at', { ascending: false }])
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

// ── sortPushRows (#402 AC-3): severity outranks recency ──────────────────────
describe('sortPushRows (#402 AC-3 — rows needing attention sort above healthy ones)', () => {
  const base: EsbPushRow = {
    id: 'push-s0',
    source_module: 'kitchen',
    source_ref: 'PR-20260621-000',
    endpoint: 'assembly-actual',
    target_env: 'dry_run',
    status: 'posted',
    retry_count: 0,
    last_error: null,
    esb_doc_num: 'SMA-2026-0001',
    created_at: '2026-06-21T00:00:00Z',
    posted_at: '2026-06-21T00:00:10Z',
  }
  const row = (over: Partial<EsbPushRow>): EsbPushRow => ({ ...base, ...over })

  it('a dead_letter row sorts above every newer healthy row', () => {
    const sorted = sortPushRows([
      row({ id: 'a', status: 'posted',      created_at: '2026-06-21T05:00:00Z' }),
      row({ id: 'b', status: 'pending',     created_at: '2026-06-21T04:00:00Z' }),
      row({ id: 'c', status: 'dead_letter', created_at: '2026-06-21T01:00:00Z' }),
    ])
    expect(sorted.map(r => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('failed sits between dead_letter and the healthy tier', () => {
    const sorted = sortPushRows([
      row({ id: 'a', status: 'posted',      created_at: '2026-06-21T05:00:00Z' }),
      row({ id: 'b', status: 'failed',      created_at: '2026-06-21T03:00:00Z' }),
      row({ id: 'c', status: 'dead_letter', created_at: '2026-06-21T02:00:00Z' }),
    ])
    expect(sorted.map(r => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('within one tier, newest first', () => {
    const sorted = sortPushRows([
      row({ id: 'old', status: 'posted', created_at: '2026-06-21T01:00:00Z' }),
      row({ id: 'new', status: 'posted', created_at: '2026-06-21T05:00:00Z' }),
    ])
    expect(sorted.map(r => r.id)).toEqual(['new', 'old'])
  })

  it('does not mutate the input array', () => {
    const input = [
      row({ id: 'a', status: 'posted',      created_at: '2026-06-21T05:00:00Z' }),
      row({ id: 'b', status: 'dead_letter', created_at: '2026-06-21T01:00:00Z' }),
    ]
    const snapshot = input.map(r => r.id)
    sortPushRows(input)
    expect(input.map(r => r.id)).toEqual(snapshot)
  })
})

// ── #416: the attention tier must be FETCHED, not merely sorted ───────────────
// The ticket's own complaint is "a stuck batch hides below healthy ones", and a stuck
// batch is the row most likely to be OLD — it has been stuck. Sorting client-side inside
// a recency window fixes that only for recent failures; the batch that jammed last week
// is still off-window. These tests read against a fake that orders and truncates like the
// database, so they fail if the ranking ever moves back to the client.
describe('listEsbPushes — an old dead-letter survives the window (#416)', () => {
  const base: EsbPushRow = {
    id: 'seed',
    source_module: 'kitchen',
    source_ref: 'PR-SEED',
    endpoint: 'assembly-actual',
    target_env: 'goo',
    status: 'posted',
    retry_count: 0,
    last_error: null,
    esb_doc_num: 'SMA-2026-0000',
    created_at: '2026-06-21T00:00:00Z',
    posted_at: '2026-06-21T00:00:10Z',
  }

  /** 120 healthy pushes from the last few days + ONE dead-letter older than all of them. */
  function outboxWithOldDeadLetter(): EsbPushRow[] {
    const healthy = Array.from({ length: 120 }, (_, i) => ({
      ...base,
      id: `posted-${String(i).padStart(3, '0')}`,
      source_ref: `PR-2026062-${String(i).padStart(3, '0')}`,
      status: 'posted' as const,
      // newest first-ish: i=0 is the newest, all of them AFTER the dead-letter
      created_at: new Date(Date.parse('2026-06-21T12:00:00Z') - i * 60_000).toISOString(),
    }))
    const oldDeadLetter: EsbPushRow = {
      ...base,
      id: 'stuck-last-week',
      source_ref: 'PR-20260614-007',
      status: 'dead_letter',
      retry_count: 5,
      last_error: 'ESB timeout after 30s',
      esb_doc_num: null,
      created_at: '2026-06-14T03:00:00Z', // a week older than every healthy row
      posted_at: null,
    }
    return [...healthy, oldDeadLetter]
  }

  it('returns the week-old dead_letter even though 120 newer pushes exist (limit 100)', async () => {
    schemaMock.mockReturnValue(makeDbSchema(outboxWithOldDeadLetter()) as never)

    const rows = await listEsbPushes()

    expect(rows).toHaveLength(100) // the window still truncates — it just truncates the healthy tail
    expect(rows.map(r => r.id)).toContain('stuck-last-week')
  })

  it('and it lands at the top of the rendered order', async () => {
    schemaMock.mockReturnValue(makeDbSchema(outboxWithOldDeadLetter()) as never)

    const rows = sortPushRows(await listEsbPushes())

    expect(rows[0].id).toBe('stuck-last-week')
  })
})

// ── The coincidence the SQL rank rides on, pinned ─────────────────────────────
describe('SEVERITY_RANK', () => {
  it('agrees with the alphabetical order of the status words (what `.order(status)` gives us)', () => {
    const alphabetical = (Object.keys(SEVERITY_RANK) as EsbPushStatus[]).sort()
    const ranks = alphabetical.map(s => SEVERITY_RANK[s])
    // non-decreasing: alphabetical ASC === severity-first, so the DB's cheap text sort
    // IS the severity sort. A new status word that breaks this fails here, loudly.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(alphabetical).toEqual(['dead_letter', 'failed', 'in_flight', 'pending', 'posted'])
  })
})
