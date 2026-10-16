import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  keysetBefore, listCafeRecordCounts, listCafeRecordLogs, listCafeRecordPeople, listCafeRecordReceiptLines, listCafeRecordReceipts,
  listCafeRecordRequestLines, listCafeRecordRequests, listCafeRecordUnits,
} from './cafe-records'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const schemaMock = vi.mocked(supabase.schema)

/** A chainable query builder that records every call and resolves with `result` when awaited. */
function builder(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Array<[string, unknown[]]> = []
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
      return (...args: unknown[]) => { calls.push([prop, args]); return proxy }
    },
  })
  const from = vi.fn(() => proxy)
  schemaMock.mockReturnValue({ from } as never)
  return { calls, from, called: (name: string) => calls.filter(([n]) => n === name).map(([, a]) => a) }
}

beforeEach(() => vi.clearAllMocks())

describe('keyset predicate', () => {
  it('selects rows strictly before the tuple when ordered descending', () => {
    expect(keysetBefore(['log_date', 'created_at', 'id'], ['2026-10-14', '2026-10-14T03:00:00+00:00', 'abc']))
      .toBe('log_date.lt.2026-10-14,and(log_date.eq.2026-10-14,created_at.lt.2026-10-14T03:00:00+00:00),and(log_date.eq.2026-10-14,created_at.eq.2026-10-14T03:00:00+00:00,id.lt.abc)')
    expect(keysetBefore(['requested_at', 'id'], ['t', 'x'])).toBe('requested_at.lt.t,and(requested_at.eq.t,id.lt.x)')
  })

  it('refuses a cursor that does not match the key', () => {
    expect(() => keysetBefore(['a', 'b'], ['1'])).toThrow()
  })
})

describe('listCafeRecordLogs', () => {
  const row = {
    id: 'l1', batch_id: null, log_date: '2026-10-14', branch_id: 'b', activity: 'bar', action: 'produce', action_label: 'Production', destination_branch_id: null,
    wip_item_id: 'i', item_unit_id: 'u', qty_porsi: 5, entry_quantity: null, entry_unit_factor: null, entry_unit_name: null, notes: null, status: 'Approved',
    submitted_by: 'p', created_at: '2026-10-14T03:00:00+00:00', updated_at: 'x', reviewed_by: null, reviewed_at: null, review_note: null, posted_to_esb: false,
    posted_at: null, esb_doc_num: null, superseded_by: null, wip_items: { name: 'Milk' },
  }

  it('reads the period, never Draft, never superseded rows, in stable descending order', async () => {
    const q = builder({ data: [row], error: null })
    const page = await listCafeRecordLogs({ from: '2026-10-01', to: '2026-10-14', stream: { branchId: 'b', activity: 'bar' }, action: 'transfer', itemId: 'i', destinationBranchId: 'd' })
    expect(q.from).toHaveBeenCalledWith('kitchen_logs')
    expect(q.called('gte')).toEqual([['log_date', '2026-10-01']])
    expect(q.called('lte')).toEqual([['log_date', '2026-10-14']])
    expect(q.called('in')).toEqual([['status', ['Submitted', 'Approved', 'Rejected']]])
    expect(q.called('is')).toEqual([['superseded_by', null]])
    expect(q.called('eq')).toEqual(expect.arrayContaining([['branch_id', 'b'], ['activity', 'bar'], ['action', 'transfer'], ['wip_item_id', 'i'], ['destination_branch_id', 'd']]))
    expect(q.called('order')).toEqual([['log_date', { ascending: false }], ['created_at', { ascending: false }], ['id', { ascending: false }]])
    expect(q.called('limit')).toEqual([[50]])
    expect(page.rows[0].item_name).toBe('Milk')
    expect(page.next).toEqual(['2026-10-14', '2026-10-14T03:00:00+00:00', 'l1'])
    const select = q.called('select')[0][0] as string
    expect(select).toContain('superseded_by')
    expect(select).not.toMatch(/\bdraft\b/i)
  })

  it('continues after a cursor with the keyset predicate and honours a status subset', async () => {
    const q = builder({ data: [], error: null })
    const page = await listCafeRecordLogs({ from: 'a', to: 'b', statuses: ['Approved'], after: ['2026-10-14', 't', 'id'], limit: 200 })
    expect(q.called('or')[0][0]).toContain('log_date.lt.2026-10-14')
    expect(q.called('in')).toEqual([['status', ['Approved']]])
    expect(q.called('limit')).toEqual([[200]])
    expect(page).toEqual({ rows: [], next: null })
  })

  it('refuses an unknown action or status and surfaces the PostgREST code', async () => {
    builder({ data: [{ ...row, status: 'Draft' }], error: null })
    await expect(listCafeRecordLogs({ from: 'a', to: 'b' })).rejects.toThrow('invalid log row')
    builder({ data: null, error: { message: 'permission denied', code: '42501' } })
    await expect(listCafeRecordLogs({ from: 'a', to: 'b' })).rejects.toMatchObject({ code: '42501' })
  })
})

describe('listCafeRecordCounts', () => {
  it('never selects the expected balance or the variance', async () => {
    const q = builder({ data: [], error: null })
    await listCafeRecordCounts({ from: 'a', to: 'b' })
    const select = q.called('select')[0][0] as string
    expect(select).not.toMatch(/expected|variance/)
    expect(q.called('in')).toEqual([['status', ['Submitted', 'Confirmed', 'Rejected']]])
    expect(q.called('order')[0]).toEqual(['count_date', { ascending: false }])
  })
})

describe('listCafeRecordReceipts / Requests', () => {
  it('reads receipts by arrival date, all four statuses, with the exact existing field list and no photo read', async () => {
    const q = builder({ data: [], error: null })
    await listCafeRecordReceipts({ from: '2026-10-01', to: '2026-10-14', receivedBy: 'p' })
    expect(q.called('in')).toEqual([['status', ['Counted', 'Submitted', 'Approved', 'Rejected']]])
    expect(q.called('eq')).toEqual([['received_by', 'p']])
    expect(q.called('order')[0]).toEqual(['arrival_date', { ascending: false }])
    expect(q.called('select')[0][0]).toContain('cafe_receipt_lines')
  })

  it('reads requests by requested_at as WIB day bounds', async () => {
    const q = builder({ data: [], error: null })
    await listCafeRecordRequests({ from: '2026-10-01', to: '2026-10-31', requestedBy: 'p' })
    expect(q.called('gte')).toEqual([['requested_at', '2026-10-01T00:00:00+07:00']])
    expect(q.called('lt')).toEqual([['requested_at', '2026-11-01T00:00:00+07:00']])
    expect(q.called('order')).toEqual([['requested_at', { ascending: false }], ['id', { ascending: false }]])
  })
})

describe('nested line pagers', () => {
  it('reads receipt lines by receipt id, id ascending, resumed by id > last', async () => {
    const q = builder({ data: [{ id: 'l2' }], error: null })
    await listCafeRecordReceiptLines('r1', 'l1', 50)
    expect(q.from).toHaveBeenCalledWith('cafe_receipt_lines')
    expect(q.called('eq')).toEqual([['receipt_id', 'r1']])
    expect(q.called('gt')).toEqual([['id', 'l1']])
    expect(q.called('order')).toEqual([['id', { ascending: true }]])
  })

  it('reads request lines through the existing embed: referenced-table order, limit and id filter', async () => {
    const q = builder({ data: [{ id: 'r1', lines: [{ id: 'l2' }] }], error: null })
    const lines = await listCafeRecordRequestLines('r1', 'l1', 50)
    expect(lines).toEqual([{ id: 'l2' }])
    expect(q.called('filter')).toEqual([['lines.id', 'gt', 'l1']])
    expect(q.called('order')).toEqual([['id', { referencedTable: 'lines', ascending: true }]])
    expect(q.called('limit')).toEqual([[50, { referencedTable: 'lines' }]])
  })
})

describe('people and units', () => {
  it('reads names by id in batches, ascending, with no archived/active/default/shown filter, until an empty page', async () => {
    let call = 0
    const q = builder({ data: [], error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => new Proxy({}, { get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: call++ === 0 ? [{ id: 'a', full_name: 'A' }] : [], error: null })
      return () => new Proxy({}, this as never)
    } })) } as never)
    expect(await listCafeRecordPeople(['a', 'a', 'b'])).toEqual([{ id: 'a', full_name: 'A' }])
    void q
  })

  it('units are read from item_units by stored id without any filter on active/default/shown', async () => {
    const q = builder({ data: [], error: null })
    await listCafeRecordUnits(['u1'])
    expect(q.from).toHaveBeenCalledWith('item_units')
    expect(q.called('in')).toEqual([['id', ['u1']]])
    expect(q.called('eq')).toEqual([])
    expect(q.called('is')).toEqual([])
  })

  it('reads nothing for an empty id list', async () => {
    const q = builder({ data: [], error: null })
    expect(await listCafeRecordPeople([])).toEqual([])
    expect(q.from).not.toHaveBeenCalled()
  })
})
