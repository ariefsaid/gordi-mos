import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))
import { supabase } from '@/lib/supabase'
import { EVENTS_PAGE_SIZE, listEventsOverlapping } from './events'

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
    for (const method of ['select', 'is', 'lt', 'gt', 'or', 'order', 'limit']) query[method] = vi.fn((...args: unknown[]) => { calls.push([method, args]); return query })
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: readError }).then(resolve)
    schema.mockReturnValue({ from: vi.fn(() => query) } as never)
  })

  it('uses the mos seam and a bounded half-open active month window', async () => {
    await expect(listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' }))
      .resolves.toEqual({ rows: [], nextCursor: null, hasMore: false })
    expect(schema).toHaveBeenCalledWith('mos')
    expect(calls).toContainEqual(['is', ['archived_at', null]])
    expect(calls).toContainEqual(['lt', ['starts_at', '2027-01-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['gt', ['ends_at', '2026-12-31T17:00:00.000Z']])
    expect(calls).toContainEqual(['order', ['starts_at', { ascending: true }]])
    expect(calls).toContainEqual(['order', ['id', { ascending: true }]])
    expect(calls).toContainEqual(['limit', [EVENTS_PAGE_SIZE + 1]])
  })

  it('uses an exact full page without claiming a continuation', async () => {
    rows = Array.from({ length: EVENTS_PAGE_SIZE }, (_, index) => ({ id: `event-${index}`, starts_at: `2027-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` }))
    const page = await listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })
    expect(page.rows).toHaveLength(EVENTS_PAGE_SIZE)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it('uses a page-plus-one probe and returns a cursor at the final visible event', async () => {
    rows = Array.from({ length: EVENTS_PAGE_SIZE + 1 }, (_, index) => ({ id: `event-${index}`, starts_at: `2027-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` }))
    const page = await listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })
    expect(page.rows).toHaveLength(EVENTS_PAGE_SIZE)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toEqual({ starts_at: (rows[EVENTS_PAGE_SIZE - 1] as { starts_at: string }).starts_at, id: `event-${EVENTS_PAGE_SIZE - 1}` })
  })

  it('continues after both the timestamp and id cursor', async () => {
    await listEventsOverlapping(
      { startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' },
      { starts_at: '2027-01-10T00:00:00Z', id: 'event-10' },
    )
    expect(calls).toContainEqual(['or', ['starts_at.gt.2027-01-10T00:00:00Z,and(starts_at.eq.2027-01-10T00:00:00Z,id.gt.event-10)']])
  })

  it('preserves an Events read error for the collection error state', async () => {
    readError = { message: 'offline' }
    await expect(listEventsOverlapping({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' }))
      .rejects.toThrow('listEventsOverlapping failed — offline')
  })
})
