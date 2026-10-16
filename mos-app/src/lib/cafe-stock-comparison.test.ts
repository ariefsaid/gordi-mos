import { describe, expect, it } from 'vitest'
import { formatDec, parseDecimal } from '@/lib/cafe-records/decimal'
import {
  buildRows, compareAbsRatio, compareRow, countAgeHours, filterRows, formatPercent, formatSigned, latestCounts, pickLatestCount, sectionsOf, sortRows,
  type CountLine, type CountObservation, type ExpectedSide, type ItemIdentity,
} from './cafe-stock-comparison'

const NOW = new Date('2026-10-15T08:00:00+07:00')
const dec = (value: string) => parseDecimal(value)!

const id = (n: number, unit = 'u-kg', name = 'KG'): ItemIdentity => ({ itemId: `item-${String(n).padStart(2, '0')}`, itemName: `Item ${n}`, kind: 'RAW', category: 'Dry goods', unitId: unit, unitName: name })
const obs = (quantity: string, overrides: Partial<CountObservation> = {}): CountObservation => ({
  id: 'c1', quantity: dec(quantity), unitId: 'u-kg', unitName: 'KG', countDate: '2026-10-14', submittedAt: '2026-10-14T14:00:00Z', status: 'Confirmed', ...overrides,
})
const esb = (quantity: string, overrides: Partial<Extract<ExpectedSide, { kind: 'value' }>['value']> = {}): ExpectedSide => ({
  kind: 'value', value: { quantity: dec(quantity), unitId: 'u-kg', unitName: 'KG', asOf: '2026-10-14T23:59:00+07:00', businessDate: '2026-10-14', basis: 'end_of_day', complete: true, ...overrides },
})
const row = (n: number, count: CountObservation | null, expected: ExpectedSide, identity = id(n)) => compareRow({ identity, count, expected, now: NOW })

describe('difference and percent', () => {
  it('is Count minus expected, exact, with percent of the absolute expected', () => {
    const shortage = row(1, obs('112'), esb('120'))
    expect(shortage.difference).toBe(dec('-8'))
    expect(formatSigned(shortage.difference!)).toBe('-8')
    expect(formatPercent(shortage.percent!)).toBe('-6,67%')
    expect(shortage.flags).toContain('shortage')
    const surplus = row(2, obs('21'), esb('18.5'))
    expect(formatSigned(surplus.difference!)).toBe('+2,5')
    expect(surplus.flags).toContain('surplus')
  })

  it('keeps full precision: a tiny gap is not rounded away or read as zero', () => {
    const tiny = row(1, obs('45.3'), esb('45.333333333'))
    expect(formatDec(tiny.difference!)).toBe('-0,033333333')
    expect(tiny.bucket).toBe('gap')
    expect(formatPercent(row(1, obs('1000000.000000001'), esb('1000000')).percent!)).toBe('+<0,01%')
  })

  it('preserves a negative ESB quantity and divides by its absolute value', () => {
    const negative = row(1, obs('4'), esb('-2'))
    expect(formatSigned(negative.difference!)).toBe('+6')
    expect(formatPercent(negative.percent!)).toBe('+300%')
  })

  it('never divides by a zero expected: nonzero Count is "Zero expected", zero Count is 0%', () => {
    const nonzero = row(1, obs('3.5'), esb('0'))
    expect(nonzero.percent).toBeNull()
    expect(nonzero.zeroExpected).toBe(true)
    expect(nonzero.flags).toEqual(expect.arrayContaining(['zero_expected', 'surplus']))
    const zero = row(2, obs('0'), esb('0'))
    expect(zero.percent).toBe(0n)
    expect(zero.zeroExpected).toBe(false)
    expect(zero.bucket).toBe('zero')
    expect(zero.flags).toContain('no_difference')
  })

  it('compares absolute ratios exactly without dividing', () => {
    expect(compareAbsRatio(dec('1'), dec('3'), dec('1'), dec('3'))).toBe(0)
    expect(compareAbsRatio(dec('1'), dec('3'), dec('1'), dec('4'))).toBe(1)
    expect(compareAbsRatio(dec('-2'), dec('-8'), dec('1'), dec('3'))).toBe(-1)
  })
})

describe('what is never compared', () => {
  it('leaves the gap blank (not zero) when ESB is not connected, with the shared reason', () => {
    const blank = row(1, obs('5'), { kind: 'not_connected' })
    expect(blank.difference).toBeNull()
    expect(blank.percent).toBeNull()
    expect(blank.missing).toBe('not_connected')
    expect(blank.bucket).toBe('unknown')
    expect(blank.flags).toEqual([])
  })

  it('treats a missing Count as Not counted, never as zero', () => {
    const none = row(1, null, esb('6'))
    expect(none.difference).toBeNull()
    expect(none.missing).toBe('not_counted')
    expect(none.flags).toContain('not_counted')
    expect(none.bucket).toBe('unknown')
  })

  it('blanks a partial snapshot row and an unmapped row', () => {
    const partial = row(1, obs('11.5'), esb('12', { complete: false }))
    expect(partial.difference).toBeNull()
    expect(partial.missing).toBe('partial')
    expect(partial.flags).toContain('partial')
    const unmapped = row(2, obs('3'), { kind: 'mapping_needed' })
    expect(unmapped.missing).toBe('mapping_needed')
    expect(unmapped.flags).toContain('mapping_needed')
  })

  it('blanks a unit mismatch even when the unit names read the same, keeping both sources', () => {
    const mismatch = row(1, obs('5'), esb('8', { unitId: 'u-other', unitName: 'KG' }))
    expect(mismatch.difference).toBeNull()
    expect(mismatch.missing).toBe('unit_mismatch')
    expect(mismatch.flags).toContain('unit_mismatch')
    expect(mismatch.expected?.unitName).toBe('KG')
    expect(mismatch.count?.unitName).toBe('KG')
  })

  it('does not compare a Count recorded with no unit', () => {
    const unknown = compareRow({ identity: id(1, ''), count: obs('5', { unitId: '' }), expected: esb('8'), now: NOW })
    expect(unknown.difference).toBeNull()
    expect(unknown.flags).toContain('unit_mismatch')
  })
})

describe('validity and flags', () => {
  it('marks different dates and an intraday snapshot as indicative, even when the values are equal', () => {
    const differentDay = row(1, obs('240', { countDate: '2026-10-15' }), esb('240'))
    expect(differentDay.difference).toBe(0n)
    expect(differentDay.indicative).toBe(true)
    expect(differentDay.flags).toEqual(expect.arrayContaining(['no_difference', 'different_times']))
    const intraday = row(2, obs('5', { countDate: '2026-10-14' }), esb('7', { basis: 'intraday' }))
    expect(intraday.indicative).toBe(true)
    expect(row(3, obs('5'), esb('7')).indicative).toBe(false)
  })

  it('flags a Submitted Count as pending confirmation', () => {
    expect(row(1, obs('5', { status: 'Submitted' }), esb('7')).flags).toContain('pending_confirmation')
    expect(row(1, obs('5'), esb('7')).flags).not.toContain('pending_confirmation')
  })

  it('flags an ESB snapshot older than 24 hours, and a Count older than 24 hours since its date ended (WIB)', () => {
    expect(row(1, obs('5'), esb('7', { asOf: '2026-10-13T20:00:00+07:00' })).flags).toContain('stale_esb')
    expect(row(1, obs('5'), esb('7', { asOf: '2026-10-14T23:59:00+07:00' })).flags).not.toContain('stale_esb')
    expect(countAgeHours('2026-10-14', NOW)).toBeCloseTo(8, 5)
    expect(row(1, obs('5', { countDate: '2026-10-12' }), esb('7')).flags).toContain('old_count')
    expect(row(1, obs('5', { countDate: '2026-10-14' }), esb('7')).flags).not.toContain('old_count')
  })
})

const line = (overrides: Partial<CountLine>): CountLine => ({
  id: 'l1', wip_item_id: 'item-01', item_name: 'Item 1', item_category: 'Dry goods', item_kind: 'RAW', item_unit_id: 'u-kg', unit_name: 'KG',
  counted_quantity: '5', count_date: '2026-10-14', submitted_at: '2026-10-14T10:00:00Z', status: 'Confirmed', ...overrides,
})

describe('latest Count', () => {
  it('orders by Count date, then submitted time, then id; never sums', () => {
    const picked = pickLatestCount([
      obs('1', { id: 'a', countDate: '2026-10-13', submittedAt: '2026-10-13T20:00:00Z' }),
      obs('2', { id: 'b', countDate: '2026-10-14', submittedAt: '2026-10-14T09:00:00Z' }),
      obs('3', { id: 'c', countDate: '2026-10-14', submittedAt: '2026-10-14T09:00:00Z' }),
    ])
    expect(picked?.id).toBe('c')
    expect(picked?.quantity).toBe(dec('3'))
  })

  it('picks a newer Submitted Count over an older Confirmed one and ignores Rejected', () => {
    const latest = latestCounts([
      line({ id: 'old', status: 'Confirmed', count_date: '2026-10-12', counted_quantity: '10' }),
      line({ id: 'new', status: 'Submitted', count_date: '2026-10-14', counted_quantity: '4' }),
      line({ id: 'bad', status: 'Rejected', count_date: '2026-10-15', counted_quantity: '99' }),
    ])
    expect(latest.get('item-01:u-kg')?.count).toMatchObject({ id: 'new', status: 'Submitted' })
  })

  it('keeps a genuine zero Count distinct from no Count', () => {
    const rows = buildRows({
      items: [id(1), id(2)],
      counts: latestCounts([line({ wip_item_id: 'item-01', counted_quantity: '0' })]),
      expectedFor: () => ({ kind: 'not_connected' }),
      now: NOW,
    })
    expect(rows.find((r) => r.itemId === 'item-01')?.count?.quantity).toBe(0n)
    expect(rows.find((r) => r.itemId === 'item-02')?.count).toBeNull()
  })

  it('keeps an item that has Counts but is no longer countable, and one row per exact unit', () => {
    const rows = buildRows({
      items: [id(1)],
      counts: latestCounts([
        line({ wip_item_id: 'item-09', item_name: 'Retired item', item_unit_id: 'u-kg' }),
        line({ wip_item_id: 'item-01', item_unit_id: 'u-old', unit_name: 'Karung' }),
      ]),
      expectedFor: () => ({ kind: 'not_connected' }),
      now: NOW,
    })
    expect(rows.map((r) => r.key).sort()).toEqual(['item-01:u-kg', 'item-01:u-old', 'item-09:u-kg'])
    expect(rows.find((r) => r.itemId === 'item-09')?.itemName).toBe('Retired item')
  })
})

describe('sorting and filtering the whole scope', () => {
  const rows = [
    row(1, obs('112'), esb('120')), //  -6.67%
    row(2, obs('21'), esb('18.5')), //  +13.51%
    row(3, obs('24'), esb('24')), //     zero
    row(4, obs('3.5'), esb('0')), //     zero expected
    row(5, null, esb('6')), //           needs data
    row(6, obs('4'), esb('-2')), //      +300%
    row(7, obs('5'), esb('8', { unitId: 'u-x' })), // needs data (unit)
    row(8, obs('1'), esb('4')), //       -75%
  ]

  it('Biggest gap: zero-expected first, then abs percent descending, Needs data after, zero gaps last', () => {
    const order = sortRows(rows, 'gap', 'desc').map((r) => r.itemId)
    expect(order).toEqual(['item-04', 'item-06', 'item-08', 'item-02', 'item-01', 'item-05', 'item-07', 'item-03'])
  })

  it('keeps the sections when the direction flips; only the order inside the gaps flips', () => {
    const order = sortRows(rows, 'gap', 'asc').map((r) => r.itemId)
    expect(order).toEqual(['item-01', 'item-02', 'item-08', 'item-06', 'item-04', 'item-05', 'item-07', 'item-03'])
  })

  it('breaks ties by Item A-Z then ids', () => {
    const tied = [row(2, obs('9'), esb('10')), row(1, obs('9'), esb('10'))]
    expect(sortRows(tied, 'gap', 'desc').map((r) => r.itemId)).toEqual(['item-01', 'item-02'])
  })

  it('Quantity gap groups by exact unit and never ranks kg against portions', () => {
    const mixed = [
      row(1, obs('100'), esb('90', { unitId: 'u-p', unitName: 'Porsi' }), id(1, 'u-p', 'Porsi')),
      row(2, obs('2'), esb('1')),
      row(3, obs('13'), esb('10')),
      row(4, obs('130'), esb('100', { unitId: 'u-p', unitName: 'Porsi' }), id(4, 'u-p', 'Porsi')),
      row(5, null, esb('3')),
    ]
    expect(sortRows(mixed, 'quantity', 'desc').map((r) => r.itemId)).toEqual(['item-03', 'item-02', 'item-04', 'item-01', 'item-05'])
  })

  it('sorts by item name and by latest Count date, unknown Counts last', () => {
    const dated = [row(2, obs('1', { countDate: '2026-10-10' }), esb('1')), row(1, obs('1', { countDate: '2026-10-14' }), esb('1')), row(3, null, esb('1'))]
    expect(sortRows(dated, 'count-date', 'desc').map((r) => r.itemId)).toEqual(['item-01', 'item-02', 'item-03'])
    expect(sortRows(dated, 'count-date', 'asc').map((r) => r.itemId)).toEqual(['item-02', 'item-01', 'item-03'])
    expect(sortRows(dated, 'item', 'desc').map((r) => r.itemId)).toEqual(['item-03', 'item-02', 'item-01'])
  })

  it('Only differences removes known exact-zero rows and nothing else', () => {
    const kept = filterRows(rows, { q: '', kind: 'all', category: 'all', differences: true }).map((r) => r.itemId)
    expect(kept).not.toContain('item-03')
    expect(kept).toEqual(expect.arrayContaining(['item-05', 'item-07']))
    expect(kept).toHaveLength(rows.length - 1)
  })

  it('filters by kind, category (including Uncategorised) and search', () => {
    const catalogue = [
      { ...row(1, obs('1'), esb('1')), kind: 'WIP' as const },
      { ...row(2, obs('1'), esb('1')), category: null },
      row(3, obs('1'), esb('1')),
    ]
    expect(filterRows(catalogue, { q: '', kind: 'WIP', category: 'all', differences: false }).map((r) => r.itemId)).toEqual(['item-01'])
    expect(filterRows(catalogue, { q: '', kind: 'all', category: 'none', differences: false }).map((r) => r.itemId)).toEqual(['item-02'])
    expect(filterRows(catalogue, { q: 'ITEM 3', kind: 'all', category: 'all', differences: false }).map((r) => r.itemId)).toEqual(['item-03'])
  })

  it('page sections count the whole scope and say when a section continues from the previous page', () => {
    const sorted = sortRows(rows, 'gap', 'desc')
    const first = sectionsOf(sorted, 0, 3)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ bucket: 'gap', total: 5, continued: false })
    const second = sectionsOf(sorted, 3, 8)
    expect(second.map((s) => [s.bucket, s.rows.length, s.continued])).toEqual([['gap', 2, true], ['unknown', 2, false], ['zero', 1, false]])
  })
})
