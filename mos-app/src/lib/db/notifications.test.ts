import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listNotifications, countUnread } from './notifications'

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

  it('counts only Cafe-visible unread rows while keeping the dedicated unread read', async () => {
    const fixture: Array<{ id: string; metadata: unknown; read_at: string | null }> = [
      { id: 'task', metadata: { entity: { type: 'task', id: 't1' } }, read_at: null },
      { id: 'signal', metadata: { source: 'signal_mention', entity: { type: 'signal', id: 's1' } }, read_at: null },
      { id: 'legacy-work', metadata: { entity: { type: 'legacy', id: 'u1', route: '/updates?x=1#y' } }, read_at: null },
      { id: 'shared', metadata: { entity: { type: 'follow_up', id: 'f1' } }, read_at: null },
      { id: 'no-entity', metadata: {}, read_at: null },
      { id: 'malformed', metadata: 'old-payload', read_at: null },
      { id: 'already-read', metadata: { entity: { type: 'follow_up', id: 'f2' } }, read_at: '2026-09-01T12:00:00Z' },
    ]
    const filters: Array<[string, unknown]> = []
    let selectedColumns = ''
    const query: Record<string, unknown> = {}
    query.select = vi.fn((columns: string) => {
      selectedColumns = columns
      return query
    })
    query.is = vi.fn((column: string, value: unknown) => {
      filters.push([column, value])
      return query
    })
    query.then = (resolve: (value: unknown) => unknown) => {
      const rows = fixture
        .filter((row) => !filters.some(([column, value]) => column === 'read_at' && value === null) || row.read_at === null)
        .map((row) => Object.fromEntries(selectedColumns.split(',').map((column) => [column.trim(), row[column.trim() as keyof typeof row]])))
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }

    vi.stubEnv('VITE_RELEASE_PROFILE', 'cafe')
    vi.resetModules()
    vi.doUnmock('@/lib/supabase')
    vi.doMock('@/lib/supabase', () => ({ supabase: { schema: () => ({ from: () => query }) } }))

    try {
      const { countUnread: fresh } = await import('./notifications')
      const unread = await fresh()
      const cafeColumns = selectedColumns

      expect(unread).toBe(3)
      expect(filters).toContainEqual(['read_at', null])
      expect(cafeColumns).toBe('id, metadata')

      fixture.push(...Array.from({ length: 205 }, (_, index) => ({
        id: `shared-${index}`,
        metadata: { entity: { type: 'follow_up', id: `f${index + 3}` } },
        read_at: null,
      })))
      expect(await fresh()).toBe(208)

      vi.stubEnv('VITE_RELEASE_PROFILE', 'full')
      vi.resetModules()
      const { countUnread: freshFull } = await import('./notifications')
      expect(await freshFull()).toBe(211)
      expect(selectedColumns).toBe('id')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

void listNotifications
void countUnread
