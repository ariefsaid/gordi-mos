import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  listCafeMissingItemReports,
  reportMissingCafeItem,
  resolveCafeMissingItemReport,
} from './cafe-missing-item-reports'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const schema = vi.mocked(supabase.schema)
const STREAM = { branch: { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }, activity: 'kitchen' as const }

function makeQuery(response: { data?: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'insert', 'update']) query[method] = vi.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return query
}

beforeEach(() => vi.clearAllMocks())

describe('Café missing-item report data layer', () => {
  it('reads only attention reports for the selected stream and maps database fields', async () => {
    const query = makeQuery({ data: [{
      id: 'report-1', branch_id: 'branch-1', activity: 'kitchen', item_name: 'Oat milk',
      reported_at: '2026-10-04T10:00:00Z', needs_attention: true, resolved_at: null,
    }], error: null })
    const from = vi.fn(() => query)
    schema.mockReturnValue({ from } as never)

    await expect(listCafeMissingItemReports(STREAM)).resolves.toEqual([{
      id: 'report-1', branchId: 'branch-1', activity: 'kitchen', itemName: 'Oat milk',
      reportedAt: '2026-10-04T10:00:00Z', needsAttention: true, resolvedAt: null,
    }])
    expect(from).toHaveBeenCalledWith('cafe_missing_item_reports')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'branch_id', 'branch-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'activity', 'kitchen')
    expect(query.eq).toHaveBeenNthCalledWith(3, 'needs_attention', true)
  })

  it('inserts only the report name and selected stream, then requests one-way resolution', async () => {
    const query = makeQuery({ error: null })
    const from = vi.fn(() => query)
    schema.mockReturnValue({ from } as never)

    await reportMissingCafeItem(STREAM, ' Oat milk ')
    expect(query.insert).toHaveBeenCalledWith({ branch_id: 'branch-1', activity: 'kitchen', item_name: 'Oat milk' })

    await resolveCafeMissingItemReport('report-1')
    expect(query.update).toHaveBeenCalledWith({ needs_attention: false })
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'report-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'needs_attention', true)
  })

  it('surfaces read, insert and resolution errors', async () => {
    const query = makeQuery({ data: null, error: { message: 'offline' } })
    schema.mockReturnValue({ from: vi.fn(() => query) } as never)
    await expect(listCafeMissingItemReports(STREAM)).rejects.toThrow('listCafeMissingItemReports failed: offline')
    await expect(reportMissingCafeItem(STREAM, 'Oat milk')).rejects.toThrow('reportMissingCafeItem failed: offline')
    await expect(resolveCafeMissingItemReport('report-1')).rejects.toThrow('resolveCafeMissingItemReport failed: offline')
  })
})
