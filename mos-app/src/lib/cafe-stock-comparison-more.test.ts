import { describe, expect, it } from 'vitest'
import { audienceOf, comparableStreams, mayCompareStream } from './cafe-stock-comparison-access'
import { readLatestCounts } from './cafe-stock-comparison-counts'
import { buildSample, sampleHistory } from './cafe-stock-comparison-sample'
import { applyPatch, parseComparisonUrl, stockComparisonHref, writeComparisonUrl } from './cafe-stock-comparison-url'
import { coverageOf, type CountLine } from './cafe-stock-comparison'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const line = (id: string, itemId: string, date: string, quantity = 1): CountLine => ({
  id, wip_item_id: itemId, item_name: itemId, item_category: null, item_kind: 'RAW', item_unit_id: 'u', unit_name: 'KG', counted_quantity: quantity,
  count_date: date, submitted_at: `${date}T10:00:00Z`, status: 'Confirmed',
})

/** A fake keyset reader over rows already newest-first, pages of `size`. */
function reader(all: CountLine[], size: number, fail?: number) {
  let calls = 0
  return {
    calls: () => calls,
    read: async (after: readonly string[] | null) => {
      calls += 1
      if (fail !== undefined && calls === fail) throw new Error('down')
      const start = after ? Number(after[0]) : 0
      const rows = all.slice(start, start + size)
      return { rows, next: rows.length ? [String(start + rows.length)] : null }
    },
  }
}

describe('latest Count read', () => {
  const rows = [line('a', 'i1', '2026-10-14'), line('b', 'i2', '2026-10-13'), line('c', 'i1', '2026-10-12'), line('d', 'i9', '2026-09-01')]

  it('stops once every listed item has its latest Count, and says the history was not exhausted', async () => {
    const r = reader(rows, 2)
    const { state, error } = await readLatestCounts({ readPage: r.read, needed: new Set(['i1:u', 'i2:u']) })
    expect(error).toBeNull()
    expect(state.exhausted).toBe(false)
    expect(state.latest.get('i1:u')?.count.id).toBe('a')
    expect(state.latest.has('i9:u')).toBe(false)
    expect(r.calls()).toBe(1)
  })

  it('reads to the first Count when asked (older Counts), keeping retired items', async () => {
    const first = await readLatestCounts({ readPage: reader(rows, 2).read, needed: new Set(['i1:u', 'i2:u']) })
    const next = await readLatestCounts({ readPage: reader(rows, 2).read, needed: new Set(), resume: first.state, all: true })
    expect(next.state.exhausted).toBe(true)
    expect(next.state.latest.has('i9:u')).toBe(true)
    expect(next.state.oldest).toBe('2026-09-01')
  })

  it('reads on until a page comes back empty when a listed item was never counted', async () => {
    const { state } = await readLatestCounts({ readPage: reader(rows, 3).read, needed: new Set(['never:u']) })
    expect(state.exhausted).toBe(true)
    expect(state.latest.size).toBe(3)
  })

  it('reports a failed page without turning it into an empty result', async () => {
    const { state, error } = await readLatestCounts({ readPage: reader(rows, 1, 2).read, needed: new Set(['i9:u']) })
    expect(error?.message).toBe('down')
    expect(state.exhausted).toBe(false)
    expect(state.latest.has('i1:u')).toBe(true)
  })

  it('never lets an older page override a newer Count of the same item', async () => {
    const { state } = await readLatestCounts({ readPage: reader([line('x', 'i1', '2026-10-10'), line('y', 'i1', '2026-10-14')], 5).read, needed: new Set() , all: true })
    expect(state.latest.get('i1:u')?.count.id).toBe('y')
  })
})

describe('who may compare', () => {
  const stream = (id: string, activity: 'kitchen' | 'bar'): ProductionStream => ({ branch: { id, code: id, name: id }, activity, produces: true })
  const options = [stream('b1', 'kitchen'), stream('b2', 'bar')]

  it('admits ops lead and admin everywhere, a supervisor only in her streams, nobody else', () => {
    for (const role of ['ops_lead', 'admin']) expect(comparableStreams(audienceOf([role]), new Set(), options)).toHaveLength(2)
    const supervisor = audienceOf(['supervisor'])
    expect(comparableStreams(supervisor, new Set(['b2|bar']), options).map((s) => s.branch.id)).toEqual(['b2'])
    expect(mayCompareStream(supervisor, new Set(), options[0])).toBe(false)
    for (const role of ['member', 'finance', 'manager', 'team_lead']) {
      expect(audienceOf([role]).admitted).toBe(false)
      expect(comparableStreams(audienceOf([role]), new Set(['b1|kitchen']), options)).toEqual([])
    }
  })
})

describe('URL contract', () => {
  const today = '2026-10-15'
  it('defaults every choice and reports bad values without throwing', () => {
    const { state, invalid } = parseComparisonUrl(new URLSearchParams(), today)
    expect(state).toMatchObject({ stream: null, q: '', kind: 'all', category: 'all', differences: false, sort: 'gap', dir: 'desc', page: 1, item: '', from: '2026-09-16', to: today, sample: false })
    expect(invalid).toEqual([])
    const bad = parseComparisonUrl(new URLSearchParams('stream=x&kind=SOUP&sort=up&dir=sideways&page=0&from=2026-02-30&to=2026-10-01'), today)
    expect(bad.invalid).toEqual(expect.arrayContaining(['stream', 'kind', 'sort', 'dir', 'page', 'from']))
    expect(bad.state.sort).toBe('gap')
  })

  it('round-trips a full state and leaves shell keys alone', () => {
    const search = new URLSearchParams('shell=1&stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen&q=ayam&kind=WIP&category=none&differences=1&sort=item&dir=desc&page=3&item=i1&unit=u1&from=2026-10-01&to=2026-10-10&layout=preview')
    const { state } = parseComparisonUrl(search, today)
    expect(state).toMatchObject({ kind: 'WIP', category: 'none', differences: true, sort: 'item', dir: 'desc', page: 3, item: 'i1', unit: 'u1', sample: true, datesInUrl: true })
    const written = writeComparisonUrl(new URLSearchParams('shell=1'), state)
    expect(parseComparisonUrl(written, today).state).toEqual(state)
    expect(written.get('shell')).toBe('1')
  })

  it('a filter change resets the page and the open item; a sort change resets the page only', () => {
    const { state } = parseComparisonUrl(new URLSearchParams('page=4&item=i1&unit=u1'), today)
    expect(applyPatch(state, { q: 'x' })).toMatchObject({ page: 1, item: '', unit: '' })
    expect(applyPatch(state, { sort: 'item' })).toMatchObject({ page: 1, item: 'i1', dir: 'asc' })
  })

  it('links from Count and Available to transfer carry the stream and an optional item only', () => {
    expect(stockComparisonHref({ stream: { branchId: 'b', activity: 'bar' } })).toBe('/cafe/stock-comparison?stream=b%3Abar')
    expect(stockComparisonHref({ stream: null })).toBe('/cafe/stock-comparison')
  })
})

describe('the labelled sample', () => {
  const today = '2026-10-15'
  const now = new Date('2026-10-15T08:00:00+07:00')
  it('goes through the same derivation and shows every kind of state', () => {
    const { rows } = buildSample(today, now)
    const flags = new Set(rows.flatMap((r) => r.flags))
    for (const flag of ['shortage', 'surplus', 'no_difference', 'zero_expected', 'pending_confirmation', 'different_times', 'stale_esb', 'old_count', 'partial', 'mapping_needed', 'unit_mismatch', 'not_counted']) expect(flags.has(flag as never)).toBe(true)
    const c = coverageOf(rows)
    expect(c.gaps + c.needsData + c.zero).toBe(c.total)
    expect(rows.some((r) => r.expected !== null && r.expected.quantity < 0n)).toBe(true)
  })
  it('has a Count history including a Rejected Count', () => {
    const { rows } = buildSample(today, now)
    const history = rows.flatMap((r) => sampleHistory(r, today))
    expect(history.some((h) => h.status === 'Rejected')).toBe(true)
  })
})
