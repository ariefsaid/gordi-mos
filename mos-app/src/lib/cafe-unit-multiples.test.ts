import { describe, expect, it, vi } from 'vitest'
import { formatQuantityWithUnit, formatUnitMultiple, fromDefaultUnitQuantity, toDefaultUnitQuantity } from './cafe-unit-multiples'

describe('café unit-multiple conversion', () => {
  it('reuses locale-specific formatters while preserving EN and ID quantity text', () => {
    const NumberFormat = Intl.NumberFormat
    const numberFormat = vi.spyOn(Intl, 'NumberFormat')
    numberFormat.mockImplementation(function (locales, options) { return new NumberFormat(locales, options) })
    try {
      expect(formatQuantityWithUnit(1.25, 'porsi', 'en')).toBe('1.25 porsi')
      expect(formatQuantityWithUnit(1.25, 'porsi', 'en')).toBe('1.25 porsi')
      expect(formatUnitMultiple(1000, 'porsi', 'en')).toBe('1000 porsi')
      expect(formatUnitMultiple(1000, 'porsi', 'en')).toBe('1000 porsi')
      expect(formatQuantityWithUnit(1.25, 'porsi', 'id')).toBe('1,25 porsi')
      expect(formatUnitMultiple(1000, 'porsi', 'id')).toBe('1000 porsi')
      expect(numberFormat).toHaveBeenCalledTimes(4)
    } finally {
      numberFormat.mockRestore()
    }
  })

  it('formats a four-digit multiple without grouping', () => {
    expect(formatUnitMultiple(1000, 'porsi', 'en')).toBe('1000 porsi')
  })

  it('converts the entered count to the ERP default-unit quantity', () => {
    expect(toDefaultUnitQuantity(3, 0.5)).toBe(1.5)
  })

  it('converts a canonical quantity back to the selected multiple for editing', () => {
    expect(fromDefaultUnitQuantity(1.5, 0.5)).toBe(3)
  })

  it('rounds converted entry quantities to the two decimal places accepted by capture fields', () => {
    expect(toDefaultUnitQuantity(1.005, 1)).toBe(1.01)
    expect(fromDefaultUnitQuantity(1, 3)).toBe(0.33)
  })

  it.each([[0], [-0.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
    'rejects an invalid unit factor (%s)', factor => {
      expect(() => toDefaultUnitQuantity(3, factor)).toThrow('unit factor must be a finite positive number')
    },
  )

  it('rejects a non-finite entered quantity', () => {
    expect(() => toDefaultUnitQuantity(Number.NaN, 2)).toThrow('quantity must be finite')
  })
})
