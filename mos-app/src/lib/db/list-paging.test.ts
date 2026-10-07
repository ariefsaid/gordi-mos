import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], requests: [] as URL[], fail: false }))
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return { supabase: createClient('http://localhost:9999', 'synthetic-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      harness.requests.push(url)
      if (harness.fail) return new Response(JSON.stringify({ message: 'synthetic failure' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      let rows = [...harness.rows]
      for (const [field, filter] of url.searchParams.entries()) {
        if (filter.startsWith('neq.')) rows = rows.filter(row => String(row[field]) !== filter.slice(4))
        if (filter.startsWith('eq.')) rows = rows.filter(row => String(row[field]) === filter.slice(3))
        if (filter === 'is.null') rows = rows.filter(row => row[field] == null)
        if (filter.startsWith('lt.')) rows = rows.filter(row => row[field] != null && String(row[field]) < filter.slice(3))
        if (filter.startsWith('gte.')) rows = rows.filter(row => row[field] != null && String(row[field]) >= filter.slice(4))
      }
      for (const filter of url.searchParams.getAll('or')) {
        if (/id\.(lt|gt)\./.test(filter)) continue
        const clauses = filter.replace(/^\((.*)\)$/, '$1').split(',')
        rows = rows.filter(row => clauses.some(clause => {
          const [field, operator, ...parts] = clause.split('.')
          const value = parts.join('.')
          if (operator === 'neq') return String(row[field]) !== value
          if (operator === 'gte') return row[field] != null && String(row[field]) >= value
          if (operator === 'lt') return row[field] != null && String(row[field]) < value
          if (operator === 'is' && value === 'null') return row[field] == null
          return false
        }))
      }
      const idFilter = url.searchParams.get('id')
      if (idFilter?.startsWith('lt.')) rows = rows.filter(row => String(row.id) < idFilter.slice(3))
      const order = url.searchParams.get('order')?.split(',') ?? []
      rows.sort((a, b) => {
        for (const part of order) {
          const [field, direction, nullOrder] = part.split('.')
          if (a[field] == null || b[field] == null) {
            if (a[field] == null && b[field] == null) continue
            return (a[field] == null ? 1 : -1) * (nullOrder === 'nullsfirst' ? -1 : 1)
          }
          const cmp = String(a[field]).localeCompare(String(b[field]))
          if (cmp) return direction === 'desc' ? -cmp : cmp
        }
        return 0
      })
      const keyset = url.searchParams.getAll('or').find(value => /id\.(lt|gt)\./.test(value))
      if (keyset) {
        const allDate = keyset.match(/^log_date\.gt\.([^,]+),and\(log_date\.eq\.([^,]+),or\(created_at\.gt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.gt\.([^)]+)\)\)\)$/)
        if (allDate) {
          const [, date, , createdAt, , id] = allDate
          rows = rows.filter(row => String(row.log_date) > date
            || (row.log_date === date && (String(row.created_at) > createdAt
              || (row.created_at === createdAt && String(row.id) > id))))
        } else {
          const match = keyset.match(/\((\w+)\.(lt|gt)\.([^,]+),and\(\w+\.eq\.[^,]+,id\.(?:lt|gt)\.([^)]+)\)/)
          if (!match) throw new Error(`Unexpected cursor: ${keyset}`)
          const [, field, op, timestamp, id] = match
          const after = (a: string, b: string) => (op === 'gt' ? a > b : a < b)
          const includesNull = keyset.includes(`${field}.is.null`)
          rows = rows.filter(row => (includesNull && row[field] == null) || after(String(row[field]), timestamp) || (row[field] === timestamp && after(String(row.id), id)))
        }
      }
      // Model the API's default cap as well as explicit per-request limits.
      rows = rows.slice(0, Number(url.searchParams.get('limit') ?? 1000))
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } })
    } },
  }) }
})
import { listReadableSignals } from './signals'
import { fetchActualsMap, listSubmittedKitchenLogs } from './kitchen-logs'
import { listFollowUpEvents, listFollowUps } from './follow-ups'
import { listOlderDoneTasks, listTaskEvents, TASKS_OLDER_DONE_PAGE_SIZE, type OlderDoneTaskCursor } from './tasks'

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
beforeEach(() => { harness.rows = Array.from({ length: 1103 }, (_, index) => fixture(index + 1)); harness.requests = []; harness.fail = false })

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
    let before: { log_date: string; created_at: string; id: string } | undefined
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

  it('Café all-date review pages stay oldest-first across dates without cursor gaps or duplicates', async () => {
    harness.rows = harness.rows.map((row, index) => ({
      ...row,
      log_date: index < 73 ? '2026-10-03' : index < 519 ? '2026-10-04' : '2026-10-05',
    }))
    const expected = [...harness.rows].sort((a, b) => String(a.log_date).localeCompare(String(b.log_date))
      || String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
      .map(row => row.id)
    const ids: string[] = []
    let before: { log_date: string; created_at: string; id: string } | undefined
    const sizes: number[] = []
    do {
      const rows = await listSubmittedKitchenLogs(undefined, { before })
      sizes.push(rows.length)
      ids.push(...rows.map(row => row.id))
      before = rows.at(-1)
      if (rows.length < 50) break
    } while (sizes.length < 30)

    expect(sizes.slice(0, 2)).toEqual([50, 50])
    expect(sizes.at(-1)).toBe(3)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(1103)
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

  it('Follow-ups: newest-first cursor pages reach beyond the API cap without gaps or duplicates', async () => {
    harness.rows = Array.from({ length: 1103 }, (_, index) => ({
      ...fixture(index + 1), created_at: index > 500 ? '2026-10-05T09:00:00Z' : '2026-10-05T08:00:00Z',
      due_date: '2026-10-06', state: 'open',
    }))
    const expected = [...harness.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id))).map(row => row.id)
    const ids: string[] = []
    let page = await listFollowUps()
    while (page.length > 0) {
      ids.push(...page.map(row => row.id))
      if (page.length < 50) break
      page = await listFollowUps({ before: page.at(-1)! })
    }
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(1103)
    expect(harness.requests.every(url => url.searchParams.get('limit') === '50')).toBe(true)
  })

  it('Task and follow-up child histories: newest-first cursors retain tied timestamps across pages', async () => {
    harness.rows = Array.from({ length: 103 }, (_, index) => ({
      ...fixture(index + 1), task_id: 'task-1', follow_up_id: 'fu-1',
      created_at: index > 50 ? '2026-10-05T09:00:00Z' : '2026-10-05T08:00:00Z',
    }))
    const expected = [...harness.rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(b.id).localeCompare(String(a.id))).map(row => row.id)
    for (const readPage of [listTaskEvents, listFollowUpEvents] as const) {
      const ids: string[] = []
      let page = await readPage(readPage === listTaskEvents ? 'task-1' : 'fu-1')
      while (page.length > 0) {
        ids.push(...page.map(row => row.id))
        if (page.length < 50) break
        page = await readPage(readPage === listTaskEvents ? 'task-1' : 'fu-1', page.at(-1)!)
      }
      expect(ids).toEqual(expected)
      expect(new Set(ids).size).toBe(103)
    }
    expect(harness.requests.every(url => url.searchParams.get('limit') === '50')).toBe(true)
  })

  it('Older Done Tasks owns exact-page, page-size-plus-one, empty, and error boundaries', async () => {
    const cutoff = '2026-09-05T00:00:00Z'
    harness.rows = Array.from({ length: TASKS_OLDER_DONE_PAGE_SIZE }, (_, index) => ({
      ...fixture(index + 1), status: 'Done', completed_at: '2026-06-01T00:00:00Z', archived_at: null,
    }))
    const exact = await listOlderDoneTasks({}, null, cutoff)
    expect(exact.rows).toHaveLength(TASKS_OLDER_DONE_PAGE_SIZE)
    expect(exact.hasMore).toBe(false)
    expect(exact.nextCursor).toBeNull()

    harness.rows.push({ ...fixture(51), status: 'Done', completed_at: '2026-06-01T00:00:00Z', archived_at: null })
    const extra = await listOlderDoneTasks({}, null, cutoff)
    expect(extra.rows).toHaveLength(TASKS_OLDER_DONE_PAGE_SIZE)
    expect(extra.hasMore).toBe(true)
    expect(extra.nextCursor?.id).toBe(extra.rows.at(-1)?.id)

    harness.rows = []
    expect(await listOlderDoneTasks({}, null, cutoff)).toEqual({ rows: [], nextCursor: null, hasMore: false })
    harness.fail = true
    await expect(listOlderDoneTasks({}, null, cutoff)).rejects.toThrow(/synthetic failure/)
    expect(harness.requests.every(url => url.searchParams.get('limit') === '51')).toBe(true)
  })

  it('Older Done Tasks traverse tied completion timestamps and legacy null completions without gaps', async () => {
    harness.rows = Array.from({ length: 103 }, (_, index) => ({
      ...fixture(index + 1), status: 'Done', archived_at: null,
      completed_at: index >= 98 ? null : index % 2 === 0 ? '2026-08-01T00:00:00Z' : '2026-07-01T00:00:00Z',
    }))
    const expected = [...harness.rows].sort((a, b) => {
      if (a.completed_at === null) return b.completed_at === null ? String(b.id).localeCompare(String(a.id)) : 1
      if (b.completed_at === null) return -1
      return String(b.completed_at).localeCompare(String(a.completed_at)) || String(b.id).localeCompare(String(a.id))
    }).map(row => row.id)
    const ids: string[] = []
    const sizes: number[] = []
    let before: OlderDoneTaskCursor | null = null
    let page = await listOlderDoneTasks({}, before, '2026-09-05T00:00:00Z')
    while (page.rows.length > 0) {
      sizes.push(page.rows.length)
      ids.push(...page.rows.map(row => row.id))
      before = page.nextCursor
      if (!page.hasMore || !before) break
      page = await listOlderDoneTasks({}, before, '2026-09-05T00:00:00Z')
    }
    expect(sizes).toEqual([50, 50, 3])
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(103)
  })

  it('Follow-up list errors remain visible to the owning list state', async () => {
    harness.fail = true
    await expect(listFollowUps()).rejects.toThrow(/synthetic failure/)
  })
})
