import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { isOverdue, listFollowUpEvents, listFollowUps } from './follow-ups'

afterEach(() => vi.useRealTimers())

describe('Follow-up reads and overdue dates', () => {
  it.each([
    ['2026-10-05T16:59:00Z', false],
    ['2026-10-05T17:00:00Z', true],
    ['2026-10-05T23:59:00Z', true],
    ['2026-10-06T00:00:00Z', true],
  ])('compares a due date with the WIB day at %s', (instant, overdue) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(instant))
    expect(isOverdue({ due_date: '2026-10-05', state: 'open' })).toBe(overdue)
  })

  it('applies the WIB day and stable keyset to follow-ups and event history', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T17:00:00Z'))
    const filters: unknown[][] = []
    const result = { data: [], error: null }
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'neq', 'order', 'limit']) {
      query[method] = vi.fn(() => query)
    }
    query.lt = vi.fn((...args: unknown[]) => { filters.push(args); return query })
    query.or = vi.fn((filter: string) => { filters.push(['cursor', filter]); return query })
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn(() => query) } as never)

    const before = { created_at: '2026-10-05T12:00:00Z', id: 'f-7' }
    await listFollowUps({ overdue: true, before })
    await listFollowUpEvents('f-7', before)

    expect(filters).toContainEqual(['due_date', '2026-10-06'])
    expect(filters.filter(([field]) => field === 'cursor')).toEqual([
      ['cursor', 'created_at.lt.2026-10-05T12:00:00Z,and(created_at.eq.2026-10-05T12:00:00Z,id.lt.f-7)'],
      ['cursor', 'created_at.lt.2026-10-05T12:00:00Z,and(created_at.eq.2026-10-05T12:00:00Z,id.lt.f-7)'],
    ])
  })
})
