import { describe, it, expect } from 'vitest'
import { dueStatus } from './dueStatus'

// Fixed clock: 2026-06-10T05:00:00Z = 12:00 WIB on Wed 10 Jun 2026. "Today in WIB" = 2026-06-10.
const NOON_WIB = new Date('2026-06-10T05:00:00Z')

describe('dueStatus (AC-062)', () => {
  it('AC-062: classifies a due date one day before today-WIB as overdue', () => {
    expect(dueStatus('2026-06-09', NOON_WIB)).toBe('overdue')
  })
  it('AC-062: classifies today-WIB as soon (0 days <= 3)', () => {
    expect(dueStatus('2026-06-10', NOON_WIB)).toBe('soon')
  })
  it('AC-062: classifies today+3 as soon (boundary of the soon window)', () => {
    expect(dueStatus('2026-06-13', NOON_WIB)).toBe('soon')
  })
  it('AC-062: classifies today+4 as calm (just past the soon window)', () => {
    expect(dueStatus('2026-06-14', NOON_WIB)).toBe('calm')
  })
  it('AC-062: classifies a null due date as none', () => {
    expect(dueStatus(null, NOON_WIB)).toBe('none')
  })

  // No host-tz leak: 05:00 WIB on Wed 10 Jun is still "today in WIB". A naive UTC-day implementation
  // would read 2026-06-09 here and misclassify. The WIB +7h offset keeps "today" = 2026-06-10.
  const EARLY_WIB = new Date('2026-06-09T22:00:00Z') // = 05:00 WIB Wed 10 Jun
  it('AC-062: WIB boundary — early-morning WIB still treats 2026-06-10 as today (overdue arm holds)', () => {
    expect(dueStatus('2026-06-09', EARLY_WIB)).toBe('overdue')
  })
  it('AC-062: WIB boundary — early-morning WIB still treats today as soon', () => {
    expect(dueStatus('2026-06-10', EARLY_WIB)).toBe('soon')
  })
  it('AC-062: WIB boundary — early-morning WIB still treats today+4 as calm', () => {
    expect(dueStatus('2026-06-14', EARLY_WIB)).toBe('calm')
  })
})
