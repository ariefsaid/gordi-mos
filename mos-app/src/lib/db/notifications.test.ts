import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('notifications DAL — bounded reads (CQ#2)', () => {
  const limitCalls: string[] = []
  const nullFilters: Array<[string, unknown]> = []
  const selectCalls: Array<[string, unknown?]> = []
  const cursorCalls: string[] = []
  const orderCalls: Array<[string, unknown]> = []

  function makeSb(data: unknown, count: number | null = null, error: unknown = null) {
    const b: Record<string, unknown> = {}
    const result = Promise.resolve({ data, error, count })
    b.select = vi.fn((columns: string, options?: unknown) => { selectCalls.push([columns, options]); return b })
    b.eq = vi.fn(() => b)
    b.is = vi.fn((col: string, val: unknown) => {
      nullFilters.push([col, val])
      return b
    })
    b.order = vi.fn((column: string, options: unknown) => { orderCalls.push([column, options]); return b })
    b.or = vi.fn((filter: string) => { cursorCalls.push(filter); return b })
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
    selectCalls.length = 0
    cursorCalls.length = 0
    orderCalls.length = 0
  })

  async function loadWith(sb: unknown) {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: sb }))
    return import('./notifications')
  }

  it('returns exactly the page size when the next row is absent', async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ id: `n-${index}`, created_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
    const { listNotifications: fresh } = await loadWith(makeSb(rows))

    const page = await fresh()

    expect(page.rows).toHaveLength(200)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
    expect(limitCalls).toContain('limit:201')
  })

  it('uses the extra row only as a continuation signal', async () => {
    const rows = Array.from({ length: 201 }, (_, index) => ({ id: `n-${index}`, created_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
    const { listNotifications: fresh } = await loadWith(makeSb(rows))

    const page = await fresh()

    expect(page.rows).toHaveLength(200)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toEqual(rows[199])
  })

  it('returns an empty complete page when there are no notifications', async () => {
    const { listNotifications: fresh } = await loadWith(makeSb([]))

    await expect(fresh()).resolves.toEqual({ rows: [], hasMore: false, nextCursor: null })
  })

  it('preserves a failed notification read as an error', async () => {
    const { listNotifications: fresh } = await loadWith(makeSb(null, null, { message: 'offline' }))

    await expect(fresh()).rejects.toThrow('listNotifications failed')
  })

  it('continues strictly after the last row using a stable ordered cursor', async () => {
    const cursor = { created_at: '2026-01-02T00:00:00Z', id: 'n-2' }
    const { listNotifications: fresh } = await loadWith(makeSb([]))

    await fresh(cursor)

    expect(cursorCalls).toContain('created_at.lt.2026-01-02T00:00:00Z,and(created_at.eq.2026-01-02T00:00:00Z,id.lt.n-2)')
    expect(orderCalls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('countUnread is a HEAD exact count — no unread rows cross the wire (#1359)', async () => {
    const { countUnread: fresh } = await loadWith(makeSb(null, 3))
    expect(await fresh()).toBe(3)
    expect(selectCalls).toContainEqual(['id', { count: 'exact', head: true }])
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
    let selectedOpts: unknown = null
    const query: Record<string, unknown> = {}
    query.select = vi.fn((columns: string, opts?: unknown) => {
      selectedColumns = columns
      selectedOpts = opts ?? null
      return query
    })
    query.is = vi.fn((column: string, value: unknown) => {
      filters.push([column, value])
      return query
    })
    query.then = (resolve: (value: unknown) => unknown) => {
      const withSelectOpts = selectedOpts != null
      const rows = fixture
        .filter((row) => !filters.some(([column, value]) => column === 'read_at' && value === null) || row.read_at === null)
        .map((row) => Object.fromEntries(selectedColumns.split(',').map((column) => [column.trim(), row[column.trim() as keyof typeof row]])))
      return Promise.resolve({ data: withSelectOpts ? null : rows, error: null, count: withSelectOpts ? 211 : null }).then(resolve)
    }

    vi.stubEnv('VITE_RELEASE_PROFILE', 'cafe')
    try {
      const { countUnread: fresh } = await loadWith({ schema: () => ({ from: () => query }) })
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
      const { countUnread: freshFull } = await loadWith({ schema: () => ({ from: () => query }) })
      expect(await freshFull()).toBe(211)
      expect(selectedColumns).toBe('id')
      expect(selectedOpts).toEqual({ count: 'exact', head: true })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
