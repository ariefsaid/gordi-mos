import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  cafePurchaseRequestRequiredByBounds,
  listCafePurchaseRequests,
  parseCafePurchaseRequestRow,
  reviewCafePurchaseRequest,
  submitCafePurchaseRequest,
} from './cafe-purchase-requests'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'cafe-branch', name: 'Branch' },
  activity: 'kitchen',
}

beforeEach(() => vi.clearAllMocks())

describe('Café purchase request adapter', () => {
  it('FR-1051 bounds the needed-by date to today through 90 days ahead', () => {
    expect(cafePurchaseRequestRequiredByBounds('2026-10-06')).toEqual({ min: '2026-10-06', max: '2027-01-04' })
  })

  it('NFR-1001 send carries only the stream, needed-by date, note, key and (product detail, quantity) pairs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { request_id: 'q-1', outcome: 'created', status: 'Submitted', row_version: 1 }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    const line = { item_unit_id: 'kg', quantity: '2.5', org_id: 'other', status: 'Approved', process: 'transfer' }

    await expect(submitCafePurchaseRequest(STREAM, '2026-10-08', '  weekend  ', 'key-1', [line])).resolves
      .toEqual({ request_id: 'q-1', outcome: 'created', row_version: 1 })
    expect(rpc).toHaveBeenCalledWith('submit_cafe_purchase_request', {
      p_branch_id: 'branch-1',
      p_activity: 'kitchen',
      p_required_by: '2026-10-08',
      p_note: 'weekend',
      p_client_key: 'key-1',
      p_lines: [{ item_unit_id: 'kg', quantity: '2.5' }],
    })
  })

  it('sends a blank note as null and surfaces server refusals', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'CAFE_PURCHASE_REQUEST_ITEM_NOT_AVAILABLE' } })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(submitCafePurchaseRequest(STREAM, '2026-10-08', '   ', 'key-1', [{ item_unit_id: 'kg', quantity: '1' }]))
      .rejects.toThrow('CAFE_PURCHASE_REQUEST_ITEM_NOT_AVAILABLE')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_note: null })
  })

  it('refuses a malformed send response', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: { request_id: 'q-1' }, error: null }) } as never)
    await expect(submitCafePurchaseRequest(STREAM, '2026-10-08', '', 'key-1', [{ item_unit_id: 'kg', quantity: '1' }]))
      .rejects.toThrow('invalid response')
  })

  it('lists readable requests newest first, filtered by requester, with quantities as strings', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{
      id: 'q-1', branch_id: 'branch-1', activity: 'bar', required_by: '2026-10-08', note: null, status: 'Approved', posting: { state: 'posted', esb_number: 'PR-SYNTH-014' },
      requested_by: 'p-1', requested_at: '2026-10-06T01:00:00Z', reviewed_by: null, reviewed_at: null, review_note: null,
      row_version: 1, lines: [{ id: 'l-1', item_name: 'Milk', item_category: null, unit_name: 'l', quantity: 12 }],
    }], error: null })
    const order = vi.fn(() => ({ limit }))
    const eq = vi.fn(() => ({ order }))
    const inFn = vi.fn(() => ({ eq, order }))
    const select = vi.fn(() => ({ in: inFn }))
    const from = vi.fn(() => ({ select }))
    schemaMock.mockReturnValue({ from } as never)

    const rows = await listCafePurchaseRequests(['Approved'], { requestedBy: 'p-1', limit: 10 })
    expect(rows[0].lines[0].quantity).toBe('12')
    expect(rows[0].posting).toEqual({ state: 'posted', esb_number: 'PR-SYNTH-014' })
    expect(select).toHaveBeenCalledWith(expect.stringContaining('posting:cafe_purchase_request_posting'))
    expect(from).toHaveBeenCalledWith('cafe_purchase_requests')
    expect(inFn).toHaveBeenCalledWith('status', ['Approved'])
    expect(eq).toHaveBeenCalledWith('requested_by', 'p-1')
    expect(order).toHaveBeenCalledWith('requested_at', { ascending: false })
    expect(limit).toHaveBeenCalledWith(10)
  })

  it('refuses a row with an unknown status', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [{ id: 'q-1', activity: 'bar', status: 'Posted', lines: [] }], error: null })
    const order = vi.fn(() => ({ limit }))
    schemaMock.mockReturnValue({ from: () => ({ select: () => ({ in: () => ({ order }) }) }) } as never)
    await expect(listCafePurchaseRequests(['Submitted'])).rejects.toThrow('invalid request row')
  })

  it('NFR-1002 review sends only the decision, version token and trimmed note', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { request_id: 'q-1', status: 'Rejected', row_version: 2 }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(reviewCafePurchaseRequest('q-1', 'reject', 1, '  twice  ')).resolves.toEqual({ status: 'Rejected', row_version: 2, posting: null })
    expect(rpc).toHaveBeenCalledWith('review_cafe_purchase_request', {
      p_request_id: 'q-1', p_decision: 'reject', p_expected_version: 1, p_note: 'twice',
    })
  })

  it.each([
    { state: 'not_posted' }, { state: 'queued', esb_number: null },
    { state: 'posted', esb_number: 'PR-SYNTH-014' }, { state: 'failed', esb_number: null },
  ])('reads posting after a saved approval: %j', async posting => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { posting }, error: null })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    schemaMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { status: 'Approved', row_version: 2 }, error: null }),
      from: vi.fn(() => ({ select })),
    } as never)
    await expect(reviewCafePurchaseRequest('q-1', 'approve', 1, '')).resolves.toEqual({ status: 'Approved', row_version: 2, posting })
    expect(select).toHaveBeenCalledWith('posting:cafe_purchase_request_posting')
    expect(eq).toHaveBeenCalledWith('id', 'q-1')
  })

  it.each([
    { data: null, error: { message: 'unavailable' } },
    { data: null, error: null },
    { data: { posting: { state: 'unrecognized' } }, error: null },
  ])('keeps a saved approval when posting cannot be read: %j', async response => {
    schemaMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { status: 'Approved', row_version: 2 }, error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue(response) }) }) }),
    } as never)
    await expect(reviewCafePurchaseRequest('q-1', 'approve', 1, '')).resolves.toEqual({ status: 'Approved', row_version: 2, posting: null })
  })

  it.each([{ state: 'unknown' }, { state: 'posted', esb_number: 123 }])('refuses malformed posting data: %j', posting => {
    expect(() => parseCafePurchaseRequestRow({ activity: 'bar', status: 'Approved', lines: [], posting })).toThrow('Invalid purchase request posting state')
  })

  it('surfaces a refused self-approval', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'CAFE_PURCHASE_REQUEST_SELF_APPROVAL' } }) } as never)
    await expect(reviewCafePurchaseRequest('q-1', 'approve', 1, '')).rejects.toThrow('CAFE_PURCHASE_REQUEST_SELF_APPROVAL')
  })
})
