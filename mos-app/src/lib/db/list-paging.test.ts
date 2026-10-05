import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], requests: [] as URL[] }))
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return { supabase: createClient('http://localhost:9999', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      harness.requests.push(url)
      let rows = [...harness.rows]
      for (const field of ['status', 'log_date', 'branch_id', 'activity', 'retracted_at', 'superseded_by']) {
        const filter = url.searchParams.get(field)
        if (filter?.startsWith('neq.')) rows = rows.filter(row => row[field] !== filter.slice(4))
        if (filter?.startsWith('eq.')) rows = rows.filter(row => row[field] === filter.slice(3))
        if (filter === 'is.null') rows = rows.filter(row => row[field] == null)
      }
      const idFilter = url.searchParams.get('id')
      if (idFilter?.startsWith('lt.')) rows = rows.filter(row => String(row.id) < idFilter.slice(3))
      const order = url.searchParams.get('order')?.split(',') ?? []
      rows.sort((a, b) => {
        for (const part of order) {
          const [field, direction] = part.split('.')
          const cmp = String(a[field]).localeCompare(String(b[field]))
          if (cmp) return direction === 'desc' ? -cmp : cmp
        }
        return 0
      })
      const keyset = url.searchParams.getAll('or').find(value => /id\.(lt|gt)\./.test(value))
      if (keyset) {
        const match = keyset.match(/\((\w+)\.(lt|gt)\.([^,]+),and\(\w+\.eq\.[^,]+,id\.(?:lt|gt)\.([^)]+)\)\)/)
        if (!match) throw new Error(`Unexpected cursor: ${keyset}`)
        const [, field, op, timestamp, id] = match
        const after = (a: string, b: string) => (op === 'gt' ? a > b : a < b)
        rows = rows.filter(row => after(String(row[field]), timestamp) || (row[field] === timestamp && after(String(row.id), id)))
      }
      // Model the API's default cap as well as explicit per-request limits.
      rows = rows.slice(0, Number(url.searchParams.get('limit') ?? 1000))
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } })
    } },
  }) }
})
import { listReadableSignals } from './signals'
import { fetchActualsMap, listSubmittedKitchenLogs } from './kitchen-logs'

function fixture(index: number) {
  return {
    id: `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`,
    // More than a page shares a timestamp. Input order deliberately differs from id order.
    occurred_at: index > 500 ? '2026-10-05T09:00:00+00:00' : '2026-10-05T08:00:00+00:00',
    created_at: index > 500 ? '2026-10-05T09:00:00+00:00' : '2026-10-05T08:00:00+00:00',
    log_date: '2026-10-05', status: 'Submitted', branch_id: 'branch-1', activity: 'kitchen',
    wip_item_id: 'item-1', item_unit_id: null, qty_porsi: 1,
    action: 'produce', wip_items: { name: 'Example item' }, retracted_at: index % 3 === 0 ? '2026-10-05T09:00:00Z' : null,
  }
}
beforeEach(() => { harness.rows = Array.from({ length: 1103 }, (_, index) => fixture(index + 1)); harness.requests = [] })

describe('server list paging boundaries', () => {
  it('Signals: first, next and final pages reach beyond the API cap without gaps or duplicates on equal timestamps, including retracted history', async () => {
    const expected = harness.rows.map(row => row.id).reverse()
    const ids: string[] = []
    let before: { occurred_at: string; id: string } | undefined
    let sizes: number[] = []
    do {
      const rows = await listReadableSignals({ includeRetracted: true, before })
      sizes = [...sizes, rows.length]
      ids.push(...rows.map(row => row.id))
      before = rows.at(-1)
      if (rows.length < 50) break
    } while (sizes.length < 30)
    expect(sizes.slice(0, 2)).toEqual([50, 50])
    expect(sizes.at(-1)).toBe(3)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(1103)
    expect(harness.requests.every(url => url.searchParams.get('limit') === '50')).toBe(true)
  })

  it('Café: date and stream windows page oldest first (the review queue order) through first, next and last pages without equal-time gaps or duplicates', async () => {
    harness.rows.push({ ...fixture(2000), log_date: '2026-10-04' }, { ...fixture(2001), activity: 'bar' }, { ...fixture(2002), status: 'Approved' })
    const expected = harness.rows.slice(0, 1103).map(row => row.id)
    const ids: string[] = []
    let before: { created_at: string; id: string } | undefined
    const sizes: number[] = []
    do {
      const rows = await listSubmittedKitchenLogs('2026-10-05', { before, stream: { branchId: 'branch-1', activity: 'kitchen' } })
      sizes.push(rows.length)
      ids.push(...rows.map(row => row.id))
      before = rows.at(-1)
      if (rows.length < 50) break
    } while (sizes.length < 30)
    expect(sizes.slice(0, 2)).toEqual([50, 50])
    expect(sizes.at(-1)).toBe(3)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(1103)
    expect(harness.requests.every(url => url.searchParams.get('limit') === '50')).toBe(true)
  })

  it('Café history totals include every recorded fact beyond the API cap, using bounded stream/date reads', async () => {
    harness.rows.push({ ...fixture(2000), action: 'waste', status: 'Draft', superseded_by: 'replacement', qty_porsi: 99 })
    const actuals = await fetchActualsMap('2026-10-05', { branch: { id: 'branch-1', code: 'demo', name: 'Demo' }, activity: 'kitchen' })
    expect(Object.keys(actuals['item-1'])).toEqual(['produce'])
    const history = actuals['item-1'].produce ?? []
    expect(history).toHaveLength(1103)
    expect(history.reduce((sum, row) => sum + row.qty_porsi, 0)).toBe(1103)
    expect(new Set(history.map(row => row.key)).size).toBe(1103)
    expect(harness.requests).toHaveLength(23)
    expect(harness.requests.every(url => url.searchParams.get('limit') === '50')).toBe(true)
  })

  it('an exact full final page is followed by an empty page, rather than assuming the API capped the list', async () => {
    harness.rows = harness.rows.slice(0, 50)
    const first = await listReadableSignals({ includeRetracted: true })
    expect(first).toHaveLength(50)
    expect(await listReadableSignals({ includeRetracted: true, before: first.at(-1)! })).toEqual([])
  })

  it('Signals default pages exclude retracted rows before applying the limit', async () => {
    const rows = await listReadableSignals()
    expect(rows).toHaveLength(50)
    expect(rows.every(row => row.retracted_at === null)).toBe(true)
  })
})
