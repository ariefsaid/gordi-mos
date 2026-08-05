import { describe, it, expect } from 'vitest'
import { computeReviewKpis } from './kitchen-review-kpis'
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

describe('computeReviewKpis', () => {
  it('returns review-specific labels and queue counts', () => {
    const data = computeReviewKpis(LOGS, STREAM_PLANS)
    expect(data.ariaLabel).toBe('Review summary')
    expect(data.tiles.map(tile => tile.label)).toEqual([
      'Submitted',
      'On-plan',
      'Off-plan',
      'Production gate',
    ])
    expect(data.tiles.map(tile => tile.value)).toEqual(['3', '2', '1', 'open'])
  })

  it('marks the production gate blocked when transfer rows are waiting behind production', () => {
    const data = computeReviewKpis(LOGS, STREAM_PLANS)
    expect(data.tiles[3].delta).toBe('1 transfer waiting')
    expect(data.tiles[3].deltaTone).toBe('destructive')
  })

  it('shows a clear queue-empty state', () => {
    const data = computeReviewKpis([], new Map())
    expect(data.tiles[0].value).toBe('0')
    expect(data.tiles[3].value).toBe('clear')
    expect(data.phoneValue).toBe('0 submitted')
  })

  it('defect 247/197: a row from a stream with no fetched plan reads off-plan (0), never bleeds another stream\'s plan', () => {
    const OTHER_BRANCH_ID = 'branch-other'
    const OTHER_LOG: ReviewLogRow = {
      ...LOGS[0], id: 'r-other', branch_id: OTHER_BRANCH_ID, qty_porsi: 20,
    }
    // Only the ORIGINAL stream's plan was fetched — the second stream's plan is absent.
    const data = computeReviewKpis([...LOGS, OTHER_LOG], STREAM_PLANS)
    // Submitted count grows to 4; on-plan stays 2 (the new row from the unplanned stream
    // reads off-plan, not accidentally on-plan via the first stream's plan map).
    expect(data.tiles[0].value).toBe('4')
    expect(data.tiles[1].value).toBe('2')
    expect(data.tiles[2].value).toBe('2')
  })
})
