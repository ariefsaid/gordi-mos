import { useMemo } from 'react'
import type { KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'

function planQtyFor(planMap: PlanMap, log: ReviewLogRow): number {
  return planMap[log.wip_item_id]?.[log.action_type] ?? 0
}

export function computeReviewKpis(logs: ReviewLogRow[], planMap: PlanMap): KitchenKpiStripData {
  let onPlanCount = 0
  let offPlanCount = 0
  let transferWaiting = 0
  const productionPending = logs.some(log => log.action_type === 'Production')

  for (const log of logs) {
    if (log.qty_porsi === planQtyFor(planMap, log)) onPlanCount += 1
    else offPlanCount += 1
    if (productionPending && log.action_type !== 'Production') transferWaiting += 1
  }

  return {
    ariaLabel: 'Review summary',
    phoneLabel: 'Review',
    phoneValue: `${logs.length} submitted`,
    phoneMeta: `${offPlanCount} off-plan`,
    tiles: [
      {
        label: 'Submitted',
        value: String(logs.length),
        delta: productionPending ? 'production first' : 'queue clear order',
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'awaiting decision',
      },
      {
        label: 'On-plan',
        value: String(onPlanCount),
        delta: `${logs.length} in queue`,
        deltaTone: 'success',
        sub: 'ready to approve',
      },
      {
        label: 'Off-plan',
        value: String(offPlanCount),
        delta: offPlanCount > 0 ? 'note gate on approve' : 'none',
        deltaTone: offPlanCount > 0 ? 'destructive' : 'success',
      },
      {
        label: 'Production gate',
        value: productionPending ? 'open' : 'clear',
        delta: transferWaiting > 0 ? `${transferWaiting} transfer waiting` : 'no transfer blocked',
        deltaTone: transferWaiting > 0 ? 'destructive' : 'success',
      },
    ],
  }
}

export function useReviewKpis(logs: ReviewLogRow[], planMap: PlanMap): KitchenKpiStripData {
  return useMemo(() => computeReviewKpis(logs, planMap), [logs, planMap])
}
