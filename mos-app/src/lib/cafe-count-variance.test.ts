import { describe, expect, it } from 'vitest'
import { areCafeCountDecimalsEqual, calculateCafeCountVariance } from './cafe-count-variance'

describe('AC-015 Cafe Count variance', () => {
  it('uses the recount when present and returns final Count minus Expected balance exactly', () => {
    expect(calculateCafeCountVariance('13', '12.125', '12.25')).toBe('-0.125')
  })

  it('returns zero without a tolerance when Count equals Expected balance', () => {
    expect(calculateCafeCountVariance('1.0001', null, '1.0001')).toBe('0')
  })

  it('compares database decimal strings by stored precision, not formatting', () => {
    expect(areCafeCountDecimalsEqual('0', '0.0000')).toBe(true)
    expect(areCafeCountDecimalsEqual('-0.125', '-0.1250')).toBe(true)
    expect(areCafeCountDecimalsEqual('0.0001', '0')).toBe(false)
  })
})
