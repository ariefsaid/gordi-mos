import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { isOverdue, listFollowUps } from './follow-ups'

afterEach(() => vi.useRealTimers())

describe('Follow-up overdue dates', () => {
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

  it('filters the overdue queue from the WIB day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-05T17:00:00Z'))
    const filters: unknown[][] = []
    const result = { data: [], error: null }
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'neq', 'order', 'limit']) {
      query[method] = vi.fn(() => query)
    }
    query.lt = vi.fn((...args: unknown[]) => { filters.push(args); return query })
    query.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
    vi.mocked(supabase.schema).mockReturnValue({ from: vi.fn(() => query) } as never)

    await listFollowUps({ overdue: true })

    expect(filters).toContainEqual(['due_date', '2026-10-06'])
  })
})
