import { describe, expect, it } from 'vitest'
import { formatQuantityInput, parseQuantityInput } from './quantity-parser'

describe('parseQuantityInput', () => {
  it.each(['1,5', '1.5'])('accepts %s as 1.5 regardless of the decimal mark', raw => {
    expect(parseQuantityInput(raw, { min: 0 })).toEqual({
      kind: 'valid', value: 1.5, normalized: '1.5',
    })
  })

  it('rejects combined separators, malformed strings, negatives, and likely locale grouping', () => {
    expect(parseQuantityInput('1.234,5')).toEqual({ kind: 'invalid', reason: 'ambiguous' })
    expect(parseQuantityInput('1,234')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(parseQuantityInput('1.500')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(parseQuantityInput('1,500')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(parseQuantityInput('0001.500')).toEqual({ kind: 'invalid', reason: 'thousands' })
    expect(parseQuantityInput('1,125', { maxFractionDigits: 3 })).toMatchObject({ kind: 'valid', value: 1.125 })
    expect(parseQuantityInput('1.125', { maxFractionDigits: 2 })).toEqual({ kind: 'invalid', reason: 'precision' })
    expect(parseQuantityInput('0.125', { maxFractionDigits: 3 })).toMatchObject({ kind: 'valid', value: 0.125 })
    expect(parseQuantityInput('0.1255', { maxFractionDigits: 3 })).toEqual({ kind: 'invalid', reason: 'precision' })
    expect(parseQuantityInput('99999999999', { maxIntegerDigits: 10 })).toEqual({ kind: 'invalid', reason: 'range' })
    expect(parseQuantityInput('2x')).toEqual({ kind: 'invalid', reason: 'format' })
    expect(parseQuantityInput('-2')).toEqual({ kind: 'invalid', reason: 'negative' })
  })

  it('can refuse every three-digit grouping shape for blind Count entry', () => {
    expect(parseQuantityInput('1.250', { maxFractionDigits: 4, rejectThreeDigitGrouping: true })).toEqual({
      kind: 'invalid', reason: 'thousands',
    })
    expect(parseQuantityInput('1,125', { maxFractionDigits: 4, rejectThreeDigitGrouping: true })).toEqual({
      kind: 'invalid', reason: 'thousands',
    })
    expect(parseQuantityInput('0.125', { maxFractionDigits: 4, rejectThreeDigitGrouping: true })).toMatchObject({
      kind: 'valid', value: 0.125,
    })
  })

  it('refuses fractional notation for integer-only fields rather than truncating', () => {
    expect(parseQuantityInput('1,5', { integerOnly: true })).toEqual({ kind: 'invalid', reason: 'integer' })
    expect(parseQuantityInput('1.5', { integerOnly: true })).toEqual({ kind: 'invalid', reason: 'integer' })
    expect(parseQuantityInput('15', { integerOnly: true })).toMatchObject({ kind: 'valid', value: 15 })
  })

  it('formats a committed quantity with the active locale decimal mark and no grouping', () => {
    expect(formatQuantityInput(1234.5, 'en', 3)).toBe('1234.5')
    expect(formatQuantityInput(1234.5, 'id', 3)).toBe('1234,5')
  })
})
