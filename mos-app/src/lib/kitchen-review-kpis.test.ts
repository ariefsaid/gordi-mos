import { describe, it, expect } from 'vitest'
import { computeReviewSummary } from './kitchen-review-kpis'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const BRANCH_ID = 'branch-rumah-rames'
const RADIANT_ID = 'branch-radiant'
const STREAM_KEY = `${BRANCH_ID}|kitchen`

const LOGS: ReviewLogRow[] = [
  {
    id: 'r1', log_date: '2026-06-22', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
    branch_id: BRANCH_ID, activity: 'kitchen',
    wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
    status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-22T08:00:00Z',
  },
  {
    id: 'r2', log_date: '2026-06-22', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
    branch_id: BRANCH_ID, activity: 'kitchen',
    wip_item_id: 'w2', wip_item_name: 'Sambal', qty_porsi: 7, notes: 'extra',
    status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-22T09:00:00Z',
  },
  {
    id: 'r3', log_date: '2026-06-22', action_type: 'Transfer to Radiant', action: 'transfer' as const, destination_branch_id: RADIANT_ID,
    branch_id: BRANCH_ID, activity: 'kitchen',
    wip_item_id: 'w3', wip_item_name: 'Cold Brew', qty_porsi: 10, notes: null,
    status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-22T10:00:00Z',
  },
]

// Keyed by MOVEMENT ('produce' | 'transfer:<destinationBranchId>'), not the derived label —
// the real fetchPlanMap contract (DD-WAY-13). Keying by the derived label ('Production',
// 'Transfer to Radiant') silently resolves every lookup to 0 — this fixture previously did
// that and on-plan/off-plan always came out 0/3. w1 on-plan (20==20), w2 off-plan (7 != 10),
// w3 on-plan (10==10).
const PLAN_MAP: PlanMap = {
  w1: { produce: 20 },
  w2: { produce: 10 },
  w3: { [`transfer:${RADIANT_ID}`]: 10 },
}
const STREAM_PLANS = new Map<string, PlanMap>([[STREAM_KEY, PLAN_MAP]])

describe('computeReviewSummary — the summary-rule derivation (DD-WAY-40)', () => {
  it('derives Submitted / On-plan / Off-plan against each row’s own stream plan', () => {
    const s = computeReviewSummary(LOGS, STREAM_PLANS)
    expect(s.ariaLabel).toBe('kitchen.review.summary.aria')
    expect(s.metrics.map(m => m.label)).toEqual([
      'kitchen.review.summary.submitted',
      'kitchen.review.summary.onPlan',
      'kitchen.review.summary.offPlan',
    ])
    // w1 on-plan (20==20), w2 off-plan (7 != 10), w3 on-plan (10==10)
    expect(s.metrics.map(m => m.value)).toEqual(['3', '2', '1'])
  })

  it('off-plan > 0 → the destructive note-gate delta; no other metric carries one', () => {
    const s = computeReviewSummary(LOGS, STREAM_PLANS)
    expect(s.metrics[2].delta).toEqual({ key: 'kitchen.review.summary.noteGate', tone: 'destructive' })
    expect(s.metrics[0].delta).toBeUndefined()
    expect(s.metrics[1].delta).toBeUndefined()
  })

  it('a fully on-plan queue carries no delta at all (neutral deltas are omitted)', () => {
    const s = computeReviewSummary([LOGS[0]], STREAM_PLANS) // 20 == 20
    expect(s.metrics[2].value).toBe('0')
    expect(s.metrics.every(m => m.delta === undefined)).toBe(true)
  })

  it('no metric puts a word in the number slot (DD-WAY-40 kills the open/clear tile)', () => {
    const s = computeReviewSummary([], STREAM_PLANS)
    expect(s.metrics.every(m => /^\d+$/.test(m.value))).toBe(true)
  })
})