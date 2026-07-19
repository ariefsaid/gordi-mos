// format/money.ts — the ONE canonical IDR money formatter (cohesion-debt
// 2026-07-19, item #1). id-ID grouping (DOTS) with the "Rp " prefix, rounded to
// whole rupiah (rupiah has no sen). Negatives carry a leading minus ("-Rp …").
// Every money string in the app resolves through this — no per-surface
// Intl.NumberFormat copies, no en-US commas.

const idGrouping = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** Format an IDR amount as "Rp 1.000.000" (id-ID dots, no decimals). */
export function formatIDR(amount: number): string {
  const grouped = idGrouping.format(Math.abs(Math.round(amount)))
  return `${amount < 0 ? '-' : ''}Rp ${grouped}`
}
