import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { ContractError } from './contract'
import { getStockComparisonItem, listStockComparison } from './cafe-stock-comparison'

const schema = vi.mocked(supabase.schema)
const snapshotId = '00000000-0000-0000-0000-00000000ed01'
const source = {
  connection: 'connected', snapshot_id: snapshotId, mapping_version: null,
  as_of: '2026-10-14T16:59:59.999999Z', synced_at: '2026-10-15T18:00:00Z',
  complete: true, missing_scopes: [], stale_after_hours: 24, count_stale_after_hours: 24,
  last_complete_snapshot_id: snapshotId,
}
const row = {
  key: 'item-1:unit-1', item_id: 'item-1', item_name: 'Beef patty', kind: 'WIP', category: 'Protein', unit_id: 'unit-1', unit_name: 'Porsi',
  expected: { quantity: '120', unit_code: 'PORSI', as_of: source.as_of, business_date: '2026-10-14', basis: 'end_of_day', provenance: 'source_row', snapshot_id: snapshotId, row_complete: true },
  count: { id: 'count-1', quantity: '112', unit_id: 'unit-1', unit_name: 'Porsi', count_date: '2026-10-14', submitted_at: '2026-10-14T14:00:00Z', status: 'Submitted' },
  difference: '-8', difference_pct: '-6.666666667', missing: null, flags: ['shortage', 'pending_confirmation'], indicative: false,
}
const page = {
  rows: [row], next: 'opaque-cursor', generation: snapshotId, source,
  counts: { total: 1, shown_scope: 1, gaps: 1, needs_data: 0, counted: 1, zero: 0 }, counts_complete: true,
}
const recorder = () => {
  const rpc = vi.fn()
  schema.mockReturnValue({ rpc } as never)
  return rpc
}

beforeEach(() => vi.clearAllMocks())

describe('stock comparison RPC client', () => {
  it('sends the complete stream and filter scope to the reporting RPC and parses exact rows', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: page, error: null })
    const result = await listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, q: 'Beef', kind: 'WIP', category: 'Protein',
      only_differences: true, sort: 'gap', dir: 'desc', limit: 50,
    })
    expect(schema).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('list_stock_comparison', {
      p_branch_id: 'branch-1', p_activity: 'kitchen', p_only_differences: true, p_q: 'Beef', p_kind: 'WIP',
      p_category: 'Protein', p_sort: 'gap', p_dir: 'desc', p_cursor: null, p_limit: 50,
    })
    expect(result).toEqual(page)
  })

  it('passes category absence, pinned generation and an existing opaque cursor without rebuilding it', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: page, error: null })
    await listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'bar' }, category: null, sort: 'item', dir: 'asc',
      cursor: 'opaque-cursor', generation: snapshotId,
    })
    expect(rpc).toHaveBeenCalledWith('list_stock_comparison', expect.objectContaining({
      p_category: null, p_cursor: 'opaque-cursor', p_activity: 'bar',
    }))
  })

  it('maps stale generations and reviewer denials to typed recoverable errors', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'generation changed, reload' } })
    await expect(listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, sort: 'gap', dir: 'desc', cursor: 'old-cursor',
    })).rejects.toMatchObject({ code: 'CONFLICT' })
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'reviewer scope required' } })
    await expect(listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, sort: 'gap', dir: 'desc',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('pins a first page to its generation without altering the encoded query scope', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: page, error: null })
    await listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'bar' }, category: 'all', sort: 'item', dir: 'asc', generation: snapshotId,
    })
    const params = rpc.mock.calls[0]?.[1] as { p_cursor: string }
    expect(JSON.parse(atob(params.p_cursor))).toMatchObject({
      generation: snapshotId, branch_id: 'branch-1', activity: 'bar', category: '', sort: 'item', dir: 'asc', after: null,
    })
  })

  it('keeps disconnected rows with null source and Count sides typed', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: { ...page, rows: [{ ...row, expected: null, count: null, difference: null, difference_pct: null, missing: 'not_connected', flags: ['not_connected'] }] }, error: null })
    const result = await listStockComparison({ stream: { branch_id: 'branch-1', activity: 'kitchen' }, sort: 'gap', dir: 'desc' })
    expect(result.rows[0]).toMatchObject({ expected: null, count: null, missing: 'not_connected' })
  })

  it('uses a string generation for a disconnected detail request and preserves source units', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: { row, source, source_unit_quantity: { quantity: '12.5', unit_code: 'BOX' } }, error: null })
    const result = await getStockComparisonItem({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, item_id: 'item-1', unit_id: 'unit-1',
      generation: 'not_connected:branch-1:kitchen',
    })
    expect(rpc).toHaveBeenCalledWith('get_stock_comparison_item', {
      p_branch_id: 'branch-1', p_activity: 'kitchen', p_item_id: 'item-1', p_unit_id: 'unit-1',
      p_generation: 'not_connected:branch-1:kitchen',
    })
    expect(result.source_unit_quantity).toEqual({ quantity: '12.5', unit_code: 'BOX' })
  })

  it('keeps a null detail source unit and rejects malformed source-unit data', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: { row, source, source_unit_quantity: null }, error: null })
    await expect(getStockComparisonItem({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, item_id: 'item-1', unit_id: 'unit-1', generation: snapshotId,
    })).resolves.toMatchObject({ source_unit_quantity: null })
    rpc.mockResolvedValue({ data: { row, source, source_unit_quantity: { quantity: 12.5, unit_code: 'BOX' } }, error: null })
    await expect(getStockComparisonItem({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, item_id: 'item-1', unit_id: 'unit-1', generation: snapshotId,
    })).rejects.toBeInstanceOf(ContractError)
  })

  it('rejects a malformed response rather than returning an untyped page', async () => {
    const rpc = recorder()
    rpc.mockResolvedValue({ data: { ...page, counts: { ...page.counts, gaps: 'one' } }, error: null })
    await expect(listStockComparison({
      stream: { branch_id: 'branch-1', activity: 'kitchen' }, sort: 'gap', dir: 'desc',
    })).rejects.toBeInstanceOf(ContractError)
  })
})
