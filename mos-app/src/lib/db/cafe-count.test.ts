import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  confirmCafeCountLine,
  listCafeCountExcludedItems,
  listCafeCountFloorLines,
  listCafeCountableItems,
  listCafeCountLines,
  recordCafeCountReason,
  recordCafeCountRecount,
  newCafeCountClientKey,
  normalizeCafeCountQuantity,
  parseCafeCountQuantity,
  submitCafeCounts,
} from './cafe-count'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'cafe-branch', name: 'Branch' },
  activity: 'kitchen',
}

function makeQuery(response: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.in = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return query
}

beforeEach(() => vi.clearAllMocks())

describe('Cafe Count domain adapter', () => {
  it('normalizes decimal comma/point, accepts zero and keeps blank distinct', () => {
    expect(normalizeCafeCountQuantity('')).toBeNull()
    expect(normalizeCafeCountQuantity('0')).toBe('0')
    expect(normalizeCafeCountQuantity('0012,50')).toBe('12.5')
    expect(normalizeCafeCountQuantity('0012,5000')).toBeNull()
    expect(normalizeCafeCountQuantity('0,12')).toBe('0.12')
    expect(normalizeCafeCountQuantity('0,125')).toBeNull()
    expect(normalizeCafeCountQuantity('1.250')).toBeNull()
    expect(parseCafeCountQuantity('1.250')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(parseCafeCountQuantity('0,125')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(normalizeCafeCountQuantity('1.23456')).toBeNull()
    expect(normalizeCafeCountQuantity('1.500')).toBeNull()
    expect(normalizeCafeCountQuantity('-1')).toBeNull()
  })

  it('creates a browser-generated UUID idempotency key', () => {
    expect(newCafeCountClientKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('gets the blind, server-filtered Countable items for the selected stream', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      item_id: 'item-1', item_name: 'Raw flour', item_category: 'Pantry', item_kind: 'RAW',
      item_unit_id: 'unit-1', unit_name: 'kg',
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeCountableItems(STREAM)).resolves.toEqual([{
      id: 'item-1', name: 'Raw flour', category: 'Pantry', kind: 'RAW', unitId: 'unit-1', unitName: 'kg',
    }])
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('cafe_countable_items', {
      p_branch_id: 'branch-1', p_activity: 'kitchen',
    })
  })

  it('sends the optional storage location with each count line', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      client_key: 'key-1', outcome: 'submitted', line_id: 'line-1',
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await submitCafeCounts(STREAM, [{
      client_key: 'key-1', item_id: 'item-1', quantity: '2.5', storage_location_id: 'location-1',
    }])
    expect(rpc).toHaveBeenCalledWith('submit_cafe_counts', {
      p_branch_id: 'branch-1', p_activity: 'kitchen',
      p_lines: [{ client_key: 'key-1', item_id: 'item-1', quantity: '2.5', storage_location_id: 'location-1' }],
    })
  })

  it('sends only the client key, item and typed quantity and returns line outcomes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      client_key: 'key-1', outcome: 'submitted', line_id: 'line-1',
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(submitCafeCounts(STREAM, [{
      client_key: 'key-1', item_id: 'item-1', quantity: '0',
    }])).resolves.toEqual([{ client_key: 'key-1', outcome: 'submitted', line_id: 'line-1' }])
    expect(rpc).toHaveBeenCalledWith('submit_cafe_counts', {
      p_branch_id: 'branch-1',
      p_activity: 'kitchen',
      p_lines: [{ client_key: 'key-1', item_id: 'item-1', quantity: '0' }],
    })
  })

  it('maps the existing-line response returned by an idempotent retry', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      client_key: 'key-1', outcome: 'existing', line_id: 'original-line',
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(submitCafeCounts(STREAM, [{
      client_key: 'key-1', item_id: 'item-1', quantity: '0',
    }])).resolves.toEqual([{ client_key: 'key-1', outcome: 'existing', line_id: 'original-line' }])
  })

  it('reads all Submitted dates oldest first without sending an org', async () => {
    const query = makeQuery({ data: [], error: null })
    const from = vi.fn(() => query)
    schemaMock.mockReturnValue({ from, rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } as never)

    await expect(listCafeCountLines()).resolves.toEqual([])
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(from).toHaveBeenCalledWith('cafe_count_lines')
    expect(query.eq).toHaveBeenCalledWith('status', 'Submitted')
    expect(query.eq).not.toHaveBeenCalledWith('count_date', expect.anything())
    expect(query.order).toHaveBeenNthCalledWith(1, 'count_date', { ascending: true })
    expect(query.order).toHaveBeenNthCalledWith(2, 'submitted_at', { ascending: true })
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('org_id'))
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('submitted_by'))
  })

  it('AC-017 the floor reads only state words from the server, so no Expected figure or Variance reaches the Count page', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [
      { id: 'l1', wip_item_id: 'i1', state: 'needs_recount', row_version: 2 },
      { id: 'l5', wip_item_id: 'i5', state: 'held', row_version: 6 },
    ], error: null })
    const from = vi.fn()
    schemaMock.mockReturnValue({ rpc, from } as never)

    const lines = await listCafeCountFloorLines(STREAM, '2026-10-06')
    expect(lines).toEqual([
      { id: 'l1', itemId: 'i1', state: 'needs_recount', rowVersion: 2 },
      { id: 'l5', itemId: 'i5', state: 'held', rowVersion: 6 },
    ])
    expect(rpc).toHaveBeenCalledWith('cafe_count_floor_lines', { p_branch_id: 'branch-1', p_activity: 'kitchen', p_count_date: '2026-10-06' })
    expect(from).not.toHaveBeenCalled()
  })

  it('the review list never selects the figures from the table; it reads them through the reviewer-only function', async () => {
    const query = makeQuery({ data: [{ id: 'l1', activity: 'kitchen', expected_status: 'ready', status: 'Submitted', counted_quantity: 5 }], error: null })
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'l1', expected_balance: 4, variance: 1 }], error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => query), rpc } as never)
    const [line] = await listCafeCountLines()
    expect(query.select).toHaveBeenCalledWith(expect.not.stringMatching(/variance|expected_balance/))
    expect(rpc).toHaveBeenCalledWith('cafe_count_review_figures', { p_line_ids: ['l1'] })
    expect(line).toMatchObject({ expected_balance: '4', variance: '1' })
  })

  it('records a recount and a trimmed reason through the floor functions', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { line_id: 'l1', row_version: 3, reason_required: true }, error: null })
      .mockResolvedValueOnce({ data: { line_id: 'l1', row_version: 4, reason_recorded: true }, error: null })
      .mockResolvedValueOnce({ data: { line_id: 'l1', status: 'Confirmed', posting_status: 'held', row_version: 5, variance: '1' }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(recordCafeCountRecount('l1', '3')).resolves.toEqual({ reasonRequired: true, rowVersion: 3 })
    await expect(recordCafeCountReason('l1', '  spilled ')).resolves.toEqual({ rowVersion: 4 })
    await expect(confirmCafeCountLine('l1', 4)).resolves.toMatchObject({ posting_status: 'held' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_cafe_count_recount', { p_line_id: 'l1', p_recounted_quantity: '3' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_cafe_count_reason', { p_line_id: 'l1', p_reason: 'spilled' })
  })

  it('sends the count date, the typed multiple and reads the reviewer-only excluded list', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ client_key: 'k1', outcome: 'submitted', line_id: 'l1' }], error: null })
      .mockResolvedValueOnce({ data: [{ item_id: 'x', item_name: 'Boxed tea' }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await submitCafeCounts(STREAM, [{ client_key: 'k1', item_id: 'i1', quantity: '3', unit_factor: 0.5 }], '2026-10-05')
    expect(rpc).toHaveBeenNthCalledWith(1, 'submit_cafe_counts', {
      p_branch_id: 'branch-1', p_activity: 'kitchen', p_count_date: '2026-10-05',
      p_lines: [{ client_key: 'k1', item_id: 'i1', quantity: '3', unit_factor: '0.5' }],
    })
    await expect(listCafeCountExcludedItems(STREAM)).resolves.toEqual(['Boxed tea'])
  })
})

