// #410 — lib/wib-time must BE the locale-aware formatter, not a second copy with 'en-GB'
// nailed in. Every signal timestamp/freshness/provenance call site imports from here, so an
// en-GB-pinned copy shows English month abbreviations to an Indonesian viewer on every signal.
// v4 shipped this module as a one-line re-export of lib/format/date's formatWibDateTime; the
// port re-grew the copy. This test pins the re-export by observable behaviour: the id locale
// renders an Indonesian month abbreviation, and the Jakarta wall clock + WIB suffix hold.
import { describe, it, expect } from 'vitest'
import { formatWibDateTime } from './wib-time'

describe('formatWibDateTime (lib/wib-time re-export, #410)', () => {
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
