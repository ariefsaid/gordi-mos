import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  notificationRoute,
  listNotifications,
  countUnread,
  type NotificationRow,
} from './notifications'

function withRoute(route: unknown): NotificationRow {
  return {
    id: 'n',
    severity: 'info',
    title: 't',
    body: null,
    metadata: { entity: { type: 'task', id: 't1', route } as never },
    read_at: null,
    created_at: '2026-07-05T00:00:00Z',
  }
}

describe('notificationRoute — app-relative guard (security Low-2)', () => {
  it('returns a valid app-relative route', () => {
    expect(notificationRoute(withRoute('/tasks/t1'))).toBe('/tasks/t1')
  })

  it('returns null when there is no route', () => {
    expect(notificationRoute({ ...withRoute('/x'), metadata: {} })).toBeNull()
  })

  const unsafe: unknown[] = ['//evil.com', 'javascript:alert(1)', 'http://evil.com', 'tasks/t1', 123]
  it.each(unsafe)('rejects an unsafe route (%s)', (route) => {
    expect(notificationRoute(withRoute(route))).toBeNull()
  })
})

// CQ#2: listNotifications must be a bounded read (Inbox rows accumulate forever; the unread index
// makes the badge O(unread) not O(all-time) when it goes through countUnread). Verify the DAL sends
// a LIMIT and that countUnread hits a read_at-null-only path instead of pulling every row.
describe('notifications DAL — bounded reads (CQ#2)', () => {
  const limitCalls: string[] = []
  const nullFilters: Array<[string, unknown]> = []

  function makeSb(data: unknown) {
    const b: Record<string, unknown> = {}
    const result = Promise.resolve({ data, error: null })
    b.select = vi.fn(() => b)
    b.eq = vi.fn(() => b)
    b.is = vi.fn((col: string, val: unknown) => {
      nullFilters.push([col, val])
      return b
    })
    b.order = vi.fn(() => b)
    b.limit = vi.fn((n: number) => {
      limitCalls.push(`limit:${n}`)
      return b
    })
    b.then = (resolve: (v: unknown) => unknown) => result.then(resolve)
    return { schema: () => ({ from: () => b }) }
  }

  beforeEach(() => {
    limitCalls.length = 0
    nullFilters.length = 0
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: makeSb([{ id: 'n1' }]) }))
  })

  it('listNotifications caps the read so the Inbox page cannot grow unbounded', async () => {
    const { listNotifications: fresh } = await import('./notifications')
    await fresh()
    expect(limitCalls.some((c) => c.startsWith('limit:'))).toBe(true)
  })

  it('countUnread filters to read_at IS NULL (badge path does not load read rows)', async () => {
    vi.doUnmock('@/lib/supabase')
    vi.doMock('@/lib/supabase', () => ({
      supabase: makeSb([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]),
    }))
    const { countUnread: fresh } = await import('./notifications')
    const n = await fresh()
    expect(n).toBe(3)
    expect(nullFilters).toContainEqual(['read_at', null])
  })
})

void listNotifications
void countUnread
