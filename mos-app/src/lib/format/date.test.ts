// Cohesion-debt 2026-07-19, item #1 (Format unification): ONE locale-aware date
// module. Before this, three copies hardcoded en-GB regardless of the user's
// locale (wib-time, plan-budget shortDate) while task-formatters was locale-aware
// — one date grammar, three implementations. This locks the canonical output and
// the locale seam (a param, falling back to the non-React readPersistedLocale()).
import { describe, expect, it } from 'vitest'
import { formatWeekdayDayMonth, formatDayMonthYear, formatWibDateTime, formatWibDayMonthTime, dateLocaleTag } from './date'

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
  it('is locale-aware via the param (id)', () => {
    expect(formatDayMonthYear('2026-06-12T03:00:00Z', 'id')).toBe('12 Jun 2026')
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

describe('formatWibDayMonthTime — `dd Mon HH:MM`, the Signal row meta time', () => {
  // #770 / DESIGN.md § Signal row (v4): the row's occurred fact is `dd Mon HH:MM` — no year, no
  // WIB suffix. 2026-09-04T18:46:00Z is 01:46 WIB on the 5th, the ticket's own sketch.
  it('renders the ticket sketch in en', () => {
    expect(formatWibDayMonthTime('2026-09-04T18:46:00Z', 'en')).toBe('05 Sept 01:46')
  })
  // The shape holds in Indonesian: the month name follows the locale, the "dd Mon HH:MM" skeleton
  // does not — id-ID's own time separator is ".", which is why the parts are joined by hand.
  it('keeps the shape in id (localised month, ":" between hour and minute)', () => {
    expect(formatWibDayMonthTime('2026-09-04T18:46:00Z', 'id')).toBe('05 Sep 01:46')
  })
  it('accepts a Date instance', () => {
    expect(formatWibDayMonthTime(new Date('2026-06-12T05:30:00Z'), 'en')).toBe('12 Jun 12:30')
  })
})

describe('dateLocaleTag — the app Locale → BCP-47 seam', () => {
  it('maps id to id-ID and en to en-GB', () => {
    expect(dateLocaleTag('id')).toBe('id-ID')
    expect(dateLocaleTag('en')).toBe('en-GB')
  })
})
