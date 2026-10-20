import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/kitchen-logs', () => ({ listSubmittedKitchenLogs: vi.fn(), countSubmittedKitchenLogs: vi.fn() }))
vi.mock('@/lib/db/cafe-count', () => ({ listCafeCountLines: vi.fn(), countSubmittedCafeCountLines: vi.fn() }))
vi.mock('@/lib/db/cafe-receipts', () => ({ listCafeReceipts: vi.fn(), countCafeReceipts: vi.fn() }))
vi.mock('@/lib/db/cafe-purchase-requests', () => ({ listCafePurchaseRequests: vi.fn() }))
vi.mock('@/lib/db/cafe-receipt-issues', () => ({ countCafeReceiptIssuesNeedingPo: vi.fn() }))
vi.mock('@/lib/db/kitchen-pushes', () => ({ listEsbPushes: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { countSubmittedKitchenLogs, listSubmittedKitchenLogs } from '@/lib/db/kitchen-logs'
import { countSubmittedCafeCountLines, listCafeCountLines } from '@/lib/db/cafe-count'
import { countCafeReceipts, listCafeReceipts } from '@/lib/db/cafe-receipts'
import { listCafePurchaseRequests } from '@/lib/db/cafe-purchase-requests'
import { countCafeReceiptIssuesNeedingPo } from '@/lib/db/cafe-receipt-issues'
import { listEsbPushes } from '@/lib/db/kitchen-pushes'
import { useCafeWaitingSource } from './use-cafe-waiting'

const mockUseAuth = vi.mocked(useAuth)
const mockCountLogs = vi.mocked(countSubmittedKitchenLogs)
const mockCountLines = vi.mocked(countSubmittedCafeCountLines)
const mockCountReceipts = vi.mocked(countCafeReceipts)

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: { id: 'person-1', org_id: 'org-1', user_id: 'user-1', full_name: 'Ops Lead', must_change_password: false },
      roles: [], isManager: false, accessRoles: ['ops_lead'], affiliated: [],
    },
    signOut: vi.fn(),
  } as AuthState)
  mockCountLogs.mockResolvedValue(4)
  mockCountLines.mockResolvedValue(2)
  mockCountReceipts.mockResolvedValue(1)
  vi.mocked(listCafePurchaseRequests).mockResolvedValue([{}] as never)
  vi.mocked(countCafeReceiptIssuesNeedingPo).mockResolvedValue(3)
  vi.mocked(listEsbPushes).mockResolvedValue([])
})

describe('Café waiting counts', () => {
  it('loads exact counts for Submitted logs, Counts and receipts without fetching their rows', async () => {
    const { result } = renderHook(() => useCafeWaitingSource(true))

    await waitFor(() => expect(result.current.queues).toMatchObject({
      logs: { status: 'ready', count: 4 },
      counts: { status: 'ready', count: 2 },
      receipts: { status: 'ready', count: 1 },
    }))

    expect(mockCountLogs).toHaveBeenCalledOnce()
    expect(mockCountLines).toHaveBeenCalledOnce()
    expect(mockCountReceipts).toHaveBeenCalledWith(['Submitted'])
    expect(listSubmittedKitchenLogs).not.toHaveBeenCalled()
    expect(listCafeCountLines).not.toHaveBeenCalled()
    expect(listCafeReceipts).not.toHaveBeenCalled()
  })
})
