// Cohesion-debt 2026-07-19, item #1 (Format unification): ONE canonical IDR
// money formatter. id-ID grouping with DOTS ("Rp 1.000.000") — never the en-US
// commas that the same app shipped in plan-budget-logic. Locks the canonical output.
import { describe, expect, it } from 'vitest'
import { formatIDR } from './money'

describe('formatIDR — the one canonical rupiah formatter', () => {
  it('groups thousands with DOTS (id-ID) and prefixes "Rp "', () => {
    expect(formatIDR(1_000_000)).toBe('Rp 1.000.000')
    expect(formatIDR(45_000)).toBe('Rp 45.000')
    expect(formatIDR(1_284_500_000)).toBe('Rp 1.284.500.000')
  })

  it('rounds to whole rupiah (no sen)', () => {
    expect(formatIDR(1_234_567.5)).toBe('Rp 1.234.568')
  })

  it('renders zero as "Rp 0"', () => {
    expect(formatIDR(0)).toBe('Rp 0')
  })

  it('prefixes the minus sign for negatives ("-Rp …")', () => {
    expect(formatIDR(-500_000)).toBe('-Rp 500.000')
  })
})
