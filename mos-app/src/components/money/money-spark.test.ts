// The sparkline's start → end label: one unit when both ends share it, each end in full otherwise.
import { describe, it, expect } from 'vitest'
import { sparkEnds } from './money-spark'

describe('sparkEnds', () => {
  it('shares the unit when both ends are in millions', () => {
    expect(sparkEnds([19_100_000, 12_000_000, null, 14_300_000])?.text).toBe('19,1 → 14,3 jt')
  })

  it('writes each end in full when the units differ', () => {
    expect(sparkEnds([500_000, 6_200_000])?.text).toBe('Rp 500.000 → Rp 6,2 jt')
  })

  it('has no label for fewer than two received days', () => {
    expect(sparkEnds([null, 1_000_000, null])).toBeNull()
  })
})
