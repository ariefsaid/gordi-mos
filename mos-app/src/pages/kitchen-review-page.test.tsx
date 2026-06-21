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
    render(<KitchenReviewPage />)
    expect(await screen.findByText(/available to ops leads/i)).toBeInTheDocument()
    // the queue read is never even attempted for a member
    expect(mockList).not.toHaveBeenCalled()
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
