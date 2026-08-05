// Cohesion-debt 2026-07-19, item #1 (Format unification): ONE locale-aware date
// module. Before this, three copies hardcoded en-GB regardless of the user's
// locale (wib-time, plan-budget shortDate) while task-formatters was locale-aware
// — one date grammar, three implementations. This locks the canonical output and
// the locale seam (a param, falling back to the non-React readPersistedLocale()).
import { describe, expect, it } from 'vitest'
import { formatWeekdayDayMonth, formatDayMonthYear, formatWibDateTime } from './date'

describe('formatWeekdayDayMonth — "Wed 12 Jun" from a YYYY-MM-DD date', () => {
  it('formats en (en-GB grammar) by default', () => {
    expect(formatWeekdayDayMonth('2026-06-10')).toBe('Wed 10 Jun')
  })
  it('is locale-aware via the param (id)', () => {
    expect(formatWeekdayDayMonth('2026-06-10', 'id')).toBe('Rab, 10 Jun')
  })
  it('returns the raw input for an unparseable date', () => {
    expect(formatWeekdayDayMonth('not-a-date')).toBe('not-a-date')
  })
})

describe('formatDayMonthYear — "12 Jun 2026" from an ISO timestamp', () => {
  it('formats en by default', () => {
    expect(formatDayMonthYear('2026-06-12T03:00:00Z')).toBe('12 Jun 2026')
  })
  it('returns the raw input for an unparseable date', () => {
    expect(formatDayMonthYear('nope')).toBe('nope')
  })
})

describe('formatWibDateTime — Asia/Jakarta wall clock with the WIB suffix', () => {
  it('renders "DD Mon YYYY, HH:MM WIB" in the Jakarta timezone', () => {
    // 2026-06-12T05:30:00Z is 12:30 WIB (UTC+7).
    expect(formatWibDateTime('2026-06-12T05:30:00Z')).toBe('12 Jun 2026, 12:30 WIB')
  })
  it('accepts a Date instance', () => {
    expect(formatWibDateTime(new Date('2026-06-12T05:30:00Z'))).toBe('12 Jun 2026, 12:30 WIB')
  })
})
