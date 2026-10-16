type DecimalFraction = { numerator: bigint; denominator: bigint }

function toDecimalFraction(value: number, label: string): DecimalFraction {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  const text = value.toString().toLowerCase()
  const [mantissa, exponentText] = text.split('e')
  const exponent = exponentText === undefined ? 0 : Number(exponentText)
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const [whole, decimal = ''] = unsigned.split('.')
  const digits = `${whole}${decimal}`.replace(/^0+(?=\d)/, '')
  let numerator = BigInt(digits || '0')
  let decimalPlaces = decimal.length - exponent
  if (decimalPlaces < 0) {
    numerator *= 10n ** BigInt(-decimalPlaces)
    decimalPlaces = 0
  }
  if (negative) numerator = -numerator
  return { numerator, denominator: 10n ** BigInt(decimalPlaces) }
}

function roundedProduct(left: number, right: number, places: number): number {
  const a = toDecimalFraction(left, 'quantity')
  const b = toDecimalFraction(right, 'unit factor')
  const numerator = a.numerator * b.numerator * (10n ** BigInt(places))
  const denominator = a.denominator * b.denominator
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  const quotient = magnitude / denominator
  const remainder = magnitude % denominator
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n)
  const result = Number(negative ? -rounded : rounded) / (10 ** places)
  if (!Number.isFinite(result)) throw new Error('converted quantity must be finite')
  return result
}

function roundedQuotient(dividend: number, divisor: number, places: number): number {
  const a = toDecimalFraction(dividend, 'quantity')
  const b = toDecimalFraction(divisor, 'unit factor')
  const numerator = a.numerator * b.denominator * (10n ** BigInt(places))
  const denominator = a.denominator * b.numerator
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  const quotient = magnitude / denominator
  const remainder = magnitude % denominator
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n)
  const result = Number(negative ? -rounded : rounded) / (10 ** places)
  if (!Number.isFinite(result)) throw new Error('converted quantity must be finite')
  return result
}

function validate(quantity: number, factor: number): void {
  if (!Number.isFinite(quantity)) throw new Error('quantity must be finite')
  if (quantity < 0) throw new Error('quantity must be non-negative')
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('unit factor must be a finite positive number')
  }
}

/** Convert a typed amount into the item's ERP default-unit quantity (numeric(12,2)). */
export function toDefaultUnitQuantity(quantity: number, factor: number): number {
  validate(quantity, factor)
  return roundedProduct(quantity, factor, 2)
}

/** Convert a default-unit amount into the selected multiple's two-place entry quantity. */
export function fromDefaultUnitQuantity(quantity: number, factor: number): number {
  validate(quantity, factor)
  return roundedQuotient(quantity, factor, 2)
}

/** Format a captured amount beside its unit, using the capture surface's number rules. */
export function formatQuantityWithUnit(quantity: number, unitName: string, locale?: string): string {
  const formattedQuantity = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }).format(quantity)
  return `${formattedQuantity} ${unitName}`
}

/** A locale-aware, stable label for a manager-defined multiple of a default ERP unit. */
export function formatUnitMultiple(factor: number, unitName: string, locale?: string): string {
  const formattedFactor = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 6 }).format(factor)
  return `${formattedFactor} ${unitName}`
}
