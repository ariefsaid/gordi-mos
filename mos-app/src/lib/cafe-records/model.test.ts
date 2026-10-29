import { describe, expect, it } from 'vitest'
import type { CafeRecordCount, CafeRecordLog } from '@/lib/db/cafe-records'
import type { CafeReceipt } from '@/lib/db/cafe-receipts'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { formatDec } from './decimal'
import {
  buildDayRows, buildEntries, filterEntries, groupDayPage, pageSummary, paginate, sortDayRows, sortEntries, sortSummaryRows, summarize,
  type BuildContext, type RecordEntry,
} from './model'

const B1 = 'b1b1b1b1-0000-4000-8000-000000000001'
const B2 = 'b2b2b2b2-0000-4000-8000-000000000002'
const STREAM = `${B1}:kitchen`
const UNITS: Record<string, string> = { u1: 'Batch', u2: 'GR', u3: 'Batch' }
const ITEMS: Record<string, string> = { i1: 'Pickled onion', i2: 'Aioli', i3: 'Milk' }

const ctx: BuildContext = {
  itemName: (id, stream) => stream === STREAM ? ITEMS[id] ?? null : null,
  unitName: id => UNITS[id] ?? null,
  receiptItem: (unit, stream) => (stream === STREAM && unit === 'u1' ? { id: 'i1', name: 'Pickled onion' } : null),
  wibDateOf: ts => new Date(new Date(ts).getTime() + 7 * 3600_000).toISOString().slice(0, 10),
}

let n = 0
function log(over: Partial<CafeRecordLog> = {}): CafeRecordLog {
  n += 1
  return {
    id: `log${String(n).padStart(3, '0')}`, batch_id: null, log_date: '2026-10-14', branch_id: B1, activity: 'kitchen', action: 'produce',
    action_label: 'Production', destination_branch_id: null, production_location_id: null, from_storage_location_id: null, to_storage_location_id: null, wip_item_id: 'i1', item_unit_id: 'u1', qty_porsi: 10, entry_quantity: null,
    entry_unit_factor: null, entry_unit_name: null, notes: null, status: 'Approved', submitted_by: 'p1', created_at: `2026-10-14T03:00:0${n % 10}.000000+00:00`,
    updated_at: '2026-10-14T03:00:00+00:00', reviewed_by: null, reviewed_at: null, review_note: null, posted_to_esb: false, posted_at: null,
    esb_doc_num: null, superseded_by: null, item_name: 'Pickled onion (ERP)', ...over,
  }
}
function count(over: Partial<CafeRecordCount> = {}): CafeRecordCount {
  n += 1
  return {
    id: `cnt${String(n).padStart(3, '0')}`, branch_id: B1, activity: 'kitchen', count_date: '2026-10-14', wip_item_id: 'i1', item_name: 'Pickled onion',
    item_category: null, item_kind: 'WIP', item_unit_id: 'u1', unit_name: 'Batch', counted_quantity: 4, status: 'Confirmed', posting_status: 'not_needed',
    submitted_by: 'p-count', submitted_at: `2026-10-14T05:00:0${n % 10}+00:00`, reviewed_at: null, row_version: 1, ...over,
  }
}
function receipt(over: Partial<CafeReceipt> = {}, lines: CafeReceipt['lines'] = []): CafeReceipt {
  n += 1
  return {
    id: `rcp${n}`, branch_id: B1, activity: 'kitchen', arrival_date: '2026-10-14', delivery_note_number: null, status: 'Approved', posting_status: 'not_posted',
    posting_hold_reason: null, received_by: 'p2', received_at: '2026-10-14T02:00:00+00:00', submitted_at: null, reviewed_by: null, reviewed_at: null,
    review_note: null, row_version: 1, lines, posting: null, ...over,
  }
}
const rline = (id: string, over: Partial<CafeReceipt['lines'][number]> = {}) => ({
  id, item_unit_id: 'u1', item_name: 'Pickled onion', item_category: null, unit_name: 'Batch', received_quantity: '3', conditions: [], condition_reason: null,
  condition_updated_at: null, po_created_after_delivery: false, photos: [], ...over,
}) as CafeReceipt['lines'][number]
function request(over: Partial<CafePurchaseRequest> = {}, lines: CafePurchaseRequest['lines'] = []): CafePurchaseRequest {
  n += 1
  return {
    id: `req${n}`, branch_id: B1, activity: 'kitchen', required_by: '2026-10-20', note: null, status: 'Submitted', requested_by: 'p3',
    requested_at: '2026-10-14T01:00:00+00:00', reviewed_by: null, reviewed_at: null, review_note: null, row_version: 1, lines, ...over,
  }
}

const entriesOf = (rows: Parameters<typeof buildEntries>[0]) => buildEntries(rows, ctx)
const ok = { logs: true, counts: true }

describe('unit identity', () => {
  it('keeps unlike units on separate rows and sums only the same unit id', () => {
    const entries = entriesOf({ logs: [log({ qty_porsi: 10 }), log({ qty_porsi: 5 }), log({ item_unit_id: 'u2', qty_porsi: 700 })] })
    const [group] = summarize(entries, 'made')
    expect(group.rows).toHaveLength(2)
    const batch = group.rows.find(r => r.unit.name === 'Batch')!
    expect(formatDec(batch.qty!)).toBe('15')
    expect(batch.entries).toBe(2)
    expect(formatDec(group.rows.find(r => r.unit.name === 'GR')!.qty!)).toBe('700')
  })

  it('two units that merely share a label are different units (different ids)', () => {
    const entries = entriesOf({ logs: [log({ item_unit_id: 'u1' }), log({ item_unit_id: 'u3' })] })
    expect(summarize(entries, 'made')[0].rows).toHaveLength(2)
  })

  it('groups distinct entered factors separately and never converts through today\'s default unit', () => {
    const entries = entriesOf({ logs: [
      log({ qty_porsi: 50, entry_quantity: 1, entry_unit_factor: 50, entry_unit_name: 'Batch @50porsi' }),
      log({ qty_porsi: 100, entry_quantity: 2, entry_unit_factor: 50, entry_unit_name: 'Batch @50porsi' }),
      log({ qty_porsi: 25, entry_quantity: 1, entry_unit_factor: 25, entry_unit_name: 'Pack @25' }),
      log({ qty_porsi: 7 }),
    ] })
    const rows = summarize(entries, 'made')[0].rows
    expect(rows).toHaveLength(3)
    expect(formatDec(rows.find(r => r.unit.name === 'Batch @50porsi')!.qty!)).toBe('3')
    expect(formatDec(rows.find(r => r.unit.name === 'Pack @25')!.qty!)).toBe('1')
    expect(formatDec(rows.find(r => r.unit.name === 'Batch')!.qty!)).toBe('7')
  })

  it('keeps fractional entered factors in the fallback unit label', () => {
    const [entry] = entriesOf({ logs: [log({ entry_quantity: 2, entry_unit_factor: 1.5, entry_unit_name: null })] })

    expect(entry.unit.name).toBe('Batch ×1,5')
  })

  it('an unknown historical unit is its own unsummable row, never merged', () => {
    const entries = entriesOf({ logs: [log({ item_unit_id: null, qty_porsi: 4 }), log({ item_unit_id: null, qty_porsi: 6 })] })
    const rows = summarize(entries, 'made')[0].rows
    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.unit.unsummable && r.unit.name === null)).toBe(true)
  })
})

describe('status groups', () => {
  it('keeps pending, approved and rejected apart with their own entry counts', () => {
    const entries = entriesOf({ logs: [
      log({ status: 'Submitted', qty_porsi: 2 }), log({ status: 'Approved', qty_porsi: 10 }), log({ status: 'Approved', qty_porsi: 5 }), log({ status: 'Rejected', qty_porsi: 99 }),
    ] })
    const groups = summarize(entries, 'made')
    expect(groups.map(g => g.status)).toEqual(['pending', 'approved', 'rejected'])
    expect(groups.map(g => [formatDec(g.rows[0].qty!), g.rows[0].entries])).toEqual([['2', 1], ['15', 2], ['99', 1]])
  })

  it('outlet sends are separate from transfers and waste in Records', () => {
    const entries = entriesOf({ logs: [log({ action: 'outlet_send', destination_branch_id: null, qty_porsi: 4 })] })
    expect(entries[0]).toMatchObject({ movement: 'sent', destinationKey: null })
    expect(summarize(entries, 'transferred')).toEqual([])
    expect(summarize(entries, 'wasted')).toEqual([])
    expect(summarize(entries, 'sent')[0].rows[0].entries).toBe(1)
  })

  it('transfers are grouped per destination and carry it on the row', () => {
    const entries = entriesOf({ logs: [log({ action: 'transfer', destination_branch_id: B2, qty_porsi: 3 }), log({ action: 'transfer', destination_branch_id: B1, qty_porsi: 4 })] })
    const rows = summarize(entries, 'transferred')[0].rows
    expect(rows.map(r => r.destinationKey).sort()).toEqual([B1, B2].sort())
  })

  it('waste: approved first, pending and rejected separately; Draft is never in the data', () => {
    const entries = entriesOf({ logs: [log({ action: 'waste', status: 'Submitted', qty_porsi: 1 }), log({ action: 'waste', status: 'Approved', qty_porsi: 2 })] })
    expect(summarize(entries, 'wasted').map(g => g.status)).toEqual(['approved', 'pending'])
  })

  it('received: Counted, Submitted and Approved are separate, Rejected separate again', () => {
    const entries = entriesOf({ receipts: [
      receipt({ status: 'Counted' }, [rline('a')]), receipt({ status: 'Submitted' }, [rline('b')]), receipt({ status: 'Approved' }, [rline('c')]), receipt({ status: 'Rejected' }, [rline('d')]),
    ] })
    expect(summarize(entries, 'received').map(g => g.status)).toEqual(['locked', 'pending', 'approved', 'rejected'])
  })

  it('everything never adds across sources: one group per movement and status', () => {
    const entries = entriesOf({ logs: [log({ qty_porsi: 10 }), log({ action: 'waste', qty_porsi: 2 })], counts: [count()], requests: [request({}, [{ id: 'rl1', item_name: 'Milk', item_category: null, unit_name: 'L', quantity: '5' }])] })
    const groups = summarize(entries, 'everything')
    expect(groups.map(g => g.key)).toEqual(['made:approved', 'wasted:approved', 'requested:pending', 'counted:confirmed'])
  })
})

describe('Counts', () => {
  it('uses the recount as the Records quantity and preserves zero', () => {
    const entries = entriesOf({ counts: [
      count({ counted_quantity: 7, recounted_quantity: 0 }),
      count({ counted_quantity: 5, recounted_quantity: null }),
    ] })

    expect(entries.map(entry => formatDec(entry.qty!))).toEqual(['0', '5'])
  })

  it('shows the latest observation, never a sum of repeated Counts, with its date', () => {
    const entries = entriesOf({ counts: [
      count({ counted_quantity: 8, count_date: '2026-10-12', submitted_at: '2026-10-12T05:00:00+00:00' }),
      count({ counted_quantity: 5, count_date: '2026-10-14', submitted_at: '2026-10-14T05:00:00+00:00' }),
      count({ counted_quantity: 6, count_date: '2026-10-14', submitted_at: '2026-10-14T09:00:00+00:00' }),
    ] })
    const row = summarize(entries, 'counted')[0].rows[0]
    expect(formatDec(row.qty!)).toBe('6')
    expect(row.entries).toBe(3)
    expect(row.latestDate).toBe('2026-10-14')
  })

  it('uses the stored submitter and leaves a missing submitter unavailable', () => {
    expect(entriesOf({ counts: [count()] })[0].personId).toBe('p-count')
    expect(entriesOf({ counts: [count({ submitted_by: null })] })[0].personId).toBeNull()
  })
})

describe('requests use stored item and unit ids, receipts resolve only through exact unit ids', () => {
  it('links a request through its stored item id, but never infers a link from its name', () => {
    const matchingLog = log({ wip_item_id: 'i3', item_name: 'Milk' })
    const entries = entriesOf({ logs: [matchingLog], requests: [request({}, [
      { id: 'rl1', wip_item_id: 'i3', item_unit_id: 'u2', item_name: 'Milk', item_category: null, unit_name: 'GR', quantity: '2' },
      { id: 'rl2', item_name: 'Milk', item_category: null, unit_name: 'Batch', quantity: '3' },
    ])] })
    const linked = entries.find(e => e.key === 'request:rl1')!
    const nameOnly = entries.find(e => e.key === 'request:rl2')!
    expect(linked.itemKey).toBe('i3')
    expect(linked.unit).toMatchObject({ key: 'u2', name: 'GR' })
    expect(nameOnly.itemKey).toBe('request-name:Milk')
    expect(filterEntries(entries, { question: 'everything', q: '', item: 'i3', destination: '' }).map(entry => entry.key)).toEqual([`log:${matchingLog.id}`, 'request:rl1'])
  })

  it('a receipt line maps to an item only where the item settings expose that exact unit id', () => {
    const entries = entriesOf({ receipts: [receipt({}, [rline('a', { item_unit_id: 'u1' }), rline('b', { item_unit_id: 'zz', item_name: 'Mystery' })])] })
    expect(entries.map(e => e.itemKey)).toEqual(['i1', 'receipt-unit:zz'])
  })

  it('request dates are the WIB date of requested_at, not the needed-by date', () => {
    const e = entriesOf({ requests: [request({ requested_at: '2026-10-13T18:30:00+00:00', required_by: '2026-10-30' }, [{ id: 'rl', item_name: 'X', item_category: null, unit_name: 'kg', quantity: '1' }])] })[0]
    expect(e.date).toBe('2026-10-14')
  })

  it('de-duplicates a row seen twice across a cursor overlap', () => {
    const l = log()
    expect(entriesOf({ logs: [l, l] })).toHaveLength(1)
  })
})

describe('day summary basis', () => {
  it('made and transferred = pending + approved, waste = approved only, Count = latest Confirmed', () => {
    const entries = entriesOf({
      logs: [
        log({ status: 'Submitted', qty_porsi: 2 }), log({ status: 'Approved', qty_porsi: 10 }), log({ status: 'Rejected', qty_porsi: 100 }),
        log({ action: 'transfer', destination_branch_id: B2, status: 'Submitted', qty_porsi: 3 }),
        log({ action: 'waste', status: 'Submitted', qty_porsi: 50 }), log({ action: 'waste', status: 'Approved', qty_porsi: 1 }),
      ],
      counts: [count({ counted_quantity: 9, status: 'Submitted' }), count({ counted_quantity: 4, status: 'Confirmed', submitted_at: '2026-10-14T05:00:00+00:00' }), count({ counted_quantity: 7, status: 'Confirmed', submitted_at: '2026-10-14T08:00:00+00:00' })],
    })
    const [row] = buildDayRows(entries, 'everything', ok)
    expect(formatDec(row.cells.made.value!)).toBe('12')
    expect(formatDec(row.cells.transferred.value!)).toBe('3')
    expect(formatDec(row.cells.wasted.value!)).toBe('1')
    expect(formatDec(row.cells.counted.value!)).toBe('7')
  })

  it('a missing Confirmed Count is a dash, never zero; a counted zero stays 0; no movement on an existing row is 0', () => {
    const noCount = buildDayRows(entriesOf({ logs: [log({ qty_porsi: 3 })] }), 'everything', ok)[0]
    expect(noCount.cells.counted.value).toBeNull()
    expect(noCount.cells.counted.reason).toBeNull()
    expect(formatDec(noCount.cells.wasted.value!)).toBe('0')
    const zero = buildDayRows(entriesOf({ counts: [count({ counted_quantity: 0 })] }), 'everything', ok)[0]
    expect(formatDec(zero.cells.counted.value!)).toBe('0')
  })

  it('a failed source reads as a dash with a reason, not as zero or a smaller total', () => {
    const entries = entriesOf({ logs: [log({ qty_porsi: 3 })], counts: [count()] })
    const [row] = buildDayRows(entries, 'everything', { logs: false, counts: true })
    expect(row.cells.made).toMatchObject({ value: null, reason: 'source' })
    expect(row.cells.wasted).toMatchObject({ value: null, reason: 'source' })
    expect(formatDec(row.cells.counted.value!)).toBe('4')
  })

  it('a question selects rows by its source but keeps all four columns', () => {
    const entries = entriesOf({ logs: [log({ wip_item_id: 'i1' }), log({ wip_item_id: 'i2', action: 'waste' })] })
    const rows = buildDayRows(entries, 'wasted', ok)
    expect(rows).toHaveLength(1)
    expect(rows[0].itemKey).toBe('i2')
    expect(formatDec(rows[0].cells.made.value!)).toBe('0')
  })

  it('unlike units on one day are separate rows', () => {
    const rows = buildDayRows(entriesOf({ logs: [log({ item_unit_id: 'u1' }), log({ item_unit_id: 'u2' })] }), 'everything', ok)
    expect(rows).toHaveLength(2)
  })

  it('requested has nothing resolvable to an item, so the day summary has no rows for it', () => {
    const entries = entriesOf({ requests: [request({}, [{ id: 'rl', item_name: 'X', item_category: null, unit_name: 'kg', quantity: '1' }])] })
    expect(buildDayRows(entries, 'requested', ok)).toEqual([])
  })

  it('days are newest first with items A–Z inside, and pages keep a day group that spans a page', () => {
    const entries = entriesOf({ logs: [
      log({ wip_item_id: 'i2', log_date: '2026-10-13' }), log({ wip_item_id: 'i1', log_date: '2026-10-14' }), log({ wip_item_id: 'i3', log_date: '2026-10-14' }), log({ wip_item_id: 'i2', log_date: '2026-10-14' }),
    ] })
    const rows = sortDayRows(buildDayRows(entries, 'everything', ok), 'asc')
    expect(rows.map(r => `${r.date}:${r.itemName}`)).toEqual(['2026-10-14:Aioli', '2026-10-14:Milk', '2026-10-14:Pickled onion', '2026-10-13:Aioli'])
    const page2 = paginate(rows, 2, 2)
    const groups = groupDayPage(rows, page2.slice, page2.start)
    expect(groups[0]).toMatchObject({ date: '2026-10-14', continued: true, total: 3 })
    expect(groups[1].date).toBe('2026-10-13')
  })
})

describe('filters, sorting and paging', () => {
  const entries = entriesOf({ logs: [
    log({ wip_item_id: 'i1', qty_porsi: 5, log_date: '2026-10-10' }), log({ wip_item_id: 'i2', qty_porsi: 50, log_date: '2026-10-12' }), log({ wip_item_id: 'i3', action: 'transfer', destination_branch_id: B2, qty_porsi: 2 }),
    log({ wip_item_id: 'i2', item_unit_id: 'u2', qty_porsi: 3 }),
  ] })

  it('search is by item name only', () => {
    expect(filterEntries(entries, { question: 'everything', q: 'aio', item: '', destination: '' }).every(e => e.itemName === 'Aioli')).toBe(true)
    expect(filterEntries(entries, { question: 'everything', q: 'p1', item: '', destination: '' })).toHaveLength(0)
  })

  it('filters by destination and question', () => {
    expect(filterEntries(entries, { question: 'transferred', q: '', item: '', destination: B2 })).toHaveLength(1)
    expect(filterEntries(entries, { question: 'wasted', q: '', item: '', destination: '' })).toHaveLength(0)
  })

  it('sorts quantity inside fixed unit groups: unlike units never compare', () => {
    const rows = summarize(entries.filter(e => e.movement === 'made'), 'made')[0].rows
    const sorted = sortSummaryRows(rows, 'quantity', 'desc', { streamLabel: k => k, destinationLabel: () => '' })
    // Batch rows first (A before G), larger first inside; the GR row (3) is not interleaved by size.
    expect(sorted.map(r => `${r.unit.name}:${formatDec(r.qty!)}`)).toEqual(['Batch:50', 'Batch:5', 'GR:3'])
  })

  it('entries default to date descending then source/id, and sort by item or quantity within unit', () => {
    const byDate = sortEntries(entries, 'date', 'desc')
    expect(byDate[0].date >= byDate.at(-1)!.date).toBe(true)
    expect(sortEntries(entries, 'item', 'asc')[0].itemName).toBe('Aioli')
  })

  it('pages hold 50 rows and clamp an out-of-range page', () => {
    const many = Array.from({ length: 51 }, (_, i) => i)
    expect(paginate(many, 1).slice).toHaveLength(50)
    expect(paginate(many, 2).slice).toEqual([50])
    expect(paginate(many, 9).slice).toEqual([50])
    expect(paginate(many, 1).pages).toBe(2)
  })
})

describe('account isolation', () => {
  it('builds only from the rows it is given: nothing a read did not return can appear', () => {
    const none = entriesOf({ receipts: [], requests: [] })
    expect(none).toEqual([])
    const e: RecordEntry[] = entriesOf({ requests: [request({ requested_by: 'someone-else' }, [])] })
    expect(e).toEqual([])
  })
})

describe('paged summary', () => {
  it('pages 50 rows across status groups and marks a group that continues from the previous page', () => {
    const logs = Array.from({ length: 70 }, (_, i) => log({ wip_item_id: `item${String(i).padStart(3, '0')}`, status: i < 40 ? 'Approved' : 'Submitted', item_name: `Item ${String(i).padStart(3, '0')}` }))
    const groups = summarize(entriesOf({ logs }), 'made')
    const ctx2 = { streamLabel: (k: string) => k, destinationLabel: () => '' }
    const first = pageSummary(groups, 'item', 'asc', ctx2, 1)
    const second = pageSummary(groups, 'item', 'asc', ctx2, 2)
    expect(first.totalRows).toBe(70)
    expect(first.pages).toBe(2)
    expect(first.groups.map(g => [g.status, g.rows.length, g.total, g.continued])).toEqual([['pending', 30, 30, false], ['approved', 20, 40, false]])
    expect(second.groups.map(g => [g.status, g.rows.length, g.continued])).toEqual([['approved', 20, true]])
  })
})
