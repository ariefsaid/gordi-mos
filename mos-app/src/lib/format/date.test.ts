// Cohesion-debt 2026-07-19, item #1 (Format unification): ONE locale-aware date
// module. Before this, three copies hardcoded en-GB regardless of the user's
// locale (wib-time, plan-budget shortDate) while task-formatters was locale-aware
// — one date grammar, three implementations. This locks the canonical output and
// the locale seam (a param, falling back to the non-React readPersistedLocale()).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatWeekdayDayMonth, formatDayMonthYear, formatWibDateTime, dateLocaleTag, formatWibWeekdayTime } from './date'

afterEach(() => vi.unstubAllEnvs())

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
    vi.stubEnv('TZ', 'UTC')
    expect(formatDayMonthYear('2026-06-12T03:00:00Z')).toBe('12 Jun 2026')
  })
  it('is locale-aware via the param (id)', () => {
    vi.stubEnv('TZ', 'UTC')
    expect(formatDayMonthYear('2026-06-12T03:00:00Z', 'id')).toBe('12 Jun 2026')
  })
  it('returns the raw input for an unparseable date', () => {
    expect(formatDayMonthYear('nope')).toBe('nope')
  })

  it('keeps a date-only ISO value on its calendar day in a western device zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatDayMonthYear('2026-10-05', 'en')).toBe('5 Oct 2026')
    expect(formatDayMonthYear('2026-10-05', 'id')).toBe('5 Okt 2026')
  })

  it('keeps timestamp formatting in the device zone', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatDayMonthYear('2026-10-05T01:30:00Z', 'en')).toBe('4 Oct 2026')
    expect(formatDayMonthYear('2026-10-05T01:30:00Z', 'id')).toBe('4 Okt 2026')
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

describe('dateLocaleTag — the app Locale → BCP-47 seam', () => {
  it('maps id to id-ID and en to en-GB', () => {
    expect(dateLocaleTag('id')).toBe('id-ID')
    expect(dateLocaleTag('en')).toBe('en-GB')
  })
})

describe('formatWibWeekdayTime — a sync time in the same style as the reporting day', () => {
  it('reads the Jakarta wall clock with the weekday: 19:05 UTC on Mon 5 Oct is Tue 6 Oct, 02:05', () => {
    expect(formatWibWeekdayTime('2026-10-05T19:05:00Z', 'en')).toBe('Tue 6 Oct, 02:05')
    expect(formatWibWeekdayTime('2026-10-05T19:05:00Z', 'id')).toBe('Sel, 6 Okt, 02:05')
  })
})
