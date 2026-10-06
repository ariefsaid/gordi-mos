import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  listCafeCountableItems,
  listCafeCountLines,
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
    expect(normalizeCafeCountQuantity('0012,5000')).toBe('12.5')
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

  it('reads all Submitted dates oldest first without sending an org or a submitter', async () => {
    const query = makeQuery({ data: [], error: null })
    const from = vi.fn(() => query)
    schemaMock.mockReturnValue({ from } as never)

    await expect(listCafeCountLines()).resolves.toEqual([])
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(from).toHaveBeenCalledWith('cafe_count_lines')
    expect(query.eq).toHaveBeenCalledWith('status', 'Submitted')
    expect(query.eq).not.toHaveBeenCalledWith('count_date', expect.anything())
    expect(query.order).toHaveBeenNthCalledWith(1, 'count_date', { ascending: true })
    expect(query.order).toHaveBeenNthCalledWith(2, 'submitted_at', { ascending: true })
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('org_id'))
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('submitted_by'))
  })
})
