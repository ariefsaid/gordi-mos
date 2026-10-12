import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listCafeReceipts, type CafeReceipt } from './cafe-receipts'
import {
  closeCafeReceiptIssue,
  countCafeReceiptIssuesNeedingPo,
  getCafeReceiptIssueAccess,
  linkCafeReceiptIssue,
  listCafeReceiptIssueOpenPos,
  listCafeReceiptIssues,
  resolveCafeReceiptHaltedGroup,
  setCafeReceiptIssueAccess,
} from './cafe-receipt-issues'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./cafe-receipts', () => ({ listCafeReceipts: vi.fn() }))

const schemaMock = vi.mocked(supabase.schema)
const receiptsMock = vi.mocked(listCafeReceipts)

function line(id: string) {
  return {
    id, item_unit_id: 'unit-1', item_name: 'Long-life milk', item_category: 'Dairy', unit_name: 'carton',
    received_quantity: '6', conditions: [], condition_reason: null, condition_updated_at: null, po_created_after_delivery: false,
    photos: [],
  }
}
function receipt(id: string, lineIds: string[]): CafeReceipt {
  return {
    id, branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-06', delivery_note_number: null,
    status: 'Approved', posting_status: 'not_posted', posting_hold_reason: null, received_by: 'person-1',
    received_at: '2026-10-06T02:00:00Z', submitted_at: null, reviewed_by: 'person-2', reviewed_at: null, review_note: null,
    row_version: 3, lines: lineIds.map(line), posting: null,
  } as unknown as CafeReceipt
}
function issueRow(n: number, status = 'open') {
  return {
    id: `issue-${n}`, receipt_id: `receipt-${n}`, line_id: `line-${n}`, kind: 'over', quantity: '2.0000', status,
    created_at: '2026-10-06T03:00:00Z', linked_po_number: null, reopened_po_number: null, closed_note: null, resolved_by: null, resolved_at: null,
  }
}

/** A query per table read; records each call so the tests can assert the read shape. */
type Call = { table: string; select: unknown[]; filters: unknown[][]; range?: [number, number]; limit?: number }
function backend(
  responses: Record<string, (call: Call) => { data?: unknown[]; count?: number }>,
  rpc = vi.fn().mockResolvedValue({ data: null, error: null }),
) {
  const calls: Call[] = []
  const from = vi.fn((table: string) => {
    const call: Call = { table, select: [], filters: [] }
    calls.push(call)
    const query: Record<string, unknown> = {}
    query.select = vi.fn((...args: unknown[]) => { call.select = args; return query })
    for (const method of ['eq', 'neq', 'in', 'order', 'is', 'not']) query[method] = vi.fn((...args: unknown[]) => { call.filters.push([method, ...args]); return query })
    query.range = vi.fn((a: number, b: number) => { call.range = [a, b]; return query })
    query.limit = vi.fn((n: number) => { call.limit = n; return query })
    query.then = (resolve: (value: unknown) => unknown) => {
      const result = responses[table]?.(call) ?? {}
      return Promise.resolve({ data: result.data ?? null, count: result.count ?? null, error: null }).then(resolve)
    }
    return query
  })
  schemaMock.mockReturnValue({ from, rpc } as never)
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
  receiptsMock.mockImplementation(async (_statuses, options) =>
    (options?.ids ?? []).map(id => receipt(id, [id.replace('receipt', 'line')])))
})

describe('Café receipt issues adapter', () => {
  it('C2 open issues are read in full, past any window, and resolved ones newest first with their total', async () => {
    const open = Array.from({ length: 1200 }, (_, n) => issueRow(n))
    const calls = backend({
      cafe_receipt_issues: call => {
        if (call.select[1]) return { count: 340 }
        if (call.filters.some(f => f[0] === 'eq' && f[1] === 'status')) return { data: open.slice(call.range![0], call.range![1] + 1) }
        return { data: [issueRow(5000, 'closed')] }
      },
      cafe_receipt_portions: () => ({ data: [] }),
    })

    const list = await listCafeReceiptIssues()

    expect(list.issues.filter(issue => issue.status === 'open')).toHaveLength(1200)
    expect(list.issues.filter(issue => issue.status === 'closed')).toHaveLength(1)
    expect(list.resolvedTotal).toBe(340)
    const resolved = calls.find(call => call.table === 'cafe_receipt_issues' && call.filters.some(f => f[0] === 'neq') && !call.select[1])!
    expect(resolved.limit).toBe(100)
    // 1201 receipts: read 50 at a time, as the receipt photo read does.
    expect(receiptsMock).toHaveBeenCalledTimes(25)
    expect(Math.max(...receiptsMock.mock.calls.map(([, options]) => options?.ids?.length ?? 0))).toBe(50)
  })

  it('AC-1533 a halted group is joined to its receipt for the existing issues surface', async () => {
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === 'list_cafe_receipt_halted_groups' ? [
        { group_id: 'group-1', receipt_id: 'receipt-7', po_number: 'PO-7', mos_key: 'MOS-RECEIPT-7' },
      ] : null,
      error: null,
    }))
    backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 0 } : { data: [] }),
      cafe_receipt_portions: () => ({ data: [] }),
    }, rpc)

    const list = await listCafeReceiptIssues()

    expect(list.haltedGroups).toEqual([expect.objectContaining({
      group_id: 'group-1', po_number: 'PO-7', mos_key: 'MOS-RECEIPT-7',
      receipt: expect.objectContaining({ id: 'receipt-7' }),
    })])
    expect(receiptsMock).toHaveBeenCalledWith(['Approved'], expect.objectContaining({ ids: ['receipt-7'], limit: 1 }))
    expect(rpc).toHaveBeenCalledWith('list_cafe_receipt_halted_groups')
  })

  it('FR-1534 ESB-refused portions return with their receipt, line, message and MOS key', async () => {
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === 'cafe_receipt_esb_refused_portions' ? [{
        portion_id: 'portion-refused', receipt_id: 'receipt-8', line_id: 'line-8', quantity: '3.0000',
        created_at: '2026-10-06T05:00:00Z', po_number: 'PO-SYNTH-8', mos_key: 'MOS-RECEIPT-GROUP',
        esb_message: 'ESB refused this receipt: period is closed',
      }] : null,
      error: null,
    }))
    const calls = backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 0 } : { data: [] }),
      cafe_receipt_portions: () => ({ data: [] }),
    }, rpc)

    const list = await listCafeReceiptIssues()
    const refused = (list as unknown as { refused: Array<Record<string, unknown>> }).refused

    expect(refused).toEqual([expect.objectContaining({
      id: 'portion-refused', quantity: '3.0000', po_number: 'PO-SYNTH-8', mos_key: 'MOS-RECEIPT-GROUP',
      esb_message: 'ESB refused this receipt: period is closed',
    })])
    expect(refused[0].line).toEqual(expect.objectContaining({ id: 'line-8' }))
    expect(refused[0].receipt).toEqual(expect.objectContaining({ id: 'receipt-8' }))
    expect(rpc).toHaveBeenCalledWith('cafe_receipt_esb_refused_portions', { p_offset: 0, p_limit: 1000 })
    expect(calls.some(call => call.table === 'cafe_receipt_portions' && call.filters.some(filter => filter[1] === 'esb_refused'))).toBe(false)
  })

  it('DD-2026-10-06-1429 held portions that no longer fit a PO come back with their receipt and line', async () => {
    backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 0 } : { data: [] }),
      cafe_receipt_portions: call => (call.filters.some(f => f[0] === 'eq' && f[1] === 'hold_reason' && f[2] === 'no_longer_fits')
        && call.filters.some(f => f[0] === 'eq' && f[1] === 'state' && f[2] === 'held')
        ? { data: [{ id: 'portion-1', receipt_id: 'receipt-7', line_id: 'line-7', quantity: '4.0000', created_at: '2026-10-06T05:00:00Z' }] }
        : { data: [] }),
    })

    const list = await listCafeReceiptIssues()

    expect(list.held).toEqual([expect.objectContaining({ id: 'portion-1', quantity: '4.0000', created_at: '2026-10-06T05:00:00Z' })])
    expect(list.held[0].line.id).toBe('line-7')
    expect(list.held[0].receipt.id).toBe('receipt-7')
  })

  it('S9 C10 each issue carries its linked parts with their PO, posting state and late flag, read by receipt; S8 the PO that had no room', async () => {
    const calls = backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 1 }
        : call.filters.some(f => f[0] === 'eq' && f[1] === 'status') ? { data: [{ ...issueRow(1), reopened_po_number: 'PO-0' }] }
        : { data: [{ ...issueRow(2, 'linked'), linked_po_number: 'PO-2' }] }),
      cafe_receipt_portions: call => (call.filters.some(f => f[0] === 'in' && f[1] === 'receipt_id') ? { data: [
        { issue_id: 'issue-2', po_number: 'PO-1', quantity: '1.0000', state: 'queued', po_created_after_delivery: true, created_at: '2026-10-06T04:00:00Z' },
        { issue_id: 'issue-2', po_number: 'PO-2', quantity: '1.0000', state: 'held', po_created_after_delivery: false, created_at: '2026-10-06T05:00:00Z' },
      ] } : { data: [] }),
    })

    const list = await listCafeReceiptIssues()

    expect(list.issues.find(issue => issue.id === 'issue-1')).toEqual(expect.objectContaining({ parts: [], reopened_po_number: 'PO-0' }))
    expect(list.issues.find(issue => issue.id === 'issue-2')?.parts).toEqual([
      { po_number: 'PO-1', quantity: '1.0000', state: 'queued', po_created_after_delivery: true },
      { po_number: 'PO-2', quantity: '1.0000', state: 'held', po_created_after_delivery: false },
    ])
    const parts = calls.find(call => call.table === 'cafe_receipt_portions' && call.filters.some(f => f[0] === 'in' && f[1] === 'receipt_id'))!
    expect(parts.filters).toEqual(expect.arrayContaining([['in', 'receipt_id', ['receipt-1', 'receipt-2']], ['not', 'issue_id', 'is', null], ['in', 'state', ['queued', 'held']]]))
  })

  it('S5 the badge counts open blocking issues and held portions that need a PO, without reading rows', async () => {
    const calls = backend({
      cafe_receipt_issues: () => ({ count: 3 }),
      cafe_receipt_portions: () => ({ count: 2 }),
    })
    await expect(countCafeReceiptIssuesNeedingPo()).resolves.toBe(5)
    expect(calls.every(call => (call.select[1] as { head?: boolean } | undefined)?.head === true)).toBe(true)
    expect(calls[0].filters).toEqual(expect.arrayContaining([['eq', 'status', 'open'], ['in', 'kind', ['no_po', 'over', 'wrong_unit']]]))
  })

  it('C9 a receiver counts only the open blocking issues of their own receipts, and no portions', async () => {
    const calls = backend({ cafe_receipt_issues: () => ({ count: 2 }), cafe_receipt_portions: () => ({ count: 9 }) })
    await expect(countCafeReceiptIssuesNeedingPo({ receivedBy: 'person-1' })).resolves.toBe(2)
    expect(calls.map(call => call.table)).toEqual(['cafe_receipt_issues'])
    expect(calls[0].select[0]).toBe('id,cafe_receipts!inner(received_by)')
    expect(calls[0].filters).toEqual(expect.arrayContaining([['eq', 'cafe_receipts.received_by', 'person-1'], ['eq', 'status', 'open']]))
  })

  it('FR-1034 a row without its readable receipt is refused', async () => {
    receiptsMock.mockResolvedValue([])
    backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 0 } : call.filters.some(f => f[0] === 'eq') ? { data: [issueRow(1)] } : { data: [] }),
      cafe_receipt_portions: () => ({ data: [] }),
    })
    await expect(listCafeReceiptIssues()).rejects.toThrow('invalid issue row')
  })

  it('NFR-1001 link and close send only the issue, the chosen PO number or the trimmed note', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'open', linked_po_number: 'PO-1', matched_quantity: '1', remaining_quantity: '1', posting: 'held', po_created_after_delivery: true }, error: null })
      .mockResolvedValueOnce({ data: { status: 'closed' }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(linkCafeReceiptIssue('issue-1', 'PO-1')).resolves.toEqual({
      status: 'open', matched_quantity: '1', remaining_quantity: '1', posting: 'held', po_created_after_delivery: true,
    })
    await closeCafeReceiptIssue('issue-1', '  Supplier credit  ')
    expect(rpc).toHaveBeenNthCalledWith(1, 'link_cafe_receipt_issue', { p_issue_id: 'issue-1', p_po_number: 'PO-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'close_cafe_receipt_issue', { p_issue_id: 'issue-1', p_note: 'Supplier credit' })
  })

  it('S1508 a re-opened issue retains the note that closed the remaining quantity', async () => {
    const calls = backend({
      cafe_receipt_issues: call => (call.select[1] ? { count: 0 }
        : call.filters.some(f => f[0] === 'eq' && f[1] === 'status') ? { data: [{
          ...issueRow(1), reopened_po_number: 'PO-REOPENED',
        }] } : { data: [] }),
      cafe_receipt_portions: () => ({ data: [] }),
      record_history: () => ({ data: [{
        record_key: 'issue-1', field_name: 'closed_note', old_value: 'The remainder was returned to supplier', new_value: null,
      }] }),
    })

    const list = await listCafeReceiptIssues()

    expect(list.issues[0]).toEqual(expect.objectContaining({
      id: 'issue-1', previous_closed_note: 'The remainder was returned to supplier',
    }))
    expect(calls.find(call => call.table === 'record_history')?.filters).toEqual(expect.arrayContaining([
      ['eq', 'schema_name', 'ops'], ['eq', 'table_name', 'cafe_receipt_issues'],
      ['in', 'record_key', ['issue-1']], ['eq', 'field_name', 'closed_note'],
      ['is', 'new_value', null], ['not', 'old_value', 'is', null],
    ]))
  })

  it('AC-1533 a resolution sends only its group, choice and optional number', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { group_id: 'group-1', resolution: 'record_number' }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await resolveCafeReceiptHaltedGroup('group-1', 'record_number', '  GR-7  ')

    expect(rpc).toHaveBeenCalledWith('resolve_cafe_receipt_halted_group', {
      p_group_id: 'group-1', p_resolution: 'record_number', p_esb_doc_num: 'GR-7',
    })
  })

  it('FR-1036 a refused link surfaces the database token for a plain explanation', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL: the PO must be dated on or before the arrival date' } }) } as never)
    await expect(linkCafeReceiptIssue('issue-1', 'PO-2')).rejects.toThrow('CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL')
  })

  it('FR-1035 reads the PO picker with each PO date eligibility and the cache as-of time', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      options: [{ po_number: 'PO-1', supplier_name: null, po_date: '2026-10-06', available: '4', date_eligible: false, created_after_delivery: true }],
      cache_as_of: '2026-10-07T01:00:00Z', is_current: true, refresh_requested_at: null,
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeReceiptIssueOpenPos('issue-1')).resolves.toEqual({
      options: [{ po_number: 'PO-1', supplier_name: null, po_date: '2026-10-06', available: '4', date_eligible: false, created_after_delivery: true }],
      cache_as_of: '2026-10-07T01:00:00Z', is_current: true, refresh_requested_at: null,
    })
    expect(rpc).toHaveBeenCalledWith('cafe_receipt_issue_open_pos', { p_issue_id: 'issue-1' })
  })

  it('FR-1040 the capability is read and written only through the admin RPCs, and a write is confirmed', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { enabled: false }, error: null })
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
      .mockResolvedValueOnce({ data: { enabled: false }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(getCafeReceiptIssueAccess('person-1')).resolves.toBe(false)
    await setCafeReceiptIssueAccess('person-1', true)
    await expect(setCafeReceiptIssueAccess('person-1', true)).rejects.toThrow('not saved')
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_cafe_receipt_issue_access', { p_person_id: 'person-1', p_enabled: true })
  })
})
