// reporting-shared.ts tests — TDD. Generic DAL helpers shared by reporting.ts
// (sales_daily_revenue) and reporting-margin.ts (sales_margin_daily), extracted per
// docs/reviews/feat-home-v1-margin.md §Follow-ups CQ-2/3.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { daysAgoIsoDate, latestBy } from './reporting-shared'

describe('daysAgoIsoDate', () => {
  afterEach(() => vi.useRealTimers())

  it('returns an ISO yyyy-mm-dd date `days` before today (UTC)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T12:00:00Z'))

    expect(daysAgoIsoDate(0)).toBe('2026-07-04')
    expect(daysAgoIsoDate(3)).toBe('2026-07-01')
  })

  it('crosses a month boundary correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))

    expect(daysAgoIsoDate(1)).toBe('2026-06-30')
  })
})

describe('latestBy', () => {
  interface Row {
    id: string
    at: string
  }

  it('returns the row field with the max value across rows', () => {
    const rows: Row[] = [
      { id: 'a', at: '2026-07-01T01:00:00Z' },
      { id: 'b', at: '2026-07-01T03:00:00Z' },
      { id: 'c', at: '2026-07-01T02:00:00Z' },
    ]
    expect(latestBy(rows, r => r.at)).toBe('2026-07-01T03:00:00Z')
  })

  it('returns null for an empty array', () => {
    expect(latestBy<Row>([], r => r.at)).toBeNull()
  })

  it('returns the single value for a one-row array', () => {
    expect(latestBy([{ id: 'a', at: '2026-06-30' }], r => r.at)).toBe('2026-06-30')
  })
})
