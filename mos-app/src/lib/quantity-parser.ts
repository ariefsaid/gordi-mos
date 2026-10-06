export type QuantityParseReason = 'format' | 'ambiguous' | 'negative' | 'integer' | 'range' | 'precision'

export type QuantityParseResult =
  | { kind: 'empty' }
  | { kind: 'valid'; value: number; normalized: string }
  | { kind: 'invalid'; reason: QuantityParseReason }

export interface QuantityParseOptions {
  integerOnly?: boolean
  min?: number
  max?: number
  maxIntegerDigits?: number
  maxFractionDigits?: number
}

/**
 * Parse one ungrouped quantity. Both comma and point are accepted as decimal marks, but
 * combined/repeated marks and three-digit grouping-shaped strings are refused instead of guessed.
 */
export function parseQuantityInput(raw: string, options: QuantityParseOptions = {}): QuantityParseResult {
  const value = raw.trim()
  if (value === '') return { kind: 'empty' }
  if (value.startsWith('-')) return { kind: 'invalid', reason: 'negative' }

  const marks = [...value].filter(char => char === '.' || char === ',')
  if (marks.length > 1) return { kind: 'invalid', reason: 'ambiguous' }
  if (!/^[0-9]*[.,]?[0-9]*$/.test(value) || !/[0-9]/.test(value)) {
    return { kind: 'invalid', reason: 'format' }
  }

  const decimalMark = marks[0]
  if (options.integerOnly && decimalMark) return { kind: 'invalid', reason: 'integer' }
  const [integerPart = '', fractionPart = ''] = decimalMark ? value.split(decimalMark) : [value, '']
  const integerDigits = integerPart || '0'
  if (options.maxIntegerDigits !== undefined && integerDigits.length > options.maxIntegerDigits) {
    return { kind: 'invalid', reason: 'range' }
  }
  if (options.maxFractionDigits !== undefined && fractionPart.length > options.maxFractionDigits) {
    return { kind: 'invalid', reason: 'precision' }
  }

  const significantInteger = integerPart.replace(/^0+/, '')
  const couldBeGrouped = decimalMark && significantInteger.length > 0
    && significantInteger.length <= 3 && fractionPart.length === 3
  if (couldBeGrouped) return { kind: 'invalid', reason: 'ambiguous' }

  const normalizedInteger = integerDigits.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fractionPart.replace(/0+$/, '')
  const normalized = normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger
  const number = Number(normalized)
  if (!Number.isFinite(number)) return { kind: 'invalid', reason: 'range' }
  if (options.min !== undefined && number < options.min) return { kind: 'invalid', reason: 'range' }
  if (options.max !== undefined && number > options.max) return { kind: 'invalid', reason: 'range' }
  if (options.integerOnly && !Number.isInteger(number)) return { kind: 'invalid', reason: 'integer' }

  return { kind: 'valid', value: number, normalized }
}

/** Format a quantity for direct display in the viewer's locale without grouping. */
export function formatQuantityInput(value: number, locale: string, maximumFractionDigits = 3): string {
  if (!Number.isFinite(value) || value === 0) return ''
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits,
  }).format(value)
}
