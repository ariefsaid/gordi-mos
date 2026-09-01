import { describe, it, expect } from 'vitest'
import { NUDGE_AFTER_DAYS, triageAgeDays, nudgeAgeDays, compareTriage } from './nudge-semantics'
import type { TriageNotificationRow } from './read-handled-semantics'

// NOW: today 00:30 VIEWER-LOCAL — chosen so the age-2 case (created 23:30 two days ago) is a
// calendar-age 2 but an elapsed-24h-age 1, proving the bucket is a local-day count, not a rolling
// window: floor((00:30) - (23:30 two days earlier)) = floor(25h / 24h) = 1, where the local-day
// count is a true 2.
const NOW = dayAt(0, 0, 30)

/** A local time `offsetDays` calendar days from today at `h`:`m` (viewer-local), as ISO ms. */
function dayAt(offsetDays: number, h: number, m: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0) // today's local midnight
  d.setDate(d.getDate() + offsetDays)
  d.setHours(h, m, 0, 0)
  return d
}

function trow(id: string, created: string, over: Partial<TriageNotificationRow> = {}): TriageNotificationRow {
  return {
    id,
    severity: 'info',
    title: `Title ${id}`,
    body: null,
    metadata: {},
    read_at: null,
    handled_at: null,
    created_at: created,
    ...over,
  }
}

describe('triageAgeDays (viewer-local calendar-day buckets)', () => {
  it('counts whole LOCAL calendar days; never goes negative; the gate is 2', () => {
    expect(NUDGE_AFTER_DAYS).toBe(2)
    // Same local day → 0 (even hours before "now").
    expect(triageAgeDays(dayAt(0, 5, 0).toISOString(), NOW)).toBe(0)
    // Yesterday (1 calendar day) → 1 — just under the 2-day gate.
    expect(triageAgeDays(dayAt(-1, 12, 0).toISOString(), NOW)).toBe(1)
    // 23:30 two days ago vs now 00:30: the LOCAL-day age is 2 (the elapsed-ms age would be 1 —
    // 25h of elapsed time — so this case FAILS the pre-fix rolling-window implementation).
    expect(triageAgeDays(dayAt(-2, 23, 30).toISOString(), NOW)).toBe(2)
    // Three calendar days ago → 3.
    expect(triageAgeDays(dayAt(-3, 12, 0).toISOString(), NOW)).toBe(3)
    // Never negative: a row created on a later local day clamps to 0.
    expect(triageAgeDays(dayAt(1, 0, 0).toISOString(), NOW)).toBe(0)
  })

  it('is stable across the whole local day: late-evening and early-morning re-checks agree', () => {
    const created = dayAt(-2, 23, 30).toISOString() // 23:30 two days ago
    // Any time TODAY falls in the same local-day bucket as NOW → still age 2.
    expect(triageAgeDays(created, dayAt(0, 9, 0))).toBe(2)
    expect(triageAgeDays(created, dayAt(0, 23, 0))).toBe(2)
  })
})

describe('nudgeAgeDays (AC-141-1 boundary / AC-141-2)', () => {
  it('an untriaged row aged >= 2 local days nudges with its whole-day age', () => {
    expect(nudgeAgeDays(trow('a', dayAt(-2, 23, 30).toISOString()), NOW)).toBe(2)
    expect(nudgeAgeDays(trow('a', dayAt(-3, 8, 0).toISOString()), NOW)).toBe(3)
  })

  it('a row under the 2-day gate is unaffected (no nudge, no badge)', () => {
    expect(nudgeAgeDays(trow('a', dayAt(0, 5, 0).toISOString()), NOW)).toBeNull()
    expect(nudgeAgeDays(trow('a', dayAt(-1, 23, 0).toISOString()), NOW)).toBeNull()
  })

  it('AC-141-2: a read row is never nudged, however old', () => {
    expect(nudgeAgeDays(trow('a', dayAt(-8, 12, 0).toISOString(), { read_at: dayAt(-1, 1, 0).toISOString() }), NOW)).toBeNull()
  })

  it('AC-141-2: a handled row is never nudged, however old', () => {
    expect(nudgeAgeDays(trow('a', dayAt(-8, 12, 0).toISOString(), { handled_at: dayAt(-1, 1, 0).toISOString(), read_at: dayAt(-1, 1, 0).toISOString() }), NOW)).toBeNull()
  })
})

describe('compareTriage (AC-141-1 ordering / AC-141-3 stability)', () => {
  it('AC-141-1: a nudged row sorts above younger unread rows; read rows stay last', () => {
    const young = trow('young', dayAt(0, 5, 0).toISOString())
    const nudged = trow('nudged', dayAt(-3, 12, 0).toISOString())
    const read = trow('read', dayAt(-4, 8, 0).toISOString(), { read_at: dayAt(-1, 1, 0).toISOString() })
    const sorted = [young, nudged, read].sort((a, b) => compareTriage(a, b, NOW))
    expect(sorted.map((r) => r.id)).toEqual(['nudged', 'young', 'read'])
  })

  it('within the nudged tier the longest-waiting row surfaces first', () => {
    const twoDays = trow('two', dayAt(-2, 12, 0).toISOString())
    const fiveDays = trow('five', dayAt(-5, 12, 0).toISOString())
    const sorted = [twoDays, fiveDays].sort((a, b) => compareTriage(a, b, NOW))
    expect(sorted.map((r) => r.id)).toEqual(['five', 'two'])
  })

  it('AC-141-3: same inputs → identical order; same-day re-sort (now +5h, no bucket crossed) is stable', () => {
    const rows = [
      trow('young', dayAt(0, 5, 0).toISOString()),
      trow('nudged', dayAt(-3, 12, 0).toISOString()), // age 3
      trow('read', dayAt(-4, 8, 0).toISOString(), { read_at: dayAt(-2, 1, 0).toISOString() }),
    ]
    const once = [...rows].sort((a, b) => compareTriage(a, b, NOW))
    const again = [...rows].sort((a, b) => compareTriage(a, b, NOW))
    expect(again.map((r) => r.id)).toEqual(once.map((r) => r.id))
    // +5h from NOW (00:30 → 05:30) stays the same local day — no bucket is crossed, so nothing
    // re-animates within the day.
    const laterSameDay = new Date(NOW.getTime() + 5 * 3_600_000)
    const reSort = [...rows].sort((a, b) => compareTriage(a, b, laterSameDay))
    expect(reSort.map((r) => r.id)).toEqual(once.map((r) => r.id))
  })

  it('equal created_at falls through to a stable id tie-breaker — antisymmetric, 0 only on a full tie', () => {
    const ts = '2026-08-20T12:00:00Z'
    const a = trow('a', ts)
    const x = trow('x', ts)
    // Same timestamp + same tier → id breaks the tie, and in opposite directions (antisymmetric).
    expect(compareTriage(a, x, NOW)).toBe(-compareTriage(x, a, NOW))
    // A full tie (same id) returns 0, not a constant -1.
    expect(compareTriage(a, a, NOW)).toBe(0)
    // Sorting equal rows keeps both, deterministically.
    expect([x, a].sort((p, q) => compareTriage(p, q, NOW)).length).toBe(2)
  })
})