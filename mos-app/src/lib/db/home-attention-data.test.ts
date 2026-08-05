// home-attention-data.ts tests — TDD (AC-507, Step 5 Track D).
// v1 "failed checks" = the viewer's RLS-readable rejected ops.kitchen_logs (RATIFY-3).
// Mirrors the kitchen-logs.test.ts makeSchema/Recorder harness.
//
// #191 port note: the source row carries `action_label` (a PostgREST computed column derived from
// `action` + `destination_branch_id`, FR-007/DD-WAY-13), not the retired `action_type`. The
// mapping assertion is otherwise unchanged from the v4 suite.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { loadFailedChecksForViewer } from './home-attention-data'

const schemaMock = vi.mocked(supabase.schema)

interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  orders: Array<[string, unknown]>
  limits: number[]
}

function makeSchema(response: { data: unknown; error: unknown }, rec: Recorder) {
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => {
      if (s) rec.selects.push(s)
      return builder
    })
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.limit = vi.fn((n: number) => {
      rec.limits.push(n)
      return Promise.resolve(response)
    })
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], orders: [], limits: [] }
}

beforeEach(() => vi.clearAllMocks())

describe('AC-507: loadFailedChecksForViewer — rejected kitchen_logs, RLS-readable set', () => {
  it("(a)(b)(c): filters status='Rejected', never sends org_id, maps to AttentionItems routed to /cafe/log", async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          data: [
            { id: 'log-1', log_date: '2026-07-16', action_label: 'Production', review_note: 'wrong qty' },
            { id: 'log-2', log_date: '2026-07-15', action_label: 'Transfer to Bungur', review_note: null },
          ],
          error: null,
        },
        rec,
      ) as never,
    )

    const result = await loadFailedChecksForViewer()

    expect(rec.eqs).toContainEqual(['status', 'Rejected'])
    expect(rec.eqs.some(([col]) => col === 'org_id')).toBe(false)
    // Selects the computed column, never the retired stored one (FR-007/DD-WAY-13).
    expect(rec.selects.some((s) => s.includes('action_label'))).toBe(true)
    expect(rec.selects.some((s) => s.includes('action_type'))).toBe(false)
    expect(result).toEqual([
      { id: 'log-1', title: 'Production · 2026-07-16', meta: 'wrong qty', route: '/cafe/log' },
      { id: 'log-2', title: 'Transfer to Bungur · 2026-07-15', meta: undefined, route: '/cafe/log' },
    ])
  })

  it('(d): returns [] (no throw) when there are no rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ data: null, error: null }, rec) as never)

    const result = await loadFailedChecksForViewer()

    expect(result).toEqual([])
  })

  it('(e): throws on a real error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ data: null, error: { message: 'x' } }, rec) as never)

    await expect(loadFailedChecksForViewer()).rejects.toThrow('loadFailedChecksForViewer failed')
  })
})
