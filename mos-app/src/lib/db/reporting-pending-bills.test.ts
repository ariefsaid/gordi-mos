// reporting-pending-bills data module (#1464): reads the copy and its latest run, never sends org_id.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { latestPendingBillSnapshot, listPendingBills } from './reporting-pending-bills'

const schemaMock = vi.mocked(supabase.schema)

interface Call { method: string; args: unknown[] }

function stubSchema(result: (table: string, calls: Call[]) => { data: unknown; error: unknown }) {
  const log: Record<string, Call[][]> = {}
  schemaMock.mockImplementation((name: string) => {
    expect(name).toBe('reporting')
    return {
      from: (table: string) => {
        const calls: Call[] = []
        ;(log[table] ??= []).push(calls)
        const builder: Record<string, unknown> = {}
        for (const method of ['select', 'eq', 'order', 'range', 'limit']) {
          builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder }
        }
        builder.maybeSingle = () => { calls.push({ method: 'maybeSingle', args: [] }); return builder }
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result(table, calls)).then(resolve)
        return builder
      },
    } as never
  })
  return log
}

beforeEach(() => vi.clearAllMocks())

describe('listPendingBills', () => {
  it('reads pending_bills in a tie-free order, page by page, without an org filter', async () => {
    const log = stubSchema(() => ({ data: [{ bill_no: 'PB-1' }], error: null }))
    const rows = await listPendingBills()
    expect(rows).toEqual([{ bill_no: 'PB-1' }])
    const calls = log.pending_bills[0]
    expect(calls.filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['bill_date', 'esb_code', 'branch_code', 'bill_no'])
    expect(calls.find((c) => c.method === 'range')?.args).toEqual([0, 999])
    expect(JSON.stringify(calls)).not.toContain('org_id')
  })

  it('throws when the read fails', async () => {
    stubSchema(() => ({ data: null, error: { message: 'denied' } }))
    await expect(listPendingBills()).rejects.toThrow(/listPendingBills failed — denied/)
  })
})

describe('latestPendingBillSnapshot', () => {
  it('returns the newest run row, or null before any run', async () => {
    const log = stubSchema(() => ({ data: { snapshot_as_of: '2026-10-05T19:05:00Z', bill_count: 3 }, error: null }))
    expect(await latestPendingBillSnapshot()).toEqual({ snapshot_as_of: '2026-10-05T19:05:00Z', bill_count: 3 })
    const calls = log.pending_bill_snapshots[0]
    expect(calls.find((c) => c.method === 'order')?.args).toEqual(['snapshot_as_of', { ascending: false }])
    expect(calls.find((c) => c.method === 'limit')?.args).toEqual([1])
    expect(JSON.stringify(calls)).not.toContain('org_id')

    stubSchema(() => ({ data: null, error: null }))
    expect(await latestPendingBillSnapshot()).toBeNull()
  })

  it('throws when the read fails', async () => {
    stubSchema(() => ({ data: null, error: { message: 'down' } }))
    await expect(latestPendingBillSnapshot()).rejects.toThrow(/latestPendingBillSnapshot failed — down/)
  })
})
