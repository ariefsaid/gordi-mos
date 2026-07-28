import { useMemo } from 'react'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'
import { useT, interpolate, type Translate } from '@/i18n/use-t'
import { messages } from '@/i18n/messages'

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

// harden (2026-07-28): every label, delta and sub-line below was a hardcoded English
// literal, so Café · Stock's whole KPI band stayed English in the Indonesian locale — on
// the module whose primary reader is floor staff. `t` is injected rather than read from
// context so the function stays pure and unit-testable; it is optional purely so the
// existing pure-compute tests keep their single-argument call shape.
export function computeStockKpiStripData(
  rows: KitchenStockRow[],
  t?: Translate,
): KitchenKpiStripData {
  const tr: Translate = t ?? ((key, vars) => interpolate(messages.en[key], vars))
  let onHandTotal = 0
  let availableTotal = 0
  let inStockCount = 0
  let negativeCount = 0
  let hasPopulatedStock = false

  for (const row of rows) {
    onHandTotal += row.stok
    availableTotal += row.tersedia
    if (row.stok > 0) inStockCount += 1
    if (row.stok < 0 || row.tersedia < 0) negativeCount += 1
    if (row.stok !== 0 || row.tersedia !== 0) hasPopulatedStock = true
  }

  return {
    ariaLabel: tr('kitchen.stock.kpi.ariaLabel'),
    phoneLabel: tr('kitchen.stock.kpi.phoneLabel'),
    phoneValue: tr('kitchen.stock.kpi.itemCount', { count: rows.length }),
    phoneMeta: tr('kitchen.stock.kpi.availableCount', { count: availableTotal }),
    tiles: [
      {
        // census FLAG-F: label the two bases so on-hand (161) vs available (7080) reads —
        // on-hand is the usable snapshot for the day; available is the cumulative
        // transfer-ready balance across all approved activity.
        label: tr('kitchen.stock.kpi.onHand'),
        value: String(onHandTotal),
        delta: tr('kitchen.stock.kpi.itemCount', { count: rows.length }),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: tr('kitchen.stock.kpi.onHand.sub'),
      },
      {
        label: tr('kitchen.stock.kpi.inStock'),
        value: String(inStockCount),
        delta: tr('kitchen.stock.kpi.inStock.delta', { count: rows.length - inStockCount }),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: tr('kitchen.stock.kpi.inStock.sub'),
      },
      {
        label: tr('kitchen.stock.kpi.negative'),
        value: String(negativeCount),
        delta:
          negativeCount > 0
            ? tr('kitchen.stock.kpi.negative.review')
            : hasPopulatedStock
              ? tr('kitchen.stock.kpi.negative.clear')
              : tr('kitchen.stock.kpi.negative.noData'),
        deltaTone: negativeCount > 0 ? 'destructive' : hasPopulatedStock ? 'success' : 'neutral',
      },
      {
        label: tr('kitchen.stock.kpi.available'),
        value: String(availableTotal),
        delta: tr('kitchen.stock.kpi.available.delta'),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: tr('kitchen.stock.kpi.available.sub'),
      },
    ],
  }
}

export function useStockKpis(rows: KitchenStockRow[]): KitchenKpis {
  return useMemo(() => computeStockKpis(rows), [rows])
}

export function useStockKpiStripData(rows: KitchenStockRow[]): KitchenKpiStripData {
  const t = useT()
  return useMemo(() => computeStockKpiStripData(rows, t), [rows, t])
}
