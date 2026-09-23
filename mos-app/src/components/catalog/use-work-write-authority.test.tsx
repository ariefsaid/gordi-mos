import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({
    workline_org: false,
    objective_org: false,
    workline_bu_ids: [],
    objective_bu_ids: [],
  }),
  getWorkWriteScopes: vi.fn(),
}))

import { useAuth } from '@/auth/use-auth'
import { getWorkWriteScopes } from '@/lib/db/work-authority'
import { useWorkWriteAuthority } from './use-work-write-authority'

const mockUseAuth = vi.mocked(useAuth)
const mockGetWorkWriteScopes = vi.mocked(getWorkWriteScopes)

function auth(viewerId: string, orgId: string): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: viewerId,
        org_id: orgId,
        user_id: `user-${viewerId}`,
        full_name: 'Viewer',
        email: 'viewer@example.test',
        must_change_password: false,
        archived_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles: [],
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

const scopesA = {
  workline_org: true,
  objective_org: false,
  workline_bu_ids: [],
  objective_bu_ids: ['bu-a'],
}
const scopesB = {
  workline_org: false,
  objective_org: true,
  workline_bu_ids: ['bu-b'],
  objective_bu_ids: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(auth('viewer-a', 'org-1'))
  mockGetWorkWriteScopes.mockResolvedValue(scopesA)
})

describe('useWorkWriteAuthority', () => {
  it('reloads scopes when the mounted viewer or org changes', async () => {
    const view = renderHook(() => useWorkWriteAuthority())
    await waitFor(() => expect(view.result.current.scopes).toEqual(scopesA))

    mockGetWorkWriteScopes.mockResolvedValueOnce(scopesB)
    mockUseAuth.mockReturnValue(auth('viewer-b', 'org-2'))
    view.rerender()

    await waitFor(() => expect(view.result.current.scopes).toEqual(scopesB))
    expect(mockGetWorkWriteScopes).toHaveBeenCalledTimes(2)
  })
})
