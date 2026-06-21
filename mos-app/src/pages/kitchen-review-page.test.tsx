// KitchenReviewPage tests — TDD, AC-tagged.
// S3 review/approve queue (ops_lead/admin only). Covers:
//  - role gate: a member sees a forbidden panel, NOT an empty table (FR-003/044)
//  - queue lists ONLY Submitted logs grouped by action_type (FR-040)
//  - approve calls the RPC with the right args (FR-050, AC-090)
//  - approve handles P0003 (already actioned) → friendly refresh (error→re-fetch)
//  - reject sends status=Rejected + note (FR-041, AC-041)
//  - production-first gate disables Transfer Approve while Production Submitted (AC-042)
//  - all states: loading, empty (good-empty), error+retry, forbidden, success (row leaves)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return {
    ...actual,
    listSubmittedKitchenLogs: vi.fn(),
    fetchPlanMap: vi.fn(),
    approveKitchenLog: vi.fn(),
    rejectKitchenLog: vi.fn(),
  }
})
import {
  listSubmittedKitchenLogs,
  fetchPlanMap,
  approveKitchenLog,
  rejectKitchenLog,
  KitchenRpcError,
} from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
import { getPeople } from '@/lib/db/directory'

import { KitchenReviewPage } from './kitchen-review-page'
import type { ReviewLogRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockList = vi.mocked(listSubmittedKitchenLogs)
const mockPlan = vi.mocked(fetchPlanMap)
const mockApprove = vi.mocked(approveKitchenLog)
const mockReject = vi.mocked(rejectKitchenLog)
const mockGetPeople = vi.mocked(getPeople)

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-lead', org_id: 'org-1', user_id: 'auth-1', full_name: 'Dina Lead',
        email: 'dina@gordi.id', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

const PROD_LOG: ReviewLogRow = {
  id: 'log-prod', log_date: '2026-06-20', action_type: 'Production',
  wip_item_id: 'w1', wip_item_name: 'Nasi Goreng', qty_porsi: 8, notes: 'kurang bahan',
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T09:12:00Z',
}
const XFER_LOG: ReviewLogRow = {
  id: 'log-xfer', log_date: '2026-06-20', action_type: 'Transfer to Radiant',
  wip_item_id: 'w2', wip_item_name: 'Cold Brew', qty_porsi: 42, notes: null,
  status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-20T13:02:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockList.mockResolvedValue([])
  mockPlan.mockResolvedValue({})
  mockGetPeople.mockResolvedValue([
    { id: 'p1', full_name: 'Budi Santoso' },
    { id: 'p2', full_name: 'Eka' },
  ])
})

describe('KitchenReviewPage — role gate (FR-003/044)', () => {
  it('a member sees a forbidden panel — NOT an empty table', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/review']}>
        <KitchenReviewPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/available to ops leads/i)).toBeInTheDocument()
    // the queue read is never even attempted for a member
    expect(mockList).not.toHaveBeenCalled()
    // Back to Log must resolve via the SPA router — not a raw href that causes a full reload
    const backLink = screen.getByRole('link', { name: /back to log/i })
    expect(backLink).toHaveAttribute('href', '/mos/kitchen/log')
  })

  it('an admin is allowed (not forbidden)', async () => {
    mockUseAuth.mockReturnValue(viewer(['admin']))
    render(<KitchenReviewPage />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })
})

describe('KitchenReviewPage — states', () => {
  it('loading: shows a busy skeleton while the queue loads', () => {
    mockList.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenReviewPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: a GOOD empty ("nothing to review") when no Submitted logs', async () => {
    mockList.mockResolvedValue([])
    render(<KitchenReviewPage />)
    expect(await screen.findByText(/nothing to review/i)).toBeInTheDocument()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockList.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([PROD_LOG])
    render(<KitchenReviewPage />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
  })
})

describe('KitchenReviewPage — queue (FR-040)', () => {
  it('lists ONLY Submitted logs grouped by action_type', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
    mockPlan.mockResolvedValue({ w1: { Production: 12 }, w2: { 'Transfer to Radiant': 40 } })
    render(<KitchenReviewPage />)
    expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.getByText('Cold Brew')).toBeInTheDocument()
    // group sections per action_type (each is a labelled region)
    expect(screen.getByRole('region', { name: 'Production' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Transfer to Radiant' })).toBeInTheDocument()
  })
})

describe('KitchenReviewPage — approve (FR-050, AC-090)', () => {
  it('on-plan approve calls the RPC with the log id + null note, then removes the row', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { Production: 8 } }) // plan == logged → on-plan
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-003' })
    render(<KitchenReviewPage />)
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('log-prod', null))
    // confirmed batch id surfaced + row leaves the queue
    expect(await screen.findByText(/PR-20260620-003/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Nasi Goreng')).not.toBeInTheDocument())
  })

  it('AC: P0003 (already actioned) → friendly notice + re-fetch', async () => {
    mockList.mockResolvedValueOnce([PROD_LOG]).mockResolvedValueOnce([])
    mockPlan.mockResolvedValue({ w1: { Production: 8 } })
    mockApprove.mockRejectedValue(new KitchenRpcError('P0003', 'not Submitted'))
    render(<KitchenReviewPage />)
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /approve nasi goreng/i }))
    expect(await screen.findByText(/already reviewed/i)).toBeInTheDocument()
    // re-fetched the queue (now empty)
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
  })
})

describe('KitchenReviewPage — reject (FR-041, AC-041)', () => {
  it('reject sends status=Rejected + note via rejectKitchenLog, then removes the row', async () => {
    mockList.mockResolvedValue([PROD_LOG])
    mockPlan.mockResolvedValue({ w1: { Production: 8 } })
    mockReject.mockResolvedValue(undefined)
    render(<KitchenReviewPage />)
    await screen.findByText('Nasi Goreng')
    fireEvent.click(screen.getByRole('button', { name: /reject nasi goreng/i }))
    const note = screen.getByRole('textbox', { name: /reject note for nasi goreng/i })
    fireEvent.change(note, { target: { value: 'wrong item' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm reject/i }))
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith('log-prod', 'wrong item'))
    await waitFor(() => expect(screen.queryByText('Nasi Goreng')).not.toBeInTheDocument())
  })
})

describe('KitchenReviewPage — production-first gate (FR-042, AC-042)', () => {
  it('disables Transfer Approve while a Production log is still Submitted; Reject stays live', async () => {
    mockList.mockResolvedValue([PROD_LOG, XFER_LOG])
    mockPlan.mockResolvedValue({})
    render(<KitchenReviewPage />)
    await screen.findByText('Cold Brew')
    // the Transfer row's Approve is disabled
    const xferApprove = screen.getByRole('button', { name: /approve cold brew/i })
    expect(xferApprove).toBeDisabled()
    // but the Production row's Approve is live
    expect(screen.getByRole('button', { name: /approve nasi goreng/i })).not.toBeDisabled()
    // and the Transfer Reject stays live
    expect(screen.getByRole('button', { name: /reject cold brew/i })).not.toBeDisabled()
  })
})

// ── Bulk approve (FR-043, AC-042 extension) ──────────────────────────────────
// Parity with the OLD app (app/main.py review_bulk ~L1031-1034, L1210-1273): bulk
// "Approve all (N)" approves EVERY Submitted row in the section — incl. off-plan rows
// (approved with null note, no per-row note forced) — gated only by production-first
// (a Transfer section's bulk stays disabled while Production is pending). N counts all
// Submitted rows in the section. The per-row single-approve flow keeps its variance-note
// gate (only bulk approves-all without per-row notes, mirroring the oracle).
const PROD_ONPLAN_A: ReviewLogRow = {
  id: 'log-a', log_date: '2026-06-20', action_type: 'Production',
  wip_item_id: 'wA', wip_item_name: 'Ayam Bakar', qty_porsi: 20, notes: null,
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T08:00:00Z',
}
const PROD_ONPLAN_B: ReviewLogRow = {
  id: 'log-b', log_date: '2026-06-20', action_type: 'Production',
  wip_item_id: 'wB', wip_item_name: 'Sambal', qty_porsi: 5, notes: null,
  status: 'Submitted', submitted_by: 'p2', business_unit_id: 'kb', created_at: '2026-06-20T08:05:00Z',
}
const PROD_OFFPLAN: ReviewLogRow = {
  id: 'log-c', log_date: '2026-06-20', action_type: 'Production',
  wip_item_id: 'wC', wip_item_name: 'Tahu', qty_porsi: 7, notes: null,
  status: 'Submitted', submitted_by: 'p1', business_unit_id: 'kb', created_at: '2026-06-20T08:10:00Z',
}

describe('KitchenReviewPage — bulk approve (FR-043, AC-042)', () => {
  it('AC-042: "Approve all (N)" approves EVERY Submitted row in the section — incl. off-plan', async () => {
    // 2 on-plan (A=20==plan, B=5==plan) + 1 off-plan (C=7 != plan 10) → N = 3 (ALL Submitted)
    mockList.mockResolvedValue([PROD_ONPLAN_A, PROD_ONPLAN_B, PROD_OFFPLAN])
    mockPlan.mockResolvedValue({ wA: { Production: 20 }, wB: { Production: 5 }, wC: { Production: 10 } })
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-007' })
    render(<KitchenReviewPage />)
    await screen.findByText('Ayam Bakar')

    // the group-header bulk button counts ALL 3 Submitted logs (off-plan included)
    const bulk = screen.getByRole('button', { name: /approve all \(3\)/i })
    expect(bulk).not.toBeDisabled()
    fireEvent.click(bulk)

    // all three rows are approved with a null note (off-plan included, no per-row note forced)
    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(3))
    expect(mockApprove).toHaveBeenCalledWith('log-a', null)
    expect(mockApprove).toHaveBeenCalledWith('log-b', null)
    expect(mockApprove).toHaveBeenCalledWith('log-c', null)

    // every row leaves the queue
    await waitFor(() => expect(screen.queryByText('Ayam Bakar')).not.toBeInTheDocument())
    expect(screen.queryByText('Sambal')).not.toBeInTheDocument()
    expect(screen.queryByText('Tahu')).not.toBeInTheDocument()
  })

  it('AC-042: a Transfer group bulk-approve is blocked while a Production log is still Submitted', async () => {
    // one Submitted Production (blocks transfers) + one off-plan transfer
    const XFER_OFFPLAN: ReviewLogRow = {
      ...XFER_LOG, id: 'log-x2', wip_item_name: 'Latte', wip_item_id: 'wX', qty_porsi: 30,
    }
    mockList.mockResolvedValue([PROD_LOG, XFER_OFFPLAN])
    mockPlan.mockResolvedValue({ w1: { Production: 8 }, wX: { 'Transfer to Radiant': 25 } }) // 30 != 25 → off-plan
    render(<KitchenReviewPage />)
    await screen.findByText('Latte')

    // Production bulk is offered (1 Submitted) and live
    expect(screen.getByRole('button', { name: /approve all \(1\)/i })).not.toBeDisabled()
    // the Transfer group's bulk approve is NOT offered while Production pending (production-first gate)
    expect(screen.queryByRole('button', { name: /approve all transfer to radiant/i })).not.toBeInTheDocument()
  })

  it('partial failure: P0003 rows drop, other errors keep the row + a succeeded/failed notice', async () => {
    mockList.mockResolvedValue([PROD_ONPLAN_A, PROD_ONPLAN_B])
    mockPlan.mockResolvedValue({ wA: { Production: 20 }, wB: { Production: 5 } })
    // A succeeds; B fails with a generic error (kept in queue)
    mockApprove
      .mockResolvedValueOnce({ batch_id: 'PR-20260620-009' })
      .mockRejectedValueOnce(new KitchenRpcError('XX000', 'db down'))
    render(<KitchenReviewPage />)
    await screen.findByText('Ayam Bakar')

    fireEvent.click(screen.getByRole('button', { name: /approve all \(2\)/i }))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(2))
    // A left the queue; B is kept (generic failure)
    await waitFor(() => expect(screen.queryByText('Ayam Bakar')).not.toBeInTheDocument())
    expect(screen.getByText('Sambal')).toBeInTheDocument()
    // a concise outcome notice names succeeded/failed
    expect(await screen.findByText(/1 approved.*1 failed|approved 1.*failed 1/i)).toBeInTheDocument()
  })

  it('AC-042: an off-plan-only group IS bulk-eligible — "Approve all (1)" is offered', async () => {
    // Parity: off-plan rows are no longer excluded from bulk (oracle approves all Submitted).
    mockList.mockResolvedValue([PROD_OFFPLAN])
    mockPlan.mockResolvedValue({ wC: { Production: 10 } }) // 7 != 10 → off-plan, still bulk-eligible
    mockApprove.mockResolvedValue({ batch_id: 'PR-20260620-008' })
    render(<KitchenReviewPage />)
    await screen.findByText('Tahu')
    const bulk = screen.getByRole('button', { name: /approve all \(1\)/i })
    fireEvent.click(bulk)
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('log-c', null))
  })
})

describe('KitchenReviewPage — offline (FR-005, NFR-008)', () => {
  it('offline: shows the offline banner AND disables per-row + bulk approve/reject', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      mockList.mockResolvedValue([PROD_ONPLAN_A])
      mockPlan.mockResolvedValue({ wA: { Production: 20 } }) // on-plan → would be bulk-eligible online
      render(<KitchenReviewPage />)
      await screen.findByText('Ayam Bakar')

      // the offline banner is shown
      expect(screen.getByText(/you're offline/i)).toBeInTheDocument()
      // per-row approve is disabled
      expect(screen.getByRole('button', { name: /approve ayam bakar/i })).toBeDisabled()
      // bulk approve is disabled (writes are online-only)
      expect(screen.getByRole('button', { name: /approve all/i })).toBeDisabled()
    } finally {
      onLineSpy.mockRestore()
    }
  })
})
