// format/money tests — the ONE canonical IDR formatter (cohesion-debt 2026-07-19,
// item #1). Oracle: id-ID grouping (DOTS), "Rp " prefix, whole rupiah, leading
// minus on negatives.
import { describe, it, expect } from 'vitest'
import { formatIDR } from './money'

describe('formatIDR (one canonical IDR string)', () => {
  it('groups thousands with id-ID DOTS and prefixes Rp', () => {
    expect(formatIDR(45000)).toBe('Rp 45.000')
    expect(formatIDR(9000)).toBe('Rp 9.000')
    expect(formatIDR(1_000_000)).toBe('Rp 1.000.000')
  })

  it('rounds to whole rupiah — rupiah has no sen', () => {
    expect(formatIDR(1234567.5)).toBe('Rp 1.234.568')
    expect(formatIDR(0.4)).toBe('Rp 0')
  })

  it('carries a leading minus on negatives, never "Rp -…"', () => {
    expect(formatIDR(-21000)).toBe('-Rp 21.000')
  })
})
