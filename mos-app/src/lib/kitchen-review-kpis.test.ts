import { describe, it, expect } from 'vitest'
import { computeReviewKpis } from './kitchen-review-kpis'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const LOGS: ReviewLogRow[] = [
  {
    id: 'r1', log_date: '2026-06-22', action_type: 'Production',
    wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
    status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-22T08:00:00Z',
  },
  {
    id: 'r2', log_date: '2026-06-22', action_type: 'Production',
    wip_item_id: 'w2', wip_item_name: 'Sambal', qty_porsi: 7, notes: 'extra',
    status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-22T09:00:00Z',
  },
  {
    id: 'r3', log_date: '2026-06-22', action_type: 'Transfer to Radiant',
    wip_item_id: 'w3', wip_item_name: 'Cold Brew', qty_porsi: 10, notes: null,
    status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-22T10:00:00Z',
  },
]

const PLAN_MAP: PlanMap = {
  w1: { Production: 20 },
  w2: { Production: 10 },
  w3: { 'Transfer to Radiant': 10 },
}

describe('computeReviewKpis', () => {
  it('returns review-specific labels and queue counts', () => {
    const data = computeReviewKpis(LOGS, PLAN_MAP)
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
    const data = computeReviewKpis(LOGS, PLAN_MAP)
    expect(data.tiles[3].delta).toBe('1 transfer waiting')
    expect(data.tiles[3].deltaTone).toBe('destructive')
  })

  it('shows a clear queue-empty state', () => {
    const data = computeReviewKpis([], {})
    expect(data.tiles[0].value).toBe('0')
    expect(data.tiles[3].value).toBe('clear')
    expect(data.phoneValue).toBe('0 submitted')
  })
})
