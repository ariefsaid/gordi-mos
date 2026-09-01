import { describe, it, expect } from 'vitest'
import { NUDGE_AFTER_DAYS, triageAgeDays, nudgeAgeDays, compareTriage } from './nudge-semantics'
import type { TriageNotificationRow } from './read-handled-semantics'

const NOW = new Date('2026-08-20T12:00:00Z')

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

// created_at helpers relative to NOW — inside buckets, never on a boundary.
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

describe('triageAgeDays (OD-WAY-86 day buckets)', () => {
  it('floors whole days and never goes negative; the gate is 2 days', () => {
    expect(NUDGE_AFTER_DAYS).toBe(2)
    expect(triageAgeDays(ago(1), NOW)).toBe(0)
    expect(triageAgeDays(ago(47), NOW)).toBe(1) // 47h → under the 48h gate
    expect(triageAgeDays(ago(48), NOW)).toBe(2) // the boundary itself
    expect(triageAgeDays(ago(72), NOW)).toBe(3)
  })
})

describe('nudgeAgeDays (AC-141-1 boundary / AC-141-2)', () => {
  it('an untriaged row aged >= 48h nudges with its whole-day age', () => {
    expect(nudgeAgeDays(trow('a', ago(48)), NOW)).toBe(2)
    expect(nudgeAgeDays(trow('a', ago(49)), NOW)).toBe(2)
    expect(nudgeAgeDays(trow('a', ago(73)), NOW)).toBe(3)
  })

  it('a row under 48h is unaffected (no nudge, no badge)', () => {
    expect(nudgeAgeDays(trow('a', ago(1)), NOW)).toBeNull()
    expect(nudgeAgeDays(trow('a', ago(47)), NOW)).toBeNull()
  })

  it('AC-141-2: a read row is never nudged, however old', () => {
    expect(nudgeAgeDays(trow('a', ago(240), { read_at: ago(1) }), NOW)).toBeNull()
  })

  it('AC-141-2: a handled row is never nudged, however old', () => {
    expect(nudgeAgeDays(trow('a', ago(240), { handled_at: ago(1), read_at: ago(1) }), NOW)).toBeNull()
  })
})

describe('compareTriage (AC-141-1 ordering / AC-141-3 stability)', () => {
  it('AC-141-1: a nudged row sorts above younger unread rows; read rows stay last', () => {
    const young = trow('young', ago(1))
    const nudged = trow('nudged', ago(72))
    const read = trow('read', ago(96), { read_at: ago(1) })
    const sorted = [young, nudged, read].sort((a, b) => compareTriage(a, b, NOW))
    expect(sorted.map((r) => r.id)).toEqual(['nudged', 'young', 'read'])
  })

  it('within the nudged tier the longest-waiting row surfaces first', () => {
    const twoDays = trow('two', ago(50))
    const fiveDays = trow('five', ago(122))
    const sorted = [twoDays, fiveDays].sort((a, b) => compareTriage(a, b, NOW))
    expect(sorted.map((r) => r.id)).toEqual(['five', 'two'])
  })

  it('AC-141-3: same inputs → identical order; same-day re-sort (now +5h, no bucket crossed) is stable', () => {
    const rows = [
      trow('young', ago(1)),
      trow('nudged', ago(74)),
      trow('read', ago(96), { read_at: ago(2) }),
    ]
    const once = [...rows].sort((a, b) => compareTriage(a, b, NOW))
    const again = [...rows].sort((a, b) => compareTriage(a, b, NOW))
    expect(again.map((r) => r.id)).toEqual(once.map((r) => r.id))
    // 74h+5h=79h stays bucket 3, 1h→6h stays bucket 0 — nothing re-animates within the day.
    const laterSameDay = new Date(NOW.getTime() + 5 * 3_600_000)
    const reSort = [...rows].sort((a, b) => compareTriage(a, b, laterSameDay))
    expect(reSort.map((r) => r.id)).toEqual(once.map((r) => r.id))
  })
})