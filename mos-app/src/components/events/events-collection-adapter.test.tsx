import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/events', () => ({ listEventsOverlapping: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn(), getPeople: vi.fn() }))
import { listEventsOverlapping } from '@/lib/db/events'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import { eventsCollectionDescriptor } from './events-collection-adapter'

const list = vi.mocked(listEventsOverlapping)
const eventCollectionQuery = eventsCollectionDescriptor.query

describe('Events collection descriptor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    list.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false })
    vi.mocked(getBusinessUnits).mockResolvedValue([])
    vi.mocked(getPeople).mockResolvedValue([])
  })

  it('rejects a malformed month URL and restores the current WIB month', () => {
    const parsed = eventCollectionQuery.parse(new URLSearchParams('month=2026-13&saved=x'), 'calendar')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.issues).toEqual([{ key: 'month', code: 'invalid-value', value: '2026-13' }])
      expect(parsed.query?.month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
      expect(parsed.query?.savedViewId).toBe('x')
    }
  })

  it('computes its neutral query at access time instead of module load', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T18:00:00Z'))
    expect(eventCollectionQuery.neutral.month).toBe('2027-01')
    vi.setSystemTime(new Date('2027-01-31T18:00:00Z'))
    expect(eventCollectionQuery.neutral.month).toBe('2027-02')
    vi.useRealTimers()
  })

  it('carries the continuation cursor into the calendar context and appends its next page', async () => {
    const cursor = { starts_at: '2027-01-01T00:00:00Z', id: 'event-1' }
    const first = { id: 'event-1', starts_at: cursor.starts_at } as never
    const next = { id: 'event-2', starts_at: '2027-01-02T00:00:00Z' } as never
    list.mockResolvedValueOnce({ rows: [first], nextCursor: cursor, hasMore: true })
      .mockResolvedValueOnce({ rows: [next], nextCursor: null, hasMore: false })
    const query = { month: '2027-01', savedViewId: null }
    const data = await eventsCollectionDescriptor.load({ query, viewerId: null })
    expect(data.context.nextCursor).toEqual(cursor)

    const loaded = await eventsCollectionDescriptor.loadMore?.({ query, viewerId: null, data })
    expect(loaded?.records.map((row) => row.id)).toEqual(['event-1', 'event-2'])
    expect(loaded?.context.nextCursor).toBeNull()
    expect(list).toHaveBeenLastCalledWith({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z', month: '2027-01' }, cursor)
  })

  it('loads the selected WIB calendar range and exposes only calendar capabilities', async () => {
    const data = await eventsCollectionDescriptor.load({ query: { month: '2027-01', savedViewId: null }, viewerId: null })
    expect(list).toHaveBeenCalledWith({ startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z', month: '2027-01' })
    expect(data.records).toEqual([])
    expect(data.context.nextCursor).toBeNull()
    expect(eventsCollectionDescriptor.defaultPresentation).toBe('calendar')
    expect(eventsCollectionDescriptor.savedViews.enabled).toBe(false)
    expect(eventsCollectionDescriptor.presentations.calendar.capabilities).toMatchObject({ search: false, savedViews: false, selection: false, recordOpening: false })
  })
})
