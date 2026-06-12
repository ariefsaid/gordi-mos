import { describe, it, expect } from 'vitest'
import { weekLabel, fridayLabel, weekStartISO, weeklyUpdateTiming, wibDayRange, toWibInputValue, wibInputToUTCISO } from './week'
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

// AC-010 cross-boundary: cross-month and cross-year week ranges
describe('AC-010: weekLabel cross-month and cross-year ranges', () => {
  it('(d) cross-month: Mon 29 Jun – Sun 5 Jul 2026 → range "29 Jun – 5 Jul 2026"', () => {
    // 2026-06-29T05:00:00Z = Mon 29 Jun 12:00 WIB
    const now = new Date('2026-06-29T05:00:00Z')
    const result = weekLabel(now)
    expect(result.range).toBe('29 Jun – 5 Jul 2026')
  })

  it('(e) cross-year: Mon 29 Dec 2025 – Sun 4 Jan 2026 → range "29 Dec 2025 – 4 Jan 2026"', () => {
    // 2025-12-29T05:00:00Z = Mon 29 Dec 2025 12:00 WIB
    const now = new Date('2025-12-29T05:00:00Z')
    const result = weekLabel(now)
    expect(result.range).toBe('29 Dec 2025 – 4 Jan 2026')
  })

  it('(f) same-month week remains unchanged: "8–14 Jun 2026"', () => {
    const now = new Date('2026-06-10T05:00:00Z')
    const result = weekLabel(now)
    expect(result.range).toBe('8–14 Jun 2026')
  })
})

// AC-030: weekStartISO returns the WIB Monday 'YYYY-MM-DD' of the week containing `now`,
// offset by N weeks. Pure fixed-offset arithmetic — no host-tz leak.
describe('AC-030: weekStartISO WIB Monday', () => {
  // Jun 2026: Mon=8, Sun=14. Week of 8–14 Jun → Monday '2026-06-08'.
  it('(a) Wed 10 Jun 2026 12:00 WIB → 2026-06-08', () => {
    expect(weekStartISO(new Date('2026-06-10T05:00:00Z'))).toBe('2026-06-08')
  })
  it('(b) Mon 8 Jun 00:00 WIB boundary (2026-06-07T17:00:00Z) → 2026-06-08', () => {
    // 2026-06-07T17:00:00Z + 7h = 2026-06-08T00:00 WIB = Mon 8 Jun WIB
    expect(weekStartISO(new Date('2026-06-07T17:00:00Z'))).toBe('2026-06-08')
  })
  it('(c) Sun 14 Jun 23:59 WIB (2026-06-14T16:59:00Z) → still 2026-06-08', () => {
    expect(weekStartISO(new Date('2026-06-14T16:59:00Z'))).toBe('2026-06-08')
  })
  it('(d) UTC instant straddling WIB midnight: 2026-06-08T16:30:00Z = Mon 23:30 WIB → 2026-06-08', () => {
    expect(weekStartISO(new Date('2026-06-08T16:30:00Z'))).toBe('2026-06-08')
  })
  it('(e) offsetWeeks=-1 → prior Monday 2026-06-01', () => {
    expect(weekStartISO(new Date('2026-06-10T05:00:00Z'), -1)).toBe('2026-06-01')
  })
  it('(f) cross-month: Wed 1 Jul 2026 12:00 WIB → Monday 2026-06-29', () => {
    expect(weekStartISO(new Date('2026-07-01T05:00:00Z'))).toBe('2026-06-29')
  })
  it('(g) cross-year: Thu 1 Jan 2026 12:00 WIB → Monday 2025-12-29', () => {
    expect(weekStartISO(new Date('2026-01-01T05:00:00Z'))).toBe('2025-12-29')
  })
  it('(h) host-tz guard: value identical regardless of process.env.TZ', () => {
    const saved = process.env.TZ
    try {
      process.env.TZ = 'America/Los_Angeles'
      expect(weekStartISO(new Date('2026-06-10T05:00:00Z'))).toBe('2026-06-08')
      process.env.TZ = 'Pacific/Kiritimati'
      expect(weekStartISO(new Date('2026-06-10T05:00:00Z'))).toBe('2026-06-08')
    } finally {
      process.env.TZ = saved
    }
  })
})

// AC-031b: weeklyUpdateTiming compares submitted_at against the week's Friday 17:00 WIB.
// Friday 17:00 WIB of a Monday weekStart = Monday + 4 days at 17:00 WIB = 10:00:00Z.
describe('AC-031b: weeklyUpdateTiming on-time vs late', () => {
  // Week of 8–14 Jun 2026: Friday = 12 Jun; 17:00 WIB = 2026-06-12T10:00:00Z.
  it('on-time when submitted before the Friday 17:00 WIB due', () => {
    expect(weeklyUpdateTiming('2026-06-12T09:59:59Z', '2026-06-08')).toBe('on-time')
  })
  it('on-time exactly at the 17:00:00 WIB boundary', () => {
    expect(weeklyUpdateTiming('2026-06-12T10:00:00Z', '2026-06-08')).toBe('on-time')
  })
  it('late one second after the due instant', () => {
    expect(weeklyUpdateTiming('2026-06-12T10:00:01Z', '2026-06-08')).toBe('late')
  })
  it('a Saturday submit is late', () => {
    expect(weeklyUpdateTiming('2026-06-13T03:00:00Z', '2026-06-08')).toBe('late')
  })
  it('cross-year week: weekStart 2025-12-29 → Friday 2 Jan 2026 17:00 WIB (2026-01-02T10:00:00Z)', () => {
    expect(weeklyUpdateTiming('2026-01-02T10:00:00Z', '2025-12-29')).toBe('on-time')
    expect(weeklyUpdateTiming('2026-01-02T10:00:01Z', '2025-12-29')).toBe('late')
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

describe('AC-050: wibDayRange returns the half-open WIB-day UTC range with no host-tz leak', () => {
  // Jun 2026: WIB midnight 12 Jun = 2026-06-11T17:00:00Z; WIB midnight 13 Jun = 2026-06-12T17:00:00Z.
  it('mid-day instant resolves to its WIB calendar day', () => {
    // 2026-06-12T03:00:00Z = 10:00 WIB, 12 Jun
    expect(wibDayRange(new Date('2026-06-12T03:00:00Z'))).toEqual({
      startISO: '2026-06-11T17:00:00.000Z',
      endISO: '2026-06-12T17:00:00.000Z',
    })
  })
  it('WIB-midnight boundary belongs to the new day', () => {
    // 2026-06-11T17:00:00Z = 00:00 WIB, 12 Jun
    expect(wibDayRange(new Date('2026-06-11T17:00:00Z'))).toEqual({
      startISO: '2026-06-11T17:00:00.000Z',
      endISO: '2026-06-12T17:00:00.000Z',
    })
  })
  it('the instant just before WIB midnight belongs to the prior day', () => {
    // 2026-06-11T16:59:59Z = 23:59:59 WIB, 11 Jun
    expect(wibDayRange(new Date('2026-06-11T16:59:59Z'))).toEqual({
      startISO: '2026-06-10T17:00:00.000Z',
      endISO: '2026-06-11T17:00:00.000Z',
    })
  })
})

// Daily Log add/edit form datetime-local helpers — WIB wall-clock ⇄ UTC ISO.
// Must be host-timezone-independent (NFR-005): the same string maps to the same
// UTC instant on a UTC laptop, a WIB laptop, or a CI runner.
describe('WIB datetime-local form helpers', () => {
  it('toWibInputValue: a UTC instant → its WIB wall-clock "YYYY-MM-DDTHH:mm"', () => {
    // 2026-06-12T00:00:00Z = 07:00 WIB
    expect(toWibInputValue(new Date('2026-06-12T00:00:00Z'))).toBe('2026-06-12T07:00')
    // 2026-06-11T20:30:00Z = 03:30 WIB next day
    expect(toWibInputValue(new Date('2026-06-11T20:30:00Z'))).toBe('2026-06-12T03:30')
  })

  it('wibInputToUTCISO: a WIB wall-clock string → the correct UTC ISO instant', () => {
    // 07:00 WIB = 00:00:00Z
    expect(wibInputToUTCISO('2026-06-12T07:00')).toBe('2026-06-12T00:00:00.000Z')
    // 03:30 WIB on 12 Jun = 2026-06-11T20:30:00Z
    expect(wibInputToUTCISO('2026-06-12T03:30')).toBe('2026-06-11T20:30:00.000Z')
  })

  it('round-trips a UTC instant through WIB wall-clock and back, to the minute', () => {
    const iso = '2026-03-01T15:45:00.000Z'
    expect(wibInputToUTCISO(toWibInputValue(new Date(iso)))).toBe(iso)
  })
})
