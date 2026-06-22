import { useMemo } from 'react'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

export function computeStockKpis(rows: KitchenStockRow[]): KitchenKpis {
  let onHandTotal = 0
  let availableTotal = 0
  let negativeCount = 0

  for (const r of rows) {
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

export function computeStockKpiStripData(rows: KitchenStockRow[]): KitchenKpiStripData {
  let onHandTotal = 0
  let availableTotal = 0
  let inStockCount = 0
  let negativeCount = 0

  for (const row of rows) {
    onHandTotal += row.stok
    availableTotal += row.tersedia
    if (row.stok > 0) inStockCount += 1
    if (row.stok < 0 || row.tersedia < 0) negativeCount += 1
  }

  return {
    ariaLabel: 'Stock summary',
    phoneLabel: 'Stock',
    phoneValue: `${rows.length} items`,
    phoneMeta: `${availableTotal} available`,
    tiles: [
      {
        label: 'Total on-hand',
        value: String(onHandTotal),
        delta: `${rows.length} items`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'portions',
      },
      {
        label: 'Items in stock',
        value: String(inStockCount),
        delta: `${rows.length - inStockCount} empty/negative`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'with usable stock',
      },
      {
        label: 'Negative balances',
        value: String(negativeCount),
        delta: negativeCount > 0 ? 'needs review' : 'clear',
        deltaTone: negativeCount > 0 ? 'destructive' : 'success',
      },
      {
        label: 'Available total',
        value: String(availableTotal),
        delta: 'read-only',
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'transfer-ready',
      },
    ],
  }
}

export function useStockKpis(rows: KitchenStockRow[]): KitchenKpis {
  return useMemo(() => computeStockKpis(rows), [rows])
}

export function useStockKpiStripData(rows: KitchenStockRow[]): KitchenKpiStripData {
  return useMemo(() => computeStockKpiStripData(rows), [rows])
}
