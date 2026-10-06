import { describe, it, expect } from 'vitest'
import { wibMonthKey, wibMonthRange } from './week'

describe('AC-348: WIB month helpers', () => {
  it('derives the WIB month rather than the host UTC month', () => {
    expect(wibMonthKey(new Date('2026-12-31T18:00:00Z'))).toBe('2027-01')
  })
  it('returns December and January half-open UTC boundaries', () => {
    expect(wibMonthRange('2026-12')).toEqual({ month: '2026-12', startISO: '2026-11-30T17:00:00.000Z', endISO: '2026-12-31T17:00:00.000Z' })
    expect(wibMonthRange('2027-01')).toEqual({ month: '2027-01', startISO: '2026-12-31T17:00:00.000Z', endISO: '2027-01-31T17:00:00.000Z' })
  })
  it('rejects malformed month keys', () => {
    expect(wibMonthRange('2026-13')).toBeNull()
    expect(wibMonthRange('2026-1')).toBeNull()
  })
})
