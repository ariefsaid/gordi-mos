import { describe, expect, it } from 'vitest'
import { overdueDays } from './task-formatters'

describe('overdue age follows the WIB calendar, not elapsed UTC hours', () => {
  it('changes at midnight WIB even when UTC is still the previous date', () => {
    expect(overdueDays('2026-10-01', new Date('2026-10-01T16:59:59Z'))).toBe(0)
    expect(overdueDays('2026-10-01', new Date('2026-10-01T17:00:00Z'))).toBe(1)
  })
  it('counts across month and year boundaries and never reports negative overdue age', () => {
    expect(overdueDays('2025-12-31', new Date('2026-01-02T01:00:00Z'))).toBe(2)
    expect(overdueDays('2026-10-18', new Date('2026-10-12T01:00:00Z'))).toBe(0)
  })
})
