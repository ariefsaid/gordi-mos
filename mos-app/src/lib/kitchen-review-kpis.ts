// The review band's derivation, reshaped for the DESIGN.md "Metric summary rule"
// (DD-WAY-40, ratified OD-WAY-74): the band is ONE inline line of label:value
// metrics, not four KPI tiles. The old shape's 'Production gate' tile put a WORD
// ('open'/'clear') in the number slot — the exact defect class DD-WAY-40 kills —
// and its state already renders per-group as the FR-042 gate message, so the rule
// would only restate it. Neutral deltas and restating captions are omitted by
// construction: the only delta this derivation ever emits is the off-plan
// note-gate, and only when an off-plan row exists to act on.
import { useMemo } from 'react'
import type { MessageKey } from '@/i18n/messages'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'
import { movementKey, streamKey } from '@/lib/kitchen-action-label'

// The plan map is keyed by MOVEMENT, not by the derived label (DD-WAY-13). Keying it by the
// label here would silently resolve every lookup to 0 — a plan-vs-logged column that always
// reads "off-plan" and never says why.
//
// #197/#198 fix: `streamPlans` is keyed by the row's OWN (branch, activity) stream
// (streamKey), not a single flat PlanMap for the whole queue. A queue that can span more
// than one stream and compares every row to ONE stream's plan silently mis-scores every
// row from a different stream — this was the exact defect #196 flagged for whoever ported
// this surface.
function planQtyFor(streamPlans: Map<string, PlanMap>, log: ReviewLogRow): number {
  const planMap = streamPlans.get(streamKey(log.branch_id, log.activity))
  return planMap?.[log.wip_item_id]?.[
    movementKey({ action: log.action, destinationBranchId: log.destination_branch_id })
  ] ?? 0
}

export interface ReviewSummaryDelta {
  key: MessageKey
  tone: 'destructive' | 'success'
}

export interface ReviewSummaryMetric {
  key: string
  label: MessageKey
  value: string
  delta?: ReviewSummaryDelta
}

export interface ReviewSummary {
  ariaLabel: MessageKey
  metrics: ReviewSummaryMetric[]
}

export function computeReviewSummary(logs: ReviewLogRow[], streamPlans: Map<string, PlanMap>): ReviewSummary {
  let onPlanCount = 0
  let offPlanCount = 0
  for (const log of logs) {
    if (log.qty_porsi === planQtyFor(streamPlans, log)) onPlanCount += 1
    else offPlanCount += 1
  }
  return {
    ariaLabel: 'kitchen.review.summary.aria',
    metrics: [
      { key: 'submitted', label: 'kitchen.review.summary.submitted', value: String(logs.length) },
      { key: 'onPlan', label: 'kitchen.review.summary.onPlan', value: String(onPlanCount) },
      {
        key: 'offPlan',
        label: 'kitchen.review.summary.offPlan',
        value: String(offPlanCount),
        delta: offPlanCount > 0
          ? { key: 'kitchen.review.summary.noteGate', tone: 'destructive' }
          : undefined,
      },
    ],
  }
}

export function useReviewSummary(logs: ReviewLogRow[], streamPlans: Map<string, PlanMap>): ReviewSummary {
  return useMemo(() => computeReviewSummary(logs, streamPlans), [logs, streamPlans])
}