// KitchenReviewRow tests — TDD, AC-tagged.
// One Submitted-log row in the ops_lead review queue (S3 first cut, inline
// approve/reject — no drawer per design-plan §7.1 D4). Covers:
//  - plan-vs-logged display + variance Tag (on-plan vs off-plan) — FR-040
//  - Approve / Reject inline actions — FR-041
//  - Reject reveals a REQUIRED review-note field; blocks reject until filled — AC-041
//  - Approve REQUIRES a note when qty deviates from plan — AC-040
//  - production-first gate disables Approve (Reject stays live) — AC-042
//  - submitting → both actions disabled (per-row) — confirmed-only
//  - a11y: every control labelled; note field reachable.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KitchenReviewRow } from './kitchen-review-row'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const BASE: ReviewLogRow = {
  id: 'log-1',
  log_date: '2026-06-20',
  action_type: 'Production',
  wip_item_id: 'w1',
  wip_item_name: 'Nasi Goreng',
  qty_porsi: 8,
  notes: 'kurang bahan',
  status: 'Submitted',
  submitted_by: 'p1',
  business_unit_id: 'kb',
  created_at: '2026-06-20T09:12:00Z',
}

function setup(over: Partial<React.ComponentProps<typeof KitchenReviewRow>> = {}) {
  const onApprove = vi.fn()
  const onReject = vi.fn()
  render(
    <table><tbody>
      <KitchenReviewRow
        log={BASE}
        planQty={12}
        submitterName="Budi Santoso"
        approveDisabled={false}
        approveDisabledReason=""
        submitting={false}
        onApprove={onApprove}
        onReject={onReject}
        {...over}
      />
    </tbody></table>,
  )
  return { onApprove, onReject }
}

beforeEach(() => vi.clearAllMocks())

describe('KitchenReviewRow', () => {
  it('FR-040: shows the WIP item, plan-vs-logged, submitter, submit note', () => {
    setup()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    // plan 12 · logged 8 (the qty meta — exact "plan", not the off-plan/on-plan Tag)
    expect(screen.getByText('plan')).toBeInTheDocument()
    expect(screen.getByText('· logged')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument()
    expect(screen.getByText(/kurang bahan/)).toBeInTheDocument()
  })

  it('FR-040: shows an OFF-PLAN variance Tag when logged ≠ plan', () => {
    setup({ planQty: 12, log: { ...BASE, qty_porsi: 8 } })
    expect(screen.getByText(/off.plan/i)).toBeInTheDocument()
  })

  it('FR-040: shows an ON-PLAN variance Tag when logged == plan', () => {
    setup({ planQty: 8, log: { ...BASE, qty_porsi: 8 } })
    expect(screen.getByText(/on.plan/i)).toBeInTheDocument()
  })

  it('FR-041: Approve with no variance (on-plan) calls onApprove without a forced note', () => {
    const { onApprove } = setup({ planQty: 8, log: { ...BASE, qty_porsi: 8 } })
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    expect(onApprove).toHaveBeenCalledWith('log-1', null)
  })

  it('AC-040: Approve when qty DEVIATES from plan reveals a required note + blocks until filled', () => {
    const { onApprove } = setup({ planQty: 12, log: { ...BASE, qty_porsi: 8 } })
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    // first click reveals the note gate, does NOT approve
    expect(onApprove).not.toHaveBeenCalled()
    const note = screen.getByRole('textbox', { name: /approve note for nasi goreng/i })
    expect(note).toBeInTheDocument()
    // fill + confirm
    fireEvent.change(note, { target: { value: 'short on stock' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm approve/i }))
    expect(onApprove).toHaveBeenCalledWith('log-1', 'short on stock')
  })

  it('AC-041: Reject reveals a required note and blocks reject until it is filled', () => {
    const { onReject } = setup()
    fireEvent.click(screen.getByRole('button', { name: /reject nasi goreng/i }))
    expect(onReject).not.toHaveBeenCalled()
    const note = screen.getByRole('textbox', { name: /reject note for nasi goreng/i })
    expect(note).toBeInTheDocument()
    // confirm with blank note → still blocked
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    expect(onReject).not.toHaveBeenCalled()
    fireEvent.change(note, { target: { value: 'wrong item' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    expect(onReject).toHaveBeenCalledWith('log-1', 'wrong item')
  })

  it('AC-042: production-first gate disables Approve but leaves Reject live', () => {
    const { onReject } = setup({
      approveDisabled: true,
      approveDisabledReason: 'Finish Production approvals first.',
    })
    const approve = screen.getByRole('button', { name: /approve nasi goreng/i })
    expect(approve).toBeDisabled()
    expect(approve).toHaveAttribute('title', 'Finish Production approvals first.')
    // Reject stays live
    const reject = screen.getByRole('button', { name: /reject nasi goreng/i })
    expect(reject).not.toBeDisabled()
    fireEvent.click(reject)
    const note = screen.getByRole('textbox', { name: /reject note/i })
    fireEvent.change(note, { target: { value: 'no' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    expect(onReject).toHaveBeenCalled()
  })

  it('confirmed-only: while submitting, both Approve and Reject are disabled', () => {
    setup({ submitting: true })
    expect(screen.getByRole('button', { name: /approve nasi goreng/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reject nasi goreng/i })).toBeDisabled()
  })
})
