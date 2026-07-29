// The Home header's day-state line — the RULE, tested at its boundaries.
//
// The whole point of the rule (mockup `home-priority-2026-07-28` §stateLine) is that every
// sentence is TRUE BY CONSTRUCTION: a band is chosen from two counts, and a phrasing is picked
// from that band by a rotating index. Nothing here is authored per-day by a model, and nothing
// names anything the app cannot count. So the test that matters is the BAND SELECTION at each
// threshold, not one happy-path sentence.
import { describe, it, expect } from 'vitest'
import {
  dayStateBand, dayStateLine, dayProgressPct, dayRotation, DAY_STATE_PHRASINGS,
} from './home-day-state'
import { messages } from '@/i18n/messages'

describe('dayStateBand — the rule, at every boundary', () => {
  it('nothing left is "clear", even before anything was handled', () => {
    expect(dayStateBand(5, 0)).toBe('clear')
    // left === 0 is checked FIRST, so an empty day reads clear, never "fresh".
    expect(dayStateBand(0, 0)).toBe('clear')
  })

  it('nothing handled yet is "fresh", even when the end is already in sight', () => {
    expect(dayStateBand(0, 12)).toBe('fresh')
    // done === 0 is checked BEFORE the <= 3 countdown, so a 2-item untouched day is fresh.
    expect(dayStateBand(0, 2)).toBe('fresh')
  })

  it('three or fewer left is the countdown — the number IS the message', () => {
    expect(dayStateBand(1, 3)).toBe('countdown')
    expect(dayStateBand(1, 1)).toBe('countdown')
    expect(dayStateBand(20, 3)).toBe('countdown')
    // 4 left is past the countdown band.
    expect(dayStateBand(1, 4)).toBe('early')
  })

  it('75% handled is the "stretch" threshold, inclusive', () => {
    expect(dayStateBand(12, 4)).toBe('stretch') // 12/16 = 0.75 exactly
    expect(dayStateBand(11, 4)).toBe('most')    // 11/15 = 0.733 — below the threshold
  })

  it('more done than left is "most", below the stretch threshold', () => {
    expect(dayStateBand(10, 4)).toBe('most')  // 10/14 = 0.714, done > left
    expect(dayStateBand(5, 5)).toBe('half')   // equal is NOT "more done than left"
  })

  it('40% handled is the "half" threshold, inclusive', () => {
    expect(dayStateBand(4, 6)).toBe('half')  // 4/10 = 0.40 exactly
    expect(dayStateBand(39, 61)).toBe('early') // 0.39 — below the threshold
  })

  it('anything less is "early"', () => {
    expect(dayStateBand(1, 20)).toBe('early')
  })
})

describe('dayStateLine — a rotating phrasing inside the chosen band', () => {
  it('rotates through the band’s phrasings and wraps', () => {
    const seen = [0, 1, 2, 3, 4].map((r) => dayStateLine(1, 20, r).key)
    const options = DAY_STATE_PHRASINGS.early
    expect(seen.slice(0, options.length)).toEqual([...options])
    // The 5th pick wraps back to the first — the index rotates, it never runs off the end.
    expect(seen[options.length]).toBe(options[0])
  })

  it('a negative or huge rotation still lands inside the band', () => {
    for (const r of [-1, -7, 999_999]) {
      expect(DAY_STATE_PHRASINGS.half).toContain(dayStateLine(4, 6, r).key)
    }
  })

  it('the countdown band carries the real number, not an adjective', () => {
    const line = dayStateLine(9, 2, 0)
    expect(line.band).toBe('countdown')
    expect(line.key).toBe('home.day.countdown')
    expect(line.count).toBe(2)
  })

  it('every non-countdown band holds 3–4 interchangeable phrasings', () => {
    for (const [band, keys] of Object.entries(DAY_STATE_PHRASINGS)) {
      expect(keys.length, band).toBeGreaterThanOrEqual(3)
      expect(keys.length, band).toBeLessThanOrEqual(4)
      expect(new Set(keys).size, `${band} phrasings must be distinct`).toBe(keys.length)
    }
  })

  it('every phrasing key exists in BOTH locales — a band must never fall back to English', () => {
    const keys = [...Object.values(DAY_STATE_PHRASINGS).flat(), 'home.day.countdown'] as const
    for (const key of keys) {
      expect(messages.en[key], `en ${key}`).toBeTruthy()
      expect(messages.id[key], `id ${key}`).toBeTruthy()
    }
  })
})

describe('dayProgressPct', () => {
  it('is the handled share of the day, rounded', () => {
    expect(dayProgressPct(3, 9)).toBe(25)
    expect(dayProgressPct(1, 2)).toBe(33)
  })

  it('an empty day is complete, not a division by zero', () => {
    expect(dayProgressPct(0, 0)).toBe(100)
  })

  it('never leaves the 0–100 track', () => {
    expect(dayProgressPct(0, 7)).toBe(0)
    expect(dayProgressPct(7, 0)).toBe(100)
  })
})

describe('dayRotation — stable within a WIB day, different across days', () => {
  it('is stable for the same day and moves with the date', () => {
    expect(dayRotation('2026-07-28')).toBe(dayRotation('2026-07-28'))
    expect(dayRotation('2026-07-28')).not.toBe(dayRotation('2026-07-29'))
  })

  it('never returns a negative index', () => {
    for (const d of ['2026-01-01', '2026-12-31', 'not-a-date']) {
      expect(dayRotation(d)).toBeGreaterThanOrEqual(0)
    }
  })
})
