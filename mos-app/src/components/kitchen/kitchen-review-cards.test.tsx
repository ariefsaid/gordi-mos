import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KitchenReviewCards } from './kitchen-review-cards'
import type { PlanMap, ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const LOGS: ReviewLogRow[] = [
  {
    id: 'r1', log_date: '2026-06-22', action_type: 'Production',
    wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
    status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-22T08:00:00Z',
  },
]
const PLAN_MAP: PlanMap = { w1: { Production: 20 } }

describe('KitchenReviewCards', () => {
  it('renders one-card-per-row on phone with the same actions live', () => {
    render(
      <KitchenReviewCards
        groups={[{ action: 'Production', rows: LOGS }]}
        planMap={PLAN_MAP}
        peopleMap={new Map([['p1', 'Budi']])}
        productionPending={true}
        bulkEligible={() => LOGS}
        bulkAction={null}
        submittingId={null}
        isOnline={true}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onBulkApprove={vi.fn()}
      />,
    )

    expect(screen.getByRole('region', { name: 'Production' })).toBeInTheDocument()
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve ayam bakar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject ayam bakar/i })).toBeInTheDocument()
  })
})
