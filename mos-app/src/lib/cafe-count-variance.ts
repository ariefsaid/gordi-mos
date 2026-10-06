const DECIMAL_QUANTITY = /^([+-]?)(\d+)(?:[.,](\d{1,4}))?$/
const SCALE = 10_000n

function toScaledDecimal(value: string): bigint {
  const match = DECIMAL_QUANTITY.exec(value.trim())
  if (!match) throw new Error('Count quantities must be decimals with at most four places')
  const [, sign, whole, fraction = ''] = match
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0') || '0')
  if (sign === '-' && scaled !== 0n) return -scaled
  return scaled
}

function fromScaledDecimal(value: bigint): string {
  if (value === 0n) return '0'
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const whole = absolute / SCALE
  const fraction = (absolute % SCALE).toString().padStart(4, '0').replace(/0+$/, '')
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`
}

/** Exact four-decimal subtraction; a Recount, when present, is the final Count. */
export function calculateCafeCountVariance(counted: string, recount: string | null, expected: string): string {
  const finalCount = toScaledDecimal(recount ?? counted)
  if (finalCount < 0n) throw new Error('A Count cannot be negative')
  return fromScaledDecimal(finalCount - toScaledDecimal(expected))
}

/** Numeric(14,4) display values can include trailing zeroes; compare their stored value exactly. */
export function areCafeCountDecimalsEqual(left: string, right: string): boolean {
  return toScaledDecimal(left) === toScaledDecimal(right)
}
