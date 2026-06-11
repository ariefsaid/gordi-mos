import { describe, it, expect } from 'vitest'
import { weekLabel, fridayLabel } from './week'
import type { WeekLabel } from './week'

// AC-010: WIB week math — tests the pure weekLabel utility.
// All instants are expressed in UTC; the impl must use Asia/Jakarta (UTC+7) for the calendar.

describe('AC-010: weekLabel WIB week math', () => {
  it('(a) Wed 10 Jun 2026 12:00 WIB → range 8–14 Jun 2026, today Wed 10 Jun', () => {
    // 2026-06-10T05:00:00Z = Wed 12:00 WIB
    const now = new Date('2026-06-10T05:00:00Z')
    const result: WeekLabel = weekLabel(now)
    expect(result.range).toBe('8–14 Jun 2026')
    expect(result.today).toBe('Wed 10 Jun')
  })

  it('(b) Mon boundary: 2026-06-08T16:30:00Z = Mon 8 Jun 00:30 WIB → range 8–14 Jun 2026, today Mon 8 Jun', () => {
    // This is Sun in UTC (16:30 UTC = Mon 23:30 UTC-1? No — UTC+7: 16:30+7=23:30 Mon 8 Jun WIB)
    // 2026-06-08T16:30:00Z → WIB = 2026-06-08 23:30 — still Mon 8 Jun WIB
    const now = new Date('2026-06-08T16:30:00Z')
    const result: WeekLabel = weekLabel(now)
    expect(result.range).toBe('8–14 Jun 2026')
    expect(result.today).toBe('Mon 8 Jun')
  })

  it('(c) Sun 14 Jun 03:00 WIB: 2026-06-13T20:00:00Z → range 8–14 Jun 2026, today Sun 14 Jun', () => {
    // 2026-06-13T20:00:00Z + 7h = 2026-06-14T03:00 WIB = Sun 14 Jun WIB
    const now = new Date('2026-06-13T20:00:00Z')
    const result: WeekLabel = weekLabel(now)
    expect(result.range).toBe('8–14 Jun 2026')
    expect(result.today).toBe('Sun 14 Jun')
  })
})

describe('fridayLabel WIB week Friday', () => {
  // Jun 2026 calendar: Mon=8, Tue=9, Wed=10, Thu=11, Fri=12, Sat=13, Sun=14.
  // The mockup strip shows "Fri 13 Jun" which is a typo (13 is Saturday).
  // The correct Friday for week of 8–14 Jun is 12 Jun.
  it('returns Fri 12 Jun for the week of 8–14 Jun 2026', () => {
    const now = new Date('2026-06-10T05:00:00Z') // Wed 10 Jun WIB
    expect(fridayLabel(now)).toBe('Fri 12 Jun')
  })
})
