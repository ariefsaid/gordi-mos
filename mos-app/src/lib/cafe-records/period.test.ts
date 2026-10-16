import { describe, expect, it } from 'vitest'
import { addDays, datesIn, isIsoDate, isUnfinished, mondayOf, rangeError, resolvePreset, weekdayMondayFirst, wibInstantRange } from './period'

describe('Records periods (WIB calendar, Monday–Sunday weeks)', () => {
  it('knows real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('weeks start on Monday, including when today is Monday or Sunday', () => {
    expect(weekdayMondayFirst('2026-10-12')).toBe(0) // Monday
    expect(weekdayMondayFirst('2026-10-18')).toBe(6) // Sunday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12')
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
    expect(resolvePreset('this-week', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' })
    expect(resolvePreset('this-week', '2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-14' })
    expect(resolvePreset('this-week', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  it('last week is the previous full Monday–Sunday', () => {
    expect(resolvePreset('last-week', '2026-10-14')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(resolvePreset('last-week', '2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(resolvePreset('last-week', '2026-01-01')).toEqual({ from: '2025-12-22', to: '2025-12-28' })
  })

  it('months: this month ends today, last month crosses year and leap-day boundaries', () => {
    expect(resolvePreset('this-month', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-14' })
    expect(resolvePreset('last-month', '2026-10-14')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(resolvePreset('last-month', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(resolvePreset('last-month', '2024-03-01')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(resolvePreset('last-month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolvePreset('today', '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-14' })
  })

  it('arithmetic ignores the host time zone and DST', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01')
    expect(datesIn({ from: '2026-10-12', to: '2026-10-14' })).toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
  })

  it('validates a custom range: real dates, nothing in the future, start before end', () => {
    expect(rangeError('2026-10-01', '2026-10-14', '2026-10-14')).toBeNull()
    expect(rangeError('2026-10-14', '2026-10-14', '2026-10-14')).toBeNull()
    expect(rangeError('2026-10-15', '2026-10-15', '2026-10-14')).toBe('future')
    expect(rangeError('2026-10-10', '2026-10-09', '2026-10-14')).toBe('order')
    expect(rangeError('2026-13-01', '2026-10-09', '2026-10-14')).toBe('invalid')
    expect(rangeError('', '', '2026-10-14')).toBe('invalid')
  })

  it('says when a calendar period is unfinished (Through today)', () => {
    expect(isUnfinished('this-week', { from: '2026-10-12', to: '2026-10-14' }, '2026-10-14')).toBe(true)
    expect(isUnfinished('this-week', { from: '2026-10-12', to: '2026-10-18' }, '2026-10-18')).toBe(false)
    expect(isUnfinished('this-month', { from: '2026-10-01', to: '2026-10-14' }, '2026-10-14')).toBe(true)
    expect(isUnfinished('this-month', { from: '2026-10-01', to: '2026-10-31' }, '2026-10-31')).toBe(false)
    expect(isUnfinished('last-week', { from: '2026-10-05', to: '2026-10-11' }, '2026-10-14')).toBe(false)
    expect(isUnfinished('today', { from: '2026-10-14', to: '2026-10-14' }, '2026-10-14')).toBe(false)
  })

  it('requested_at ranges run from 00:00 WIB of the first day to 00:00 WIB after the last', () => {
    expect(wibInstantRange({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ gte: '2026-10-01T00:00:00+07:00', lt: '2026-11-01T00:00:00+07:00' })
  })
})
