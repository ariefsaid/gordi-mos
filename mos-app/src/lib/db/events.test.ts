import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))
import { supabase } from '@/lib/supabase'
import { listEventsOverlapping } from './events'

const schema = vi.mocked(supabase.schema)

describe('listEventsOverlapping', () => {
  const calls: Array<[string, unknown]> = []
  beforeEach(() => {
    calls.length = 0
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'lt', 'gt', 'order']) query[method] = vi.fn((...args: unknown[]) => { calls.push([method, args]); return query })
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    schema.mockReturnValue({ from: vi.fn(() => query) } as never)
  })

  it('uses the mos seam and the half-open active overlap query', async () => {
    await expect(listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })).resolves.toEqual([])
    expect(schema).toHaveBeenCalledWith('mos')
    expect(calls).toContainEqual(['is', ['archived_at', null]])
    expect(calls).toContainEqual(['lt', ['starts_at', '2027-01-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['gt', ['ends_at', '2026-12-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['order', ['starts_at', { ascending: true }]])
  })
})
