import { describe, expect, it } from 'vitest'
import { isIsoCalendarDate } from './calendar-date'

describe('isIsoCalendarDate — strict ISO calendar date validation', () => {
  it('accepts valid calendar dates', () => {
    expect(isIsoCalendarDate('2026-10-29')).toBe(true)
    expect(isIsoCalendarDate('2026-01-01')).toBe(true)
    expect(isIsoCalendarDate('2026-12-31')).toBe(true)
    expect(isIsoCalendarDate('2026-02-28')).toBe(true)
    expect(isIsoCalendarDate('2026-04-30')).toBe(true)
  })

  it('accepts leap day on a leap year', () => {
    expect(isIsoCalendarDate('2024-02-29')).toBe(true)
    expect(isIsoCalendarDate('2020-02-29')).toBe(true)
    expect(isIsoCalendarDate('2000-02-29')).toBe(true)
  })

  it('rejects leap day on non-leap years', () => {
    expect(isIsoCalendarDate('2026-02-29')).toBe(false)
    expect(isIsoCalendarDate('2025-02-29')).toBe(false)
    expect(isIsoCalendarDate('2023-02-29')).toBe(false)
    expect(isIsoCalendarDate('1900-02-29')).toBe(false)
  })

  it('rejects invalid day numbers for 30-day and 31-day months', () => {
    expect(isIsoCalendarDate('2026-04-31')).toBe(false) // April has 30 days
    expect(isIsoCalendarDate('2026-06-31')).toBe(false) // June has 30 days
    expect(isIsoCalendarDate('2026-09-31')).toBe(false) // September has 30 days
    expect(isIsoCalendarDate('2026-11-31')).toBe(false) // November has 30 days
    expect(isIsoCalendarDate('2026-02-30')).toBe(false) // February never has 30 days
    expect(isIsoCalendarDate('2026-01-32')).toBe(false)
    expect(isIsoCalendarDate('2026-01-00')).toBe(false)
  })

  it('rejects invalid month numbers', () => {
    expect(isIsoCalendarDate('2026-00-15')).toBe(false)
    expect(isIsoCalendarDate('2026-13-01')).toBe(false)
  })

  it('rejects malformed strings and non-string inputs', () => {
    expect(isIsoCalendarDate('')).toBe(false)
    expect(isIsoCalendarDate('2026-1-1')).toBe(false)
    expect(isIsoCalendarDate('2026-01-1')).toBe(false)
    expect(isIsoCalendarDate('2026/01/01')).toBe(false)
    expect(isIsoCalendarDate('2026-01-01T00:00:00Z')).toBe(false)
    expect(isIsoCalendarDate('2026-01-01 ')).toBe(false)
    expect(isIsoCalendarDate(' 2026-01-01')).toBe(false)
    expect(isIsoCalendarDate('random text')).toBe(false)
    expect(isIsoCalendarDate(null as unknown as string)).toBe(false)
    expect(isIsoCalendarDate(undefined as unknown as string)).toBe(false)
  })
})
