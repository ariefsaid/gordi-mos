import { beforeEach, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listAvailableCafeStreamItems, setCafeStreamItem } from './cafe-stream-items'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const stream = { branch: { id: 'branch', name: 'Branch', code: 'branch' }, activity: 'kitchen' as const }
const schema = vi.mocked(supabase.schema)
beforeEach(() => vi.clearAllMocks())

it('offers only catalog items not currently visible on this stream, including hidden rows', async () => {
  const responses = {
    wip_items: [{ id: 'offered', name: 'Offered' }, { id: 'hidden', name: 'Hidden' }, { id: 'new', name: 'New' }],
    stream_items: [{ wip_item_id: 'offered', hidden_at: null, is_listed: true }, { wip_item_id: 'hidden', hidden_at: 'now', is_listed: true }],
  }
  const queries: Record<string, ReturnType<typeof vi.fn>> = {}
  schema.mockReturnValue({ from: (table: keyof typeof responses) => {
    const query = { select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: responses[table], error: null }).then(resolve) }
    for (const method of [query.select, query.eq, query.ilike, query.order]) method.mockReturnValue(query)
    queries[table] = query.eq
    return query
  } } as never)
  await expect(listAvailableCafeStreamItems(stream)).resolves.toEqual([{ id: 'hidden', name: 'Hidden', hidden: true }, { id: 'new', name: 'New', hidden: false }])
  expect(queries.stream_items).toHaveBeenCalledWith('branch_id', 'branch')
  expect(queries.stream_items).toHaveBeenCalledWith('activity', 'kitchen')
})

it('uses the authorized RPC for hide and restore, and surfaces write errors', async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'denied' } })
  schema.mockReturnValue({ rpc } as never)
  await setCafeStreamItem(stream, 'item', true)
  expect(rpc).toHaveBeenCalledWith('set_cafe_stream_item', { p_branch_id: 'branch', p_activity: 'kitchen', p_wip_item_id: 'item', p_hidden: true })
  await expect(setCafeStreamItem(stream, 'item', false)).rejects.toThrow('denied')
})

it('does not offer an unsafe partial list on read failure', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), order: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'unavailable' } }).then(resolve) }
  for (const method of [query.select, query.eq, query.ilike, query.order]) method.mockReturnValue(query)
  schema.mockReturnValue({ from: () => query } as never)
  await expect(listAvailableCafeStreamItems(stream)).rejects.toThrow('unavailable')
})
