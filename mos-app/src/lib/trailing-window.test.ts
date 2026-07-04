// trailing-window.ts selector tests — TDD. Generic version of the trailing-window
// behavior locked by sales-dashboard.test.ts (trailingWindow) and home-kpis.test.ts
// (trailingMargin) — this suite covers the shared implementation directly; those
// suites stay unmodified as the behavior lock for the two concrete callers.

import { describe, it, expect } from 'vitest'
import { isoDaysBefore, trailingSum } from './trailing-window'

interface Row {
  date: string
  value: number | null
}

function row(date: string, value: number | null): Row {
  return { date, value }
}

const dateOf = (r: Row) => r.date
const valueOf = (r: Row) => r.value ?? 0

describe('isoDaysBefore', () => {
  it('subtracts whole days from an ISO date, crossing month/year boundaries', () => {
    expect(isoDaysBefore('2026-07-01', 1)).toBe('2026-06-30')
    expect(isoDaysBefore('2026-01-01', 1)).toBe('2025-12-31')
  })

  it('returns the same date when days is 0', () => {
    expect(isoDaysBefore('2026-07-04', 0)).toBe('2026-07-04')
  })
})

describe('trailingSum', () => {
  it('sums values over the trailing window anchored to latestDate', () => {
    const rows = [
      row('2026-06-24', 1_000_000),
      row('2026-06-25', 1_000_000),
      row('2026-06-30', 2_000_000),
    ]
    const w = trailingSum(rows, dateOf, valueOf, '2026-06-30', 7)
    expect(w.current).toBe(4_000_000)
  })

  it('returns the prior equal-length window sum when prior rows exist', () => {
    const rows = [
      // prior window: 2026-06-16..2026-06-22 (days-7)
      row('2026-06-18', 500_000),
      // current window: 2026-06-24..2026-06-30
      row('2026-06-30', 2_000_000),
    ]
    const w = trailingSum(rows, dateOf, valueOf, '2026-06-30', 7)
    expect(w.prior).toBe(500_000)
  })

  it('returns prior=null when no rows exist in the prior window (not 0)', () => {
    const rows = [row('2026-06-30', 2_000_000)]
    const w = trailingSum(rows, dateOf, valueOf, '2026-06-30', 7)
    expect(w.prior).toBeNull()
  })

  it('rows outside both windows contribute nothing', () => {
    const rows = [
      row('2026-05-01', 999_999_999),
      row('2026-06-30', 1_000_000),
    ]
    const w = trailingSum(rows, dateOf, valueOf, '2026-06-30', 7)
    expect(w.current).toBe(1_000_000)
  })

  it('is generic over the value accessor — null-safe valueOf contributes 0', () => {
    const rows = [row('2026-06-29', null), row('2026-06-30', 1_000_000)]
    const w = trailingSum(rows, dateOf, valueOf, '2026-06-30', 7)
    expect(w.current).toBe(1_000_000)
  })
})
