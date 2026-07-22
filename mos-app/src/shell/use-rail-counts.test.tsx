import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/rail-counts', () => ({ getRailCounts: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { getRailCounts } from '@/lib/db/rail-counts'
import { useRailCounts } from './use-rail-counts'

const mockUseAuth = vi.mocked(useAuth)
const mockGetRailCounts = vi.mocked(getRailCounts)

function authed() {
  mockUseAuth.mockReturnValue({ status: 'authenticated' } as never)
}

beforeEach(() => vi.clearAllMocks())

describe('useRailCounts — the single rail count-fetch seam', () => {
  it('fetches once when authenticated and returns the resolved counts', async () => {
    authed()
    mockGetRailCounts.mockResolvedValue({ openTasks: 9, attentionSignals: 2 })
    const { result } = renderHook(() => useRailCounts())
    expect(result.current).toBeNull() // null until it resolves
    await waitFor(() => expect(result.current).toEqual({ openTasks: 9, attentionSignals: 2 }))
    expect(mockGetRailCounts).toHaveBeenCalledTimes(1)
  })

  it('stays null (no badges) when the fetch fails', async () => {
    authed()
    mockGetRailCounts.mockRejectedValue(new Error('rls denied'))
    const { result } = renderHook(() => useRailCounts())
    await waitFor(() => expect(mockGetRailCounts).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('does not fetch when the viewer is not authenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    const { result } = renderHook(() => useRailCounts())
    expect(result.current).toBeNull()
    expect(mockGetRailCounts).not.toHaveBeenCalled()
  })
})
