// format/date tests (cohesion-debt 2026-07-19, item #1). Locks the canonical basis-date
// output and the locale seam (a param, falling back to the non-React readPersistedLocale()).
//
// v4 carried two more shapes in this module — the weekday chip and the WIB timestamp — and
// this port deliberately leaves both where they live (see the scope note in ./date.ts), so
// their assertions are not carried here. That omission is stated, not silent.
import { describe, expect, it } from 'vitest'
import { formatDayMonthYear, dateLocaleTag } from './date'

describe('formatDayMonthYear — "12 Jun 2026" from an ISO timestamp', () => {
  it('formats en by default', () => {
    expect(formatDayMonthYear('2026-06-12T03:00:00Z')).toBe('12 Jun 2026')
  })
  it('is locale-aware via the param (id)', () => {
    expect(formatDayMonthYear('2026-06-12T03:00:00Z', 'id')).toBe('12 Jun 2026')
  })
  it('returns the raw input for an unparseable date', () => {
    expect(formatDayMonthYear('nope')).toBe('nope')
  })
})

describe('dateLocaleTag — the app Locale → BCP-47 seam', () => {
  it('maps id to id-ID and en to en-GB', () => {
    expect(dateLocaleTag('id')).toBe('id-ID')
    expect(dateLocaleTag('en')).toBe('en-GB')
  })
})
