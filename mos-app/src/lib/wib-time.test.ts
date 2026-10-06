// The shared locale-aware WIB formatter keeps Indonesian month names and Jakarta time intact.
import { describe, it, expect } from 'vitest'
import { formatWibDateTime } from './format/date'

describe('formatWibDateTime', () => {
  // 2026-08-15T17:00:00Z = 2026-08-16 00:00 WIB (UTC+7) — crosses the date line so the
  // Jakarta wall clock is proven, not assumed.
  const iso = '2026-08-15T17:00:00Z'

  it('id locale renders the Indonesian month abbreviation', () => {
    expect(formatWibDateTime(iso, 'id')).toBe('16 Agu 2026, 00:00 WIB')
  })

  it('en locale keeps the English rendering, Jakarta wall clock and WIB suffix intact', () => {
    expect(formatWibDateTime(iso, 'en')).toBe('16 Aug 2026, 00:00 WIB')
  })
})
