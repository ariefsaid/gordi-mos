// KitchenReviewPage tests — TDD, AC-tagged.
// S3 review/approve queue (ops_lead/admin only). Covers:
//  - role gate: a member sees a forbidden panel, NOT an empty table (FR-003/044)
//  - queue lists ONLY Submitted logs grouped by action_type (FR-040)
//  - approve calls the RPC with the right args (FR-050, AC-090)
//  - approve handles P0003 (already actioned) → friendly refresh (error→re-fetch)
//  - reject sends status=Rejected + note (FR-041, AC-041)
//  - production-first gate disables Transfer Approve while Production Submitted (AC-042)
//  - all states: loading, empty (good-empty), error+retry, forbidden, success (row leaves)
//
// #247/#197: every row's plan baseline is now looked up against ITS OWN (branch, activity)
// stream (streamKey), not one hardcoded stream — fetchPlanMap is mocked per the real
// contract (a PlanMap keyed by MOVEMENT — 'produce' | 'transfer:<destinationBranchId>' —
// never by the derived label string).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return {
    ...actual,
    listSubmittedKitchenLogs: vi.fn(),
    fetchPlanMap: vi.fn(),
    listStreamPairs: vi.fn(),
    approveKitchenLog: vi.fn(),
    rejectKitchenLog: vi.fn(),
  }
})
import {
  listSubmittedKitchenLogs,
  fetchPlanMap,
  listStreamPairs,
  approveKitchenLog,
  rejectKitchenLog,
  KitchenRpcError,
} from '@/lib/db/kitchen-logs'

// The viewer's own stream comes from the ONE resolver (#234 consolidation), which returns a
// ProductionStream resolved against the branch catalog — not the raw pair the deleted twin
// in kitchen-logs.ts returned.
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
import { fetchDefaultStream } from '@/lib/db/default-stream'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
import { getPeople } from '@/lib/db/directory'

// resolveDefaultCaptureStream (OD-WAY-28) reads the live branch catalog to resolve the
// stream the plan read is scoped to (kitchen-review-page.tsx fetchQueue) — un-mocked, it
// hits Supabase for real and every fetch lands in the error state. Same fixture shape as
// kitchen-log-page.test.tsx's BRANCHES.
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import { listActiveBranches } from '@/lib/db/branches'

// #238 (FR-031): the per-stream completeness confirmation is read on every queue load, so it
// must be mocked here for the same reason listActiveBranches is — un-mocked it hits Supabase and
// the whole page lands in the error state.
vi.mock('@/lib/db/stream-completeness', () => ({
  listStreamCompleteness: vi.fn(),
  confirmStreamComplete: vi.fn(),
}))
import { listStreamCompleteness, confirmStreamComplete } from '@/lib/db/stream-completeness'

import { KitchenReviewPage } from './kitchen-review-page'
import { rememberStream } from '@/lib/cafe-stream'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockList = vi.mocked(listSubmittedKitchenLogs)
const mockPlan = vi.mocked(fetchPlanMap)
const mockDefaultStream = vi.mocked(fetchDefaultStream)
const mockStreamPairs = vi.mocked(listStreamPairs)
const mockApprove = vi.mocked(approveKitchenLog)
const mockReject = vi.mocked(rejectKitchenLog)
const mockGetPeople = vi.mocked(getPeople)
const mockBranches = vi.mocked(listActiveBranches)
const mockCompleteness = vi.mocked(listStreamCompleteness)
const mockConfirmComplete = vi.mocked(confirmStreamComplete)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-lead', org_id: 'org-1', user_id: 'auth-1', full_name: 'Dina Lead',
        email: 'dina@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

// Both fixture logs originate from the SAME (branch, activity) stream — production and a
// transfer both happen at the one physical kitchen, whose books are Rumah Rames (OD-WAY-26).
const BRANCH_ID = 'branch-rumah-rames'
const RADIANT_ID = 'branch-radiant'
const BRANCHES = [
  { id: BRANCH_ID, code: 'rumah_rames', name: 'Rumah Rames' },
  { id: RADIANT_ID, code: 'radiant', name: 'Radiant' },
]

const PROD_LOG: ReviewLogRow = {
  id: 'log-prod', log_date: '2026-06-20', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
  branch_id: BRANCH_ID, activity: 'kitchen',
  wip_item_id: 'w1', wip_item_name: 'Nasi Goreng', qty_porsi: 8, notes: 'kurang bahan',
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T09:12:00Z',
}
const XFER_LOG: ReviewLogRow = {
  id: 'log-xfer', log_date: '2026-06-20', action_type: 'Transfer to Radiant', action: 'transfer' as const, destination_branch_id: RADIANT_ID,
  branch_id: BRANCH_ID, activity: 'kitchen',
  wip_item_id: 'w2', wip_item_name: 'Cold Brew', qty_porsi: 42, notes: null,
  status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-20T13:02:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  // #440: the stream chosen anywhere in Café is remembered module-wide (sessionStorage) and
  // outranks the FR-041 role default — so clear it per test, or one test's switch decides the
  // next test's opening filter.
  rememberStream(null)
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockList.mockResolvedValue([])
  mockPlan.mockResolvedValue({})
  // #236: the review page resolves the viewer's own stream (filter default, FR-041) and
  // the enumerable stream catalog (the filter's options) on every load.
  mockDefaultStream.mockResolvedValue(null)
  mockStreamPairs.mockResolvedValue([
    { branch_id: BRANCH_ID, activity: 'kitchen' },
    { branch_id: RADIANT_ID, activity: 'bar' },
  ])
  mockBranches.mockResolvedValue(BRANCHES)
  mockGetPeople.mockResolvedValue([
    { id: 'p1', full_name: 'Budi Santoso' },
    { id: 'p2', full_name: 'Eka' },
  ])
  // #238: no stream has been confirmed complete unless a test says so.
  mockCompleteness.mockResolvedValue([])
})

describe('KitchenReviewPage — role gate (FR-003/044)', () => {
  it('a member sees a forbidden panel — NOT an empty table', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/review']}>
        <I18nProvider><KitchenReviewPage /></I18nProvider>
      </MemoryRouter>,
    )
    // #236 copy: review is open to stream supervisors AND ops leads — a member still gets neither
    expect(await screen.findByText(/available to stream supervisors and ops leads/i)).toBeInTheDocument()
    // the queue read is never even attempted for a member
    expect(mockList).not.toHaveBeenCalled()
    // Back to Log must resolve via the SPA router — not a raw href that causes a full reload
    const backLink = screen.getByRole('link', { name: /back to log/i })
    expect(backLink).toHaveAttribute('href', '/mos/cafe/log')
  })

  it('an admin is allowed (not forbidden)', async () => {
    mockUseAuth.mockReturnValue(viewer(['admin']))
    render(<KitchenReviewPage />, { wrapper })
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })
})

describe('KitchenReviewPage — states', () => {
  it('loading: shows a busy skeleton while the queue loads', () => {
    mockList.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenReviewPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: renders the shared awaiting EmptyState when no Submitted logs', async () => {
    mockList.mockResolvedValue([])
    render(<KitchenReviewPage />, { wrapper })
    expect(await screen.findByText(/nothing to review/i)).toBeInTheDocument()

    const emptyState = screen.getByTestId('empty-state')
    expect(emptyState).toHaveAttribute('data-empty-variant', 'awaiting')
    expect(emptyState.querySelector('.empty-state-icon')).not.toBeNull()
    expect(emptyState.querySelector('.empty-title')).not.toBeNull()
    expect(emptyState.querySelector('.empty-copy')).not.toBeNull()
    expect(emptyState.querySelector('.empty-note')).not.toBeNull()
  })

  it('W4-4: empty state routes through EmptyState with exactly one refresh action', async () => {
    mockList.mockResolvedValue([])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText(/nothing to review/i)

    const emptyState = screen.getByTestId('empty-state')
    const emptyActions = emptyState.querySelector('.empty-actions')
    expect(emptyActions).not.toBeNull()
    expect(emptyActions!.querySelectorAll('button, a')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockList.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([PROD_LOG])
    render(<KitchenReviewPage />, { wrapper })
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
  })
})

describe('KitchenReviewPage — queue (FR-040)', () => {
  it('lists ONLY Submitted logs grouped by action_type', async () => {
    // force the DESKTOP table branch so the DataTable group-header rows + the
    // review columns render (jsdom matchMedia defaults to phone/cards)
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(min-width: 768px)',
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList)
    try {
      mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
      // Keyed by MOVEMENT ('produce' | 'transfer:<destinationBranchId>'), per DD-WAY-13 —
      // planQtyFor() in kitchen-review-page.tsx looks up movementKey(), never the label.
      mockPlan.mockResolvedValue({ w1: { produce: 12 }, w2: { [`transfer:${RADIANT_ID}`]: 40 } })
      render(<KitchenReviewPage />, { wrapper })
      expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
      expect(screen.getByText('Cold Brew')).toBeInTheDocument()
      // one DataTable group per action_type, Production first (FR-042's gate)
      const groupLabels = document.querySelectorAll('.dt-group-label')
      expect(groupLabels).toHaveLength(2)
      expect(groupLabels[0].textContent).toBe('Production')
      expect(groupLabels[1].textContent).toBe('Transfer to Radiant')
      // the shared review queue columns render (folded from the retired review-table test)
      const ths = Array.from(document.querySelectorAll('thead th'))
      expect(ths.map(th => th.textContent)).toEqual([
        'Item', 'Plan vs logged', 'Submitter', 'Time', 'Note', 'Decision',
      ])
      // rows land under their owning group, in source order (Nasi Goreng under
      // Production, above the Transfer to Radiant header)
      const trs = Array.from(document.querySelector('tbody')!.querySelectorAll('tr'))
      const prodHeaderIdx = trs.findIndex(tr => tr.textContent?.includes('Production'))
      const xferHeaderIdx = trs.findIndex(tr => tr.textContent?.includes('Transfer to Radiant'))
      const nasiIdx = trs.findIndex(tr => tr.textContent?.includes('Nasi Goreng'))
      expect(nasiIdx).toBeGreaterThan(prodHeaderIdx)
      expect(nasiIdx).toBeLessThan(xferHeaderIdx)
    } finally {
      matchMediaSpy.mockRestore()
    }
  })

  it('defect 247/196 regression: a log whose destination is a THIRD branch still gets its own group (not silently dropped)', async () => {
    // Before this fix, the queue grouped through a hardcoded 3-literal ACTION_ORDER
    // (Production / Transfer to Radiant / Transfer to Bungur) — a log naming any OTHER
    // destination matched none of the three and never appeared in any group.
    const THIRD_ID = 'branch-third'
    const THIRD_LOG: ReviewLogRow = {
      ...XFER_LOG, id: 'log-third', action_type: 'Transfer to Sudirman', destination_branch_id: THIRD_ID,
      wip_item_id: 'w3', wip_item_name: 'Es Teh',
    }
    mockList.mockResolvedValue([THIRD_LOG])
    render(<KitchenReviewPage />, { wrapper })
    expect(await screen.findByText('Es Teh')).toBeInTheDocument()
  })

  it('plan variance is looked up against the ROW\'S OWN stream, not a single hardcoded one (#247/#197)', async () => {
    // A second stream (a different branch) carries a log for the SAME wip item — its plan
    // must not bleed into the first stream's variance reading.
    const OTHER_BRANCH_ID = 'branch-other'
    const OTHER_LOG: ReviewLogRow = {
      ...PROD_LOG, id: 'log-other', branch_id: OTHER_BRANCH_ID, wip_item_id: 'w1', qty_porsi: 99,
    }
    mockBranches.mockResolvedValue([...BRANCHES, { id: OTHER_BRANCH_ID, code: 'other', name: 'Other' }])
    mockList.mockResolvedValue([PROD_LOG, OTHER_LOG])
    // Two distinct streams present → fetchPlanMap called once per stream.
    mockPlan.mockImplementation(async (_date, stream) =>
      stream.branch.id === BRANCH_ID ? { w1: { produce: 8 } } : { w1: { produce: 99 } })
    render(<KitchenReviewPage />, { wrapper })
    // Both rows share the same wip item name — wait for both to land.
    await waitFor(() => expect(screen.getAllByText('Nasi Goreng')).toHaveLength(2))
    await waitFor(() => expect(mockPlan).toHaveBeenCalledTimes(2))
    // Both rows read on-plan (8==8 in stream 1, 99==99 in stream 2) — neither row's variance
    // was computed against the WRONG stream's plan.
    const tags = document.querySelectorAll('.krow-variance')
    expect(Array.from(tags).every(tag => tag.textContent?.includes('on-plan'))).toBe(true)
  })

  it('shows the production-first gate message on a blocked Transfer group (FR-042)', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
    mockPlan.mockResolvedValue({})
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Cold Brew')
    expect(screen.getByText(/blocked until production approved/i)).toBeInTheDocument()
  })
})

describe('KitchenReviewPage — approve (FR-050, AC-090)', () => {
  it('on-plan approve calls the RPC with the log id + null note, then removes the row', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { produce: 8 } }) // plan == logged → on-plan
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-003' })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('log-prod', null))
    // confirmed batch id surfaced + row leaves the queue
    expect(await screen.findByText(/PR-20260620-003/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Nasi Goreng')).not.toBeInTheDocument())
  })

  it('AC: P0003 (already actioned) → friendly notice + re-fetch', async () => {
    mockList.mockResolvedValueOnce([PROD_LOG]).mockResolvedValueOnce([])
    mockPlan.mockResolvedValue({ w1: { produce: 8 } })
    mockApprove.mockRejectedValue(new KitchenRpcError('P0003', 'not Submitted'))
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    expect(await screen.findByText(/already reviewed/i)).toBeInTheDocument()
    // re-fetched the queue (now empty)
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  })
  it('AC-040: off-plan approve reveals a required note + blocks until filled', async () => {
    // folded from the retired kitchen-review-row suite (the page now owns the row)
    mockList.mockResolvedValue([PROD_LOG]) // qty 8
    mockPlan.mockResolvedValue({ w1: { produce: 12 } }) // plan 12 → off-plan
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-010' })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    // first click reveals the note gate, does NOT approve
    expect(mockApprove).not.toHaveBeenCalled()
    const note = screen.getByRole('textbox', { name: /approve note for nasi goreng/i })
    fireEvent.change(note, { target: { value: 'short on stock' } })
    // #400 v4 copy: the confirm names the OBJECT ("Approve Nasi Goreng"), never a bare
    // "Confirm approve" — same matcher as the idle button because the gate replaces it.
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('log-prod', 'short on stock'))
  })
})

describe('KitchenReviewPage — reject (FR-041, AC-041)', () => {
  it('reject sends status=Rejected + note via rejectKitchenLog, then removes the row', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { produce: 8 } })
    mockReject.mockResolvedValue(undefined)
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /reject nasi goreng/i }))
    const note = screen.getByRole('textbox', { name: /reject note for nasi goreng/i })
    fireEvent.change(note, { target: { value: 'wrong item' } })
    // #400 v4 copy: the destructive confirm names the OBJECT ("Reject Nasi Goreng").
    fireEvent.click(screen.getByRole('button', { name: /reject nasi goreng/i }))
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('log-prod', 'wrong item'))
    await waitFor(() => expect(screen.queryByText('Nasi Goreng')).not.toBeInTheDocument())
  })
})

describe('KitchenReviewPage — production-first gate (FR-042, AC-042)', () => {
  it('disables Transfer Approve while a Production log is still Submitted; Reject stays live', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
    mockPlan.mockResolvedValue({})
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Cold Brew')
    // the Transfer row's Approve is disabled …
    const xferApprove = screen.getByRole('button', { name: /approve cold brew/i })
    expect(xferApprove).toBeDisabled()
    // … and carries the gate reason as its title (AC-042, folded from the retired row suite)
    expect(xferApprove).toHaveAttribute('title', 'Finish Production approvals first.')
    // but the Production row's Approve is live
    expect(screen.getByRole('button', { name: /approve nasi goreng/i })).not.toBeDisabled()
    // and the Transfer Reject stays live
    expect(screen.getByRole('button', { name: /reject cold brew/i })).not.toBeDisabled()
  })
})

// ── Bulk approve (FR-043, AC-042 extension) ──────────────────────────────────
// #398, owner ruling 2026-08-20: bulk "Approve all on-plan (N)" clears ON-PLAN rows only.
// It used to inherit the old app's parity behaviour — approve EVERY Submitted row in the
// section with a null note — which let the surface's loudest control clear off-plan rows
// note-free, the exact gate the per-row path refuses to skip (AC-040 / FR-041). Off-plan
// rows now fall to the per-row path and keep their required note; N counts only the rows
// the button will actually touch, and the label says "on-plan" so it cannot quietly widen
// again. Production-first still gates the whole section (a Transfer bulk stays blocked
// while Production is pending).
const PROD_ONPLAN_A: ReviewLogRow = {
  id: 'log-a', log_date: '2026-06-20', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
  branch_id: BRANCH_ID, activity: 'kitchen',
  wip_item_id: 'wA', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T08:00:00Z',
}
const PROD_ONPLAN_B: ReviewLogRow = {
  id: 'log-b', log_date: '2026-06-20', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
  branch_id: BRANCH_ID, activity: 'kitchen',
  wip_item_id: 'wB', wip_item_name: 'Sambal', qty_porsi: 5, notes: null,
  status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-20T08:05:00Z',
}
const PROD_OFFPLAN: ReviewLogRow = {
  id: 'log-c', log_date: '2026-06-20', action_type: 'Production', action: 'produce' as const, destination_branch_id: null,
  branch_id: BRANCH_ID, activity: 'kitchen',
  wip_item_id: 'wC', wip_item_name: 'Tahu', qty_porsi: 7, notes: null,
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T08:10:00Z',
}

describe('KitchenReviewPage — bulk approve (FR-043, AC-042)', () => {
  it('issue 398: bulk scopes to ON-PLAN rows — the off-plan row is left to the per-row note gate', async () => {
    // 2 on-plan (A=20==plan, B=5==plan) + 1 off-plan (C=7 != plan 10) → N = 2, not 3.
    mockList.mockResolvedValue([PROD_ONPLAN_A, PROD_ONPLAN_B, PROD_OFFPLAN])
    mockPlan.mockResolvedValue({ wA: { produce: 20 }, wB: { produce: 5 }, wC: { produce: 10 } })
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-007' })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    // the label states the narrowed scope AND the narrowed count — a button that claimed
    // "(3)" would be claiming rows it must not touch
    const bulk = screen.getByRole('button', { name: /approve all on-plan \(2\) — Production/i })
    expect(bulk).toHaveTextContent('Approve all on-plan (2)')
    expect(screen.queryByRole('button', { name: /approve all on-plan \(3\)/i })).not.toBeInTheDocument()
    fireEvent.click(bulk)

    // only the two on-plan rows are approved; the off-plan row is never handed a null note
    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(2))
    expect(mockApprove).toHaveBeenCalledWith('log-a', null)
    expect(mockApprove).toHaveBeenCalledWith('log-b', null)
    expect(mockApprove).not.toHaveBeenCalledWith('log-c', null)

    // the on-plan rows leave the queue; the off-plan row stays, and its per-row Approve
    // still opens the required-note gate (AC-040) rather than committing
    await waitFor(() => expect(screen.queryByText('Ayam Bakar')).not.toBeInTheDocument())
    expect(screen.queryByText('Sambal')).not.toBeInTheDocument()
    expect(screen.getByText('Tahu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /approve tahu/i }))
    expect(await screen.findByRole('textbox', { name: /approve note for tahu/i })).toBeInTheDocument()
    expect(mockApprove).toHaveBeenCalledTimes(2)
  })

  it('AC-042: a Transfer group bulk-approve is blocked while a Production log is still Submitted', async () => {
    // one Submitted Production (blocks transfers) + one off-plan transfer
    const XFER_OFFPLAN: ReviewLogRow = {
      ...XFER_LOG, id: 'log-x2', wip_item_name: 'Latte', wip_item_id: 'wX', qty_porsi: 30,
    }
    mockList.mockResolvedValue([PROD_LOG, XFER_OFFPLAN])
    mockPlan.mockResolvedValue({ w1: { produce: 8 }, wX: { [`transfer:${RADIANT_ID}`]: 25 } }) // 30 != 25 → off-plan
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Latte')

    // Production bulk is offered (1 Submitted) and live
    expect(screen.getByRole('button', { name: /approve all on-plan \(1\)/i })).not.toBeDisabled()
    // the Transfer group's bulk approve is NOT offered while Production pending (production-first gate)
    expect(screen.queryByRole('button', { name: /approve all transfer to radiant/i })).not.toBeInTheDocument()
  })

  it('partial failure: P0003 rows drop, other errors keep the row + a succeeded/failed notice', async () => {
    mockList.mockResolvedValue([PROD_ONPLAN_A, PROD_ONPLAN_B])
    mockPlan.mockResolvedValue({ wA: { produce: 20 }, wB: { produce: 5 } })
    // A succeeds; B fails with a generic error (kept in queue)
    mockApprove
      .mockResolvedValueOnce({ batch_id: 'PR-20260620-009' })
      .mockRejectedValueOnce(new KitchenRpcError('XX000', 'db down'))
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    fireEvent.click(screen.getByRole('button', { name: /approve all on-plan \(2\)/i }))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(2))
    // A left the queue; B is kept (generic failure)
    await waitFor(() => expect(screen.queryByText('Ayam Bakar')).not.toBeInTheDocument())
    expect(screen.getByText('Sambal')).toBeInTheDocument()
    // a concise outcome notice names succeeded/failed
    expect(await screen.findByText(/1 approved.*1 failed|approved 1.*failed 1/i)).toBeInTheDocument()
  })

  it('issue 398: an off-plan-only group offers NO bulk button — every row keeps its note gate', async () => {
    mockList.mockResolvedValue([PROD_OFFPLAN])
    mockPlan.mockResolvedValue({ wC: { produce: 10 } }) // 7 != 10 → off-plan → not bulk-eligible
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Tahu')

    expect(screen.queryByRole('button', { name: /approve all/i })).not.toBeInTheDocument()
    // the only path left is the per-row one, and it forces the note (AC-040)
    fireEvent.click(screen.getByRole('button', { name: /approve tahu/i }))
    expect(await screen.findByRole('textbox', { name: /approve note for tahu/i })).toBeInTheDocument()
    expect(mockApprove).not.toHaveBeenCalled()
  })
})

// ── #236: per-stream review with ops-lead fallback (FR-040/041/043) ──────────
// Display-side mirror of the server contract (pgTAP ops_12 owns the refusals): the
// queue filter defaults to the supervisor's OWN stream and to all-streams for
// ops_lead/admin; rows outside a supervisor's stream carry no decision controls; the
// production-first gate keys on the ROW'S stream, not the whole day; and the server's
// P0004 refusal surfaces as guidance rather than a raw error.
const XFER_OTHER_STREAM: ReviewLogRow = {
  id: 'log-xfer-other', log_date: '2026-06-20', action_type: 'Transfer to Bungur', action: 'transfer' as const, destination_branch_id: BRANCH_ID,
  branch_id: RADIANT_ID, activity: 'bar',
  wip_item_id: 'w4', wip_item_name: 'Es Kopi', qty_porsi: 5, notes: null,
  status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-20T10:00:00Z',
}

describe('KitchenReviewPage — the stream reads in the page head (#440)', () => {
  it('states the queue\'s stream in the head, canonically, and switching there re-scopes the queue', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    const { container } = render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    const picker = within(head).getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Rumah Rames · Kitchen')

    fireEvent.change(picker, { target: { value: `${RADIANT_ID}|bar` } })
    await screen.findByText('Es Kopi')
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
  })

  it('OD-WAY-48: "All streams" stays a first-class choice here — this is the cross-stream surface', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    const { container } = render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    const picker = within(head).getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.value).toBe('all')
    expect(screen.getByText('Es Kopi')).toBeInTheDocument()
  })

  it('issue 440: a stream chosen elsewhere in Café opens the queue on it, over the role default', async () => {
    // An ops_lead who was just looking at Radiant · Bar on Log lands on that queue, not on
    // the cross-stream default — an explicit choice outranks a guess about what they meant.
    rememberStream({ branch: BRANCHES[1], activity: 'bar' })
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Es Kopi')
    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveValue(`${RADIANT_ID}|bar`)
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
  })
})

describe('KitchenReviewPage — per-stream review (#236, FR-040/041)', () => {
  it('FR-041: a supervisor is allowed in, and the filter defaults to THEIR stream — other streams\' rows are off-screen', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    const filter = screen.getByRole('combobox', { name: /production stream/i })
    expect(filter).toHaveValue(`${BRANCH_ID}|kitchen`)
    // own-stream row is shown; the other stream's row is not
    expect(screen.queryByText('Es Kopi')).not.toBeInTheDocument()
  })

  it('FR-041: ops_lead defaults to ALL streams — every stream\'s rows are visible', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveValue('all')
    expect(screen.getByText('Es Kopi')).toBeInTheDocument()
  })

  it('FR-040: a supervisor viewing another stream sees its rows WITHOUT decision controls', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: 'all' },
    })
    await screen.findByText('Es Kopi')
    // own-stream row keeps its controls; the other stream's row carries the ops-lead marker instead
    expect(screen.getByRole('button', { name: /approve nasi goreng/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve es kopi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject es kopi/i })).not.toBeInTheDocument()
    expect(screen.getByText('Ops lead decides')).toBeInTheDocument()
  })

  it('FR-043: the production-first gate is PER STREAM — another stream\'s pending production does not lock this one\'s transfer', async () => {
    // stream (RRS, kitchen) has Submitted production + a transfer; stream (Radiant, bar)
    // has only a transfer. The old page-global gate disabled BOTH transfers.
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Es Kopi')
    expect(screen.getByRole('button', { name: /approve cold brew/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /approve es kopi/i })).not.toBeDisabled()
  })

  it('FR-043: the server\'s P0004 ordering refusal surfaces as guidance, not a raw error', async () => {
    mockList.mockResolvedValue([XFER_OTHER_STREAM])
    // on-plan (5 == 5) so Approve fires the RPC immediately — no variance-note detour
    mockPlan.mockResolvedValue({ w4: { [`transfer:${BRANCH_ID}`]: 5 } })
    mockApprove.mockRejectedValue(new KitchenRpcError('P0004', 'locked'))
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Es Kopi')
    fireEvent.click(screen.getByRole('button', { name: /approve es kopi/i }))
    await screen.findByText(/production awaiting review/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GUARD-PRIMARY (#249) — the queue's button rank.
//
// The law (DESIGN.md § Buttons; the toolbar's own guard is
// components/record-collection/guard-one-solid-primary.test.tsx): the solid blue marks the
// surface's real primary action and nothing else. This queue used to paint a solid Approve on
// EVERY resting row, so ten rows offered ten equally loud primaries and the bulk action stopped
// standing out.
//
// The invariant is per-SURFACE, not per-row: the page renders one solid "Approve all" per
// action_type group, so a fixture pinned to a single group can never show more than one solid
// primary and asserts nothing. The fixture below spans TWO groups (Production in one stream, a
// Transfer in another so the production-first gate leaves it bulk-eligible) and the assertion is
// that EVERY solid primary on the surface is a bulk approve — which a row painted solid breaks.
// ═════════════════════════════════════════════════════════════════════════════

/** Every solid-primary button currently in the document. */
const solidPrimaries = () => Array.from(document.querySelectorAll<HTMLElement>('.btn-primary'))

describe('KitchenReviewPage — GUARD-PRIMARY: bulk approve is the only solid primary (#249)', () => {
  it('across TWO action_type groups, every solid primary is an "Approve all" — the rows are quieter', async () => {
    // Production lives in (Rumah Rames, kitchen); the Transfer lives in (Radiant, bar), whose
    // stream has no pending production — so both groups are bulk-eligible and both render a
    // solid "Approve all". Two groups is what makes the count assertion below non-trivial.
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    // #398: bulk is offered for ON-PLAN rows only, so both fixture rows are pinned on-plan —
    // otherwise neither group renders the solid control this guard is about.
    mockPlan.mockResolvedValue({ w1: { produce: 8 }, w4: { [`transfer:${BRANCH_ID}`]: 5 } })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Es Kopi')

    const bulk = screen.getAllByRole('button', { name: /approve all/i })
    expect(bulk).toHaveLength(2)

    const solids = solidPrimaries()
    expect(solids).toHaveLength(bulk.length)
    expect(solids.map(el => el.getAttribute('aria-label'))).toEqual(
      bulk.map(el => el.getAttribute('aria-label')),
    )

    // Row rank (#249): Approve steps down to outline, and Reject — which only opens a
    // required-note gate, where Approve commits on one click — steps down again to the
    // quietest rank the system has.
    expect(screen.getByRole('button', { name: 'Approve Nasi Goreng' })).toHaveClass('btn-outline')
    expect(screen.getByRole('button', { name: 'Reject Nasi Goreng' })).toHaveClass('btn-ghost')
    expect(screen.getByRole('button', { name: 'Approve Es Kopi' })).toHaveClass('btn-outline')
    expect(screen.getByRole('button', { name: 'Reject Es Kopi' })).toHaveClass('btn-ghost')
  })
})

describe('KitchenReviewPage — offline (FR-005, NFR-008)', () => {
  it('offline: shows the offline banner AND disables per-row + bulk approve/reject', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      mockList.mockResolvedValue([PROD_ONPLAN_A])
      mockPlan.mockResolvedValue({ wA: { produce: 20 } }) // on-plan → would be bulk-eligible online
      render(<KitchenReviewPage />, { wrapper })
      await screen.findByText('Ayam Bakar')

      // the offline banner is shown
      // `.` matches either the straight or curly apostrophe — the i18n catalog uses ’ (U+2019).
      expect(screen.getByText(/you.re offline/i)).toBeInTheDocument()
      // per-row approve is disabled
      expect(screen.getByRole('button', { name: /approve ayam bakar/i })).toBeDisabled()
      // bulk approve is disabled (writes are online-only)
      expect(screen.getByRole('button', { name: /approve all/i })).toBeDisabled()
    } finally {
      onLineSpy.mockRestore()
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// #238 — FR-031: the per-stream completeness confirmation, as an AFFORDANCE.
//
// The contract this file owns is what RENDERS: which stream it speaks for, what
// it says in each state, and who is offered the control. Who may actually WRITE
// one is the server's (ops.can_review_stream) and is owned by pgTAP ops_14 —
// nothing here is a permission proof, only a display-honesty one.
// ═════════════════════════════════════════════════════════════════════════════
describe('KitchenReviewPage — per-stream completeness confirmation (FR-031)', () => {
  const OWN_STREAM = `${BRANCH_ID}|kitchen`

  it('FR-031: an unconfirmed stream reads as a plain gap — no warning, and the lead is offered the control', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    const group = screen.getByRole('group', { name: /item list completeness for this stream/i })
    expect(group).toHaveTextContent(/item list not confirmed complete yet/i)
    expect(screen.getByRole('button', { name: /confirm the item list is complete/i })).toBeEnabled()
    // It gates nothing: the queue's own decision controls are untouched by an unconfirmed list.
    expect(screen.getByRole('button', { name: /approve nasi goreng/i })).toBeInTheDocument()
  })

  it('FR-031: a confirmed stream names WHO confirmed it and WHEN, and the control becomes a re-confirmation', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG])
    mockCompleteness.mockResolvedValue([
      { branch_id: BRANCH_ID, activity: 'kitchen', confirmed_by: 'p1', confirmed_at: '2026-08-11T02:30:00Z' },
    ])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    const group = screen.getByRole('group', { name: /item list completeness for this stream/i })
    // 02:30Z is 09:30 WIB the SAME day — the date shown is the stream's local one.
    expect(group).toHaveTextContent(/Item list confirmed complete · Budi Santoso · 2026-08-11/)
    expect(screen.getByRole('button', { name: /confirm again/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm the item list is complete/i })).not.toBeInTheDocument()
  })

  it('FR-031: the confirmation names the stream in view — the click sends that stream and nothing else', async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG])
    mockConfirmComplete.mockResolvedValue({
      branch_id: BRANCH_ID, activity: 'kitchen', confirmed_by: 'p2', confirmed_at: '2026-08-12T01:00:00Z',
    })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    fireEvent.click(screen.getByRole('button', { name: /confirm the item list is complete/i }))
    await waitFor(() => expect(mockConfirmComplete).toHaveBeenCalledWith(BRANCH_ID, 'kitchen'))
    // The recorded fact replaces the gap in place — no queue refetch, because it gates nothing.
    expect(await screen.findByText(/item list confirmed complete for this stream/i)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /item list completeness/i }))
      .toHaveTextContent(/· Eka · 2026-08-12/)
    expect(mockList).toHaveBeenCalledTimes(1)
  })

  it("FR-031: a supervisor sees ANOTHER stream's completeness state but is offered no control over it", async () => {
    mockUseAuth.mockReturnValue(viewer(['supervisor']))
    mockDefaultStream.mockResolvedValue({ branch: BRANCHES[0], activity: 'kitchen' })
    mockList.mockResolvedValue([PROD_LOG, XFER_OTHER_STREAM])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    // Move the filter off their own stream, onto (Radiant, bar).
    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: `${RADIANT_ID}|bar` },
    })
    await screen.findByText('Es Kopi')

    // Read is org-wide on purpose — a gap that only its own lead can see is the tribal
    // knowledge FR-031 exists to end.
    expect(screen.getByRole('group', { name: /item list completeness for this stream/i }))
      .toHaveTextContent(/item list not confirmed complete yet/i)
    expect(screen.queryByRole('button', { name: /confirm the item list is complete/i })).not.toBeInTheDocument()
  })

  it('FR-031: with the filter on all streams there is no single list to vouch for, so nothing renders', async () => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))   // opens cross-stream by default
    mockList.mockResolvedValue([PROD_LOG])
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    expect(screen.queryByRole('group', { name: /item list completeness/i })).not.toBeInTheDocument()
    // ...and it comes back the moment one stream is named (so the absence above is the
    // filter's doing, not a block that never renders at all).
    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: OWN_STREAM },
    })
    expect(await screen.findByRole('group', { name: /item list completeness/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm the item list is complete/i })).toBeInTheDocument()
  })
})

// #400 i18n port: AC "the confirm dialog has no mixed-language state at any point in its
// flow" — open the reject gate, check every visible/aria string, ride the in-flight state,
// and read the outcome banner, all under id. RED first: the flow renders English today.
describe('KitchenReviewPage — decision flow, locale id (#400)', () => {
  beforeEach(() => {
    localStorage.setItem('mos.locale', 'id')
    mockList.mockResolvedValue([PROD_LOG]) // on-plan (plan 8, logged 8)
    mockPlan.mockResolvedValue({ w1: { produce: 8 } })
  })
  afterEach(() => localStorage.clear())

  it('idle row: Approve/Reject buttons and their aria names are Indonesian', async () => {
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    expect(screen.getByRole('button', { name: 'Setujui Nasi Goreng' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tolak Nasi Goreng' })).toBeInTheDocument()
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Reject')).toBeNull()
  })

  it('reject flow: note gate, placeholders, cue, confirm — Indonesian end to end', async () => {
    mockReject.mockResolvedValue(undefined)
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    fireEvent.click(screen.getByRole('button', { name: 'Tolak Nasi Goreng' }))
    expect(screen.getByText('Catatan penolakan')).toBeInTheDocument()
    const note = screen.getByLabelText('Catatan penolakan untuk Nasi Goreng')
    expect(note).toHaveAttribute('placeholder', 'Alasan penolakan (wajib)')

    // empty note → the required cue, in Indonesian
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi tolak Nasi Goreng' }))
    expect(screen.getByText('Catatan wajib diisi.')).toBeInTheDocument()

    fireEvent.change(note, { target: { value: 'salah item' } })
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi tolak Nasi Goreng' }))

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('log-prod', 'salah item'))
    expect(await screen.findByText('Ditolak — dihapus dari antrean.')).toBeInTheDocument()
    // no English fragment survives anywhere on the surface
    expect(screen.queryByText('Rejected — removed from the queue.')).toBeNull()
  })

  it('in-flight: the busy label is Memproses…, never Working…', async () => {
    mockReject.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: 'Tolak Nasi Goreng' }))
    fireEvent.change(screen.getByLabelText('Catatan penolakan untuk Nasi Goreng'), {
      target: { value: 'x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi tolak Nasi Goreng' }))
    expect(await screen.findByText('Memproses…')).toBeInTheDocument()
    expect(screen.queryByText('Working…')).toBeNull()
    // #411 review: the busy state must reach the ACCESSIBLE name too. A static aria-label on
    // a button with visible text wins over its content, so a screen-reader user heard the
    // idle label for the whole round-trip while the sighted label read "Memproses…".
    expect(screen.getByRole('button', { name: 'Memproses…' })).toBeInTheDocument()
  })

  // #411 review: the trigger opens a gate; the confirm commits irreversibly. Two controls one
  // press apart must not announce identically, or a screen-reader/keyboard user gets no signal
  // that the second press is the one that cannot be undone.
  it('the destructive confirm does not announce the same name as the trigger that opened it', async () => {
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    const trigger = screen.getByRole('button', { name: 'Tolak Nasi Goreng' })
    const triggerName = trigger.textContent
    fireEvent.click(trigger)
    const confirmButton = screen.getByRole('button', { name: /^Konfirmasi tolak/ })
    expect(confirmButton).toHaveTextContent('Konfirmasi tolak Nasi Goreng')
    expect(confirmButton.textContent).not.toBe(triggerName)
    expect(screen.queryByRole('button', { name: 'Tolak Nasi Goreng' })).toBeNull()
    // the object of the decision stays named on the commit control
    expect(confirmButton).toHaveTextContent('Nasi Goreng')
    // …and carries the hook the wrap rules key off (guard-review-confirm-wrap.css.test.ts)
    expect(confirmButton.className).toMatch(/\bkrow-confirm\b/)
  })

  it('approve flow (off-plan): note gate + outcome banner in Indonesian', async () => {
    mockPlan.mockResolvedValue({ w1: { produce: 12 } }) // 8 ≠ 12 → off-plan → note gate
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-010' })
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: 'Setujui Nasi Goreng' }))
    expect(screen.getByText('Catatan persetujuan')).toBeInTheDocument()
    const note = screen.getByLabelText('Catatan persetujuan untuk Nasi Goreng')
    expect(note).toHaveAttribute('placeholder', 'Alasan jumlahnya berbeda dari rencana (wajib)')
    fireEvent.change(note, { target: { value: 'kurang bahan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi setujui Nasi Goreng' }))
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('log-prod', 'kurang bahan'))
    expect(await screen.findByText(/Disetujui · batch PR-20260620-010/)).toBeInTheDocument()
  })

  it('action errors: forbidden and generic RPC failures surface Indonesian banners', async () => {
    mockApprove.mockRejectedValue(new KitchenRpcError('42501', 'forbidden'))
    render(<KitchenReviewPage />, { wrapper })
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: 'Setujui Nasi Goreng' }))
    expect(await screen.findByText('Anda tidak memiliki izin untuk meninjau log ini.')).toBeInTheDocument()
  })
})

// ── #422 / DD-WAY-40: phone card + the summary rule ──────────────────────────
// Default jsdom matchMedia is `matches: false` → phone, so DataTable takes the
// card path. These assert the card's OWN anatomy (they fail against the generic
// <dl> fallback — proven by removing the renderCard prop) and that the figures
// band is the DESIGN.md Metric summary rule, never a tile strip.
describe('KitchenReviewPage — phone card + summary rule (#422 / DD-WAY-40)', () => {
  it('renders the purpose-built card: head, ONE meta line, decision controls reachable', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { produce: 8 } })
    render(<KitchenReviewPage />)
    const card = (await screen.findByText('Nasi Goreng')).closest('.krow-card')
    expect(card).not.toBeNull()
    expect(card!.querySelector('.krow-card-head')).not.toBeNull()
    expect(card!.querySelector('.krow-card-meta')).not.toBeNull()
    // the submit note renders only when the row carries one — PROD_LOG does
    expect(card!.querySelector('.krow-card-note')?.textContent).toContain('kurang bahan')
    // the SAME decision component the desktop table mounts, inside the card
    expect(within(card as HTMLElement).getByRole('button', { name: /approve|setujui/i })).toBeInTheDocument()
    expect(document.querySelector('.dt-card-detail')).toBeNull()
  })

  it('a row with no note renders NO note block', async () => {
    mockList.mockResolvedValue([XFER_LOG])
    mockPlan.mockResolvedValue({ w2: { [`transfer:${RADIANT_ID}`]: 42 } })
    render(<KitchenReviewPage />)
    const card = (await screen.findByText('Cold Brew')).closest('.krow-card')!
    expect(card.querySelector('.krow-card-note')).toBeNull()
  })

  it('the figures band is the summary RULE (one line, no tiles), and the note-gate delta renders only when off-plan rows exist', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
    mockPlan.mockResolvedValue({ w1: { produce: 8 }, w2: { [`transfer:${RADIANT_ID}`]: 40 } }) // XFER off-plan (42 vs 40)
    render(<KitchenReviewPage />)
    await screen.findByText('Nasi Goreng')
    const band = document.querySelector('.msr')
    expect(band).not.toBeNull()
    // never the retired tile strip
    expect(document.querySelector('.kks-wrap, .kitchen-kpi-strip, [class*="kpi-tile"]')).toBeNull()
    // the delta carries an actionable state: off-plan rows need a note to approve
    expect(band!.querySelector('.msr-delta--destructive')).not.toBeNull()
  })

  it('with every row on plan, the band renders NO delta at all (no neutral noise)', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { produce: 8 } })
    render(<KitchenReviewPage />)
    await screen.findByText('Nasi Goreng')
    expect(document.querySelector('.msr')).not.toBeNull()
    expect(document.querySelector('.msr-delta')).toBeNull()
  })
})
