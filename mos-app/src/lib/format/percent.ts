// format/percent.ts — the ONE canonical locale-aware percent formatter (census
// g-money r5 F-2). Before this module three formats coexisted on one surface:
// Detail Share "23.1%" (raw period), Margin "36,7%" (hand-rolled comma), Pricing
// "80%" (integer) — same page family, three separators. Every percent string now
// resolves through id-ID Intl (COMMA decimals, matching format/money's id-ID
// grouping); precision stays a per-semantic choice, the separator never is.

const cache = new Map<number, Intl.NumberFormat>()

function fmt(decimals: number): Intl.NumberFormat {
  let f = cache.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('id-ID', {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    cache.set(decimals, f)
  }
  return f
}

/**
 * Format a 0..1 fraction as an id-ID percent string ("0.367 → 36,7%").
 * `decimals` is the fixed precision (default 1); null renders the em-dash
 * placeholder so callers never print "NaN%".
 */
export function formatPercent(frac: number | null, decimals = 1): string {
  if (frac == null || !Number.isFinite(frac)) return '—'
  return fmt(decimals).format(frac)
}

/**
 * A change as a signed id-ID percent: "+3,2%", "−24,9%" (the minus sign U+2212, never a hyphen),
 * and "0,0%" with no sign when it rounds to nothing. The sign is part of the text so a change
 * reads the same without colour.
 */
export function formatSignedPercent(frac: number, decimals = 1): string {
  const text = fmt(decimals).format(Math.abs(frac))
  if (text === fmt(decimals).format(0)) return text
  return `${frac > 0 ? '+' : '\u2212'}${text}`
}

const pointsFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** A difference between two 0..1 fractions as signed percentage points with id-ID comma decimals:
 *  0.072 → "+7,2", −0.005 → "−0,5", and "0,0" when it rounds to nothing. The unit is the caller's. */
export function formatSignedPoints(frac: number): string {
  const text = pointsFmt.format(Math.abs(frac * 100))
  if (text === pointsFmt.format(0)) return text
  return `${frac > 0 ? '+' : '−'}${text}`
}
