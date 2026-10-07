import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))
import { supabase } from '@/lib/supabase'
import { listEventsOverlapping } from './events'

const schema = vi.mocked(supabase.schema)

describe('listEventsOverlapping', () => {
  const calls: Array<[string, unknown]> = []
  let rows: unknown[] = []
  let readError: unknown = null
  beforeEach(() => {
    calls.length = 0
    rows = []
    readError = null
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'is', 'lt', 'gt', 'order', 'limit']) query[method] = vi.fn((...args: unknown[]) => { calls.push([method, args]); return query })
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: readError }).then(resolve)
    schema.mockReturnValue({ from: vi.fn(() => query) } as never)
  })

  it('uses the mos seam and the half-open active overlap query', async () => {
    await expect(listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })).resolves.toEqual({ rows: [], hasMore: false })
    expect(schema).toHaveBeenCalledWith('mos')
    expect(calls).toContainEqual(['is', ['archived_at', null]])
    expect(calls).toContainEqual(['lt', ['starts_at', '2027-01-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['gt', ['ends_at', '2026-12-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['order', ['starts_at', { ascending: true }]])
    expect(calls).toContainEqual(['order', ['title', { ascending: true }]])
    expect(calls).toContainEqual(['limit', [1001]])
  })

  it('accepts an exact full calendar page without claiming there are more events', async () => {
    rows = Array.from({ length: 1000 }, () => ({}))
    const page = await listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })
    expect(page.rows).toHaveLength(1000)
    expect(page.hasMore).toBe(false)
  })

  it('uses the extra event only as an overflow signal and never returns it as a calendar row', async () => {
    rows = Array.from({ length: 1001 }, (_, index) => ({ id: `event-${index}` }))
    const page = await listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })
    expect(page.rows).toHaveLength(1000)
    expect(page.hasMore).toBe(true)
    expect(page.rows).not.toContainEqual({ id: 'event-1000' })
  })

  it('preserves an Events read error for the collection error state', async () => {
    readError = { message: 'offline' }
    await expect(listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' }))
      .rejects.toThrow('listEventsOverlapping failed — offline')
  })
})
