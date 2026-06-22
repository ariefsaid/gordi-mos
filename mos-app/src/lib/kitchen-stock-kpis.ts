// computeStockKpis — pure Stock KPI selector (OD-K-5 redesign §2.4, parity P-1).
// Maps KitchenStockRow[] onto the reused KitchenKpis shape that KitchenKpiStrip
// consumes. Derived display ONLY — client-side over already-fetched rows; no
// DB/RPC/fetch/ESB/persistence. Negatives are preserved in every sum (FR-061/AC-032)
// — they are never clamped to 0 here (the table/cards render the literal negative).
//
// OQ-3 mapping (flagged, owner-deferred): the strip reuses Log-centric labels. Stock
// surfaces its four meaningful numbers onto the 4 slots:
//   tile 1 "Planned total"   → Items count          (plannedTotal = rows.length)
//   tile 2 "Made so far"     → On-hand total        (madeSoFar = Σ stok)
//   tile 3 "% complete"      → Deficit rate         (pctComplete = neg/items*100)
//   tile 4 "Items remaining" → Available total      (itemsRemaining = Σ tersedia)
// madeOfPlan === plannedTotal so the strip's "−N vs plan" delta never shows a false
// deficit on a read-only glance surface.

import { useMemo } from 'react'
import type { KitchenKpis } from '@/lib/kitchen-kpis'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

/**
 * The pure Stock-KPI core (§2.4). Unit-tested directly — no React, no mocks.
 */
export function computeStockKpis(rows: KitchenStockRow[]): KitchenKpis {
  let onHandTotal = 0
  let availableTotal = 0
  let negativeCount = 0

  for (const r of rows) {
    // negatives preserved in the sums (FR-061/AC-032 — never clamped)
    onHandTotal += r.stok
    availableTotal += r.tersedia
    if (r.stok < 0) negativeCount += 1
  }

  const itemCount = rows.length
  const deficitPct = itemCount > 0 ? Math.round((negativeCount / itemCount) * 100) : 0

  return {
    plannedTotal: itemCount,
    madeOfPlan: itemCount,
    madeSoFar: onHandTotal,
    madeOffPlan: 0,
    pctComplete: deficitPct,
    itemsRemaining: availableTotal,
    unitsShort: 0,
    plannedDishCount: itemCount,
  }
}

/**
 * Thin memoized hook wrapper for the Stock page (mirrors useKitchenKpis / usePlanKpis).
 */
export function useStockKpis(rows: KitchenStockRow[]): KitchenKpis {
  return useMemo(() => computeStockKpis(rows), [rows])
}
