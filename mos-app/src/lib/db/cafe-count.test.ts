import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  listCafeCountableItems,
  listCafeCountFloorLines,
  listCafeCountReviewLines,
  newCafeCountClientKey,
  recordCafeCountReason,
  recordCafeCountRecount,
  normalizeCafeCountQuantity,
  submitCafeCounts,
} from './cafe-count'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'cafe-branch', name: 'Branch' },
  activity: 'kitchen',
}

beforeEach(() => vi.clearAllMocks())

describe('Cafe Count domain adapter', () => {
  it('normalizes decimal comma/point, accepts zero and keeps blank distinct', () => {
    expect(normalizeCafeCountQuantity('')).toBeNull()
    expect(normalizeCafeCountQuantity('0')).toBe('0')
    expect(normalizeCafeCountQuantity('0012,5000')).toBe('12.5')
    expect(normalizeCafeCountQuantity('1.23456')).toBeNull()
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

  it('records recount quantity through the floor-owned RPC without sending identity or Expected data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      line_id: 'line-1', row_version: 3, reason_required: true,
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(recordCafeCountRecount('line-1', '4.5')).resolves.toEqual({
      line_id: 'line-1', row_version: 3, reason_required: true,
    })
    expect(rpc).toHaveBeenCalledWith('record_cafe_count_recount', {
      p_line_id: 'line-1', p_recounted_quantity: '4.5',
    })
  })

  it('records a non-blank bounded reason through the separate floor-owned RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      line_id: 'line-1', row_version: 4, reason_recorded: true,
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(recordCafeCountReason('line-1', 'Shelf recounted.')).resolves.toEqual({
      line_id: 'line-1', row_version: 4, reason_recorded: true,
    })
    expect(rpc).toHaveBeenCalledWith('record_cafe_count_reason', {
      p_line_id: 'line-1', p_reason: 'Shelf recounted.',
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

  it('uses a separate floor RPC and drops any reviewer facts from its safe response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'line-1', branch_id: 'branch-1', activity: 'kitchen', count_date: '2026-10-06',
      wip_item_id: 'item-1', item_name: 'Raw flour', item_category: 'Pantry', item_kind: 'RAW',
      item_unit_id: 'unit-1', unit_name: 'kg', counted_quantity: '5.0000', recounted_quantity: null,
      reason: null, expected_ready: true, recount_required: true, reason_required: false,
      status: 'Submitted', posting_status: 'not_posted', submitted_at: '2026-10-06T03:00:00.000Z',
      reviewed_at: null, row_version: 2,
      // Even an unexpected server property must not be spread into the floor model.
      expected_balance: '4.0000', variance: '1.0000',
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    const [floorLine] = await listCafeCountFloorLines('2026-10-06')
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('cafe_count_floor_lines', { p_count_date: '2026-10-06' })
    expect(floorLine).toMatchObject({ id: 'line-1', expected_ready: true, recount_required: true })
    expect(floorLine).not.toHaveProperty('expected_balance')
    expect(floorLine).not.toHaveProperty('variance')
  })

  it('reads Expected and Variance only through the reviewer RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'line-1', branch_id: 'branch-1', activity: 'kitchen', count_date: '2026-10-06',
      wip_item_id: 'item-1', item_name: 'Raw flour', item_category: 'Pantry', item_kind: 'RAW',
      item_unit_id: 'unit-1', unit_name: 'kg', counted_quantity: '5.0000', submitted_by: 'person-1',
      recounted_quantity: null, recounted_by: null, recounted_at: null, reason: null,
      reason_entered_by: null, reason_entered_at: null, variance: '1.0000', expected_balance: '4.0000',
      expected_status: 'ready', expected_recorded_at: '2026-10-06T04:00:00.000Z',
      status: 'Submitted', posting_status: 'not_posted', submitted_at: '2026-10-06T03:00:00.000Z',
      reviewed_at: null, row_version: 2,
    }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    const [reviewLine] = await listCafeCountReviewLines('2026-10-06')
    expect(rpc).toHaveBeenCalledWith('cafe_count_review_lines', { p_count_date: '2026-10-06' })
    expect(reviewLine).toMatchObject({ expected_balance: '4.0000', variance: '1.0000' })
  })
})
