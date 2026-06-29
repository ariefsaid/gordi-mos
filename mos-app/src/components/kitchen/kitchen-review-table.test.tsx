import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KitchenReviewTable } from './kitchen-review-table'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const LOGS: ReviewLogRow[] = [
  {
    id: 'r1', log_date: '2026-06-22', action_type: 'Production',
    wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
    status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-22T08:00:00Z',
  },
  {
    id: 'r2', log_date: '2026-06-22', action_type: 'Transfer to Radiant',
    wip_item_id: 'w2', wip_item_name: 'Cold Brew', qty_porsi: 10, notes: 'late',
    status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-22T09:00:00Z',
  },
]
const PLAN_MAP: PlanMap = {
  w1: { Production: 20 },
  w2: { 'Transfer to Radiant': 8 },
}

describe('KitchenReviewTable', () => {
  it('renders Production-first grouped regions with bulk actions and queue columns', () => {
    render(
      <KitchenReviewTable
        groups={[
          { action: 'Production', rows: [LOGS[0]] },
          { action: 'Transfer to Radiant', rows: [LOGS[1]] },
        ]}
        planMap={PLAN_MAP}
        peopleMap={new Map([['p1', 'Budi'], ['p2', 'Eka']])}
        productionPending={true}
        bulkEligible={action => action === 'Production' ? [LOGS[0]] : []}
        bulkAction={null}
        submittingId={null}
        isOnline={true}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onBulkApprove={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Production' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Transfer to Radiant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve all \(1\).*production/i })).toBeInTheDocument()
    expect(screen.getByText(/blocked until production approved/i)).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: /decision|item|submitter|note|time|plan vs logged/i }).length).toBeGreaterThan(0)
  })
})
