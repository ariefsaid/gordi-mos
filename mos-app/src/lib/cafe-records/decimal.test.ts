import { describe, expect, it } from 'vitest'
import { ZERO, addDec, compareDec, formatDec, parseDecimal } from './decimal'

describe('Records exact decimals', () => {
  it('adds without binary rounding', () => {
    const sum = addDec(parseDecimal(0.1)!, parseDecimal(0.2)!)
    expect(formatDec(sum)).toBe('0,3')
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  it('keeps source precision and trims only trailing zeros', () => {
    expect(formatDec(parseDecimal('12.3400')!)).toBe('12,34')
    expect(formatDec(parseDecimal('0.000001')!)).toBe('0,000001')
    expect(formatDec(parseDecimal('7')!)).toBe('7')
  })

  it('formats id-ID in both locales: dot groups, comma decimals, no compact notation', () => {
    expect(formatDec(parseDecimal('1234567.5')!)).toBe('1.234.567,5')
    expect(formatDec(parseDecimal(1000)!)).toBe('1.000')
    expect(formatDec(parseDecimal('-1500.25')!)).toBe('-1.500,25')
  })

  it('rejects what is not a number and tells zero from absent', () => {
    expect(parseDecimal(null)).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal(Number.NaN)).toBeNull()
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('0')).toBe(ZERO)
    expect(compareDec(parseDecimal('2')!, parseDecimal('10')!)).toBe(-1)
  })

  it('handles exponent notation from tiny numerics', () => {
    expect(formatDec(parseDecimal(1e-7)!)).toBe('0,0000001')
  })
})
