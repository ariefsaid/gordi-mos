// Exact decimal quantities for Café Records. Sums never pass through binary floating point, so a
// month of 0.1 + 0.2 style entries reads 0,3, not 0,30000000000000004. A quantity is a BigInt
// scaled by 10^SCALE; anything with more fractional digits than that is kept as parsed up to SCALE.

const DECIMAL_SCALE = 9
const FACTOR = 10n ** BigInt(DECIMAL_SCALE)

/** A scaled integer: value = n / 10^DECIMAL_SCALE. */
export type Dec = bigint

export const ZERO: Dec = 0n

/** Parse a database numeric (number or string). Null for anything that is not a finite decimal. */
export function parseDecimal(value: unknown): Dec | null {
  if (value === null || value === undefined) return null
  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    text = /e/i.test(String(value)) ? value.toFixed(DECIMAL_SCALE) : String(value)
  } else if (typeof value === 'string') {
    text = value.trim()
  } else return null
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text)
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null
  const whole = BigInt(match[2] || '0')
  const fraction = (match[3] ?? '').slice(0, DECIMAL_SCALE).padEnd(DECIMAL_SCALE, '0')
  const magnitude = whole * FACTOR + BigInt(fraction || '0')
  return match[1] === '-' ? -magnitude : magnitude
}

export function addDec(a: Dec, b: Dec): Dec { return a + b }

export function compareDec(a: Dec, b: Dec): number { return a < b ? -1 : a > b ? 1 : 0 }

/**
 * Format with id-ID conventions in BOTH locales (owner spec): '.' groups thousands, ',' marks the
 * decimal, no compact notation, trailing zeros trimmed, every source digit kept.
 */
export function formatDec(value: Dec): string {
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const whole = (magnitude / FACTOR).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const fraction = (magnitude % FACTOR).toString().padStart(DECIMAL_SCALE, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `,${fraction}` : ''}`
}
