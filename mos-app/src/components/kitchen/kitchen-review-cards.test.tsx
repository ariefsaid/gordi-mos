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

function renderCards() {
  return render(
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
}

describe('KitchenReviewCards', () => {
  it('renders one-card-per-row on phone with the same actions live', () => {
    renderCards()

    expect(screen.getByRole('region', { name: 'Production' })).toBeInTheDocument()
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve ayam bakar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject ayam bakar/i })).toBeInTheDocument()
  })

  it('phone: Approve and Reject buttons are present in the DOM (not clipped off-screen)', () => {
    // Regression: the original card layout wrapped KitchenReviewRow (a 6-column <tr>)
    // inside a bare <table> with no mobile reflow — at 390px the actions cell scrolled
    // off the right edge.  The fix: .krc-card uses a stacked layout so both buttons are
    // reachable without horizontal scrolling.
    renderCards()
    const approveBtn = screen.getByRole('button', { name: /approve ayam bakar/i })
    const rejectBtn = screen.getByRole('button', { name: /reject ayam bakar/i })
    // Buttons exist and are NOT inside a horizontally-overflowing ancestor.
    // We verify they are within the .krc-card container (not the wide table layout).
    const card = document.querySelector('.krc-card')
    expect(card).not.toBeNull()
    expect(card).toContain(approveBtn)
    expect(card).toContain(rejectBtn)
  })

  it('phone: each card renders the stacked layout class (.krc-card-stacked)', () => {
    renderCards()
    // The card must carry the stacked-layout marker so the CSS media query
    // can target it and prevent horizontal overflow at <768px.
    const card = document.querySelector('.krc-card')
    expect(card).not.toBeNull()
    expect(card!.classList.contains('krc-card-stacked')).toBe(true)
  })
})
