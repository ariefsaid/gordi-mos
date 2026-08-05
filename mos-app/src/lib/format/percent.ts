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
