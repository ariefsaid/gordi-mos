import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn() }))
vi.mock('@/lib/db/work-authority', () => ({
  emptyWorkWriteScopes: () => ({
    workline_org: false,
    objective_org: false,
    workline_bu_ids: [],
    objective_bu_ids: [],
    objective_content_org: false,
    objective_content_bu_ids: [],
  }),
  getWorkWriteScopes: vi.fn(),
}))

import { useAuth } from '@/auth/use-auth'
import { emptyWorkWriteScopes, getWorkWriteScopes, type WorkWriteScopes } from '@/lib/db/work-authority'
import { canEditObjectiveContentForScope, useWorkWriteAuthority, WORK_AUTHORITY_TIMEOUT_MS } from './use-work-write-authority'

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
  objective_content_org: false,
  objective_content_bu_ids: [],
}
const scopesB = {
  workline_org: false,
  objective_org: true,
  workline_bu_ids: ['bu-b'],
  objective_bu_ids: [],
  objective_content_org: false,
  objective_content_bu_ids: [],
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

describe('useWorkWriteAuthority lookup failure', () => {
  it('reports an error for a rejected lookup and recovers on retry', async () => {
    mockGetWorkWriteScopes.mockRejectedValueOnce(new Error('down'))
    const view = renderHook(() => useWorkWriteAuthority())
    await waitFor(() => expect(view.result.current.error).toBe(true))
    act(() => view.result.current.retry())
    await waitFor(() => expect(view.result.current.scopes).toEqual(scopesA))
    expect(view.result.current.error).toBe(false)
  })

  it('reports an error when the lookup never answers', async () => {
    vi.useFakeTimers()
    try {
      mockGetWorkWriteScopes.mockReturnValueOnce(new Promise(() => {}))
      const view = renderHook(() => useWorkWriteAuthority())
      await act(async () => { await vi.advanceTimersByTimeAsync(WORK_AUTHORITY_TIMEOUT_MS) })
      expect(view.result.current.error).toBe(true)
      expect(view.result.current.loading).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('canEditObjectiveContentForScope', () => {
  const scopes = (overrides: Partial<WorkWriteScopes>): WorkWriteScopes => ({
    ...emptyWorkWriteScopes(), ...overrides,
  })
  const cases: readonly {
    name: string
    row: { businessUnitId?: string | null; isCompanyWide?: boolean }
    scopes: WorkWriteScopes
    expected: boolean
  }[] = [
    { name: 'content org, named unit', row: { businessUnitId: 'bu-a' }, scopes: scopes({ objective_content_org: true }), expected: true },
    { name: 'content org, Company-wide', row: { businessUnitId: null, isCompanyWide: true }, scopes: scopes({ objective_content_org: true }), expected: true },
    { name: 'content org, unset', row: { businessUnitId: null, isCompanyWide: false }, scopes: scopes({ objective_content_org: true }), expected: true },
    { name: 'own unit', row: { businessUnitId: 'bu-a' }, scopes: scopes({ objective_content_bu_ids: ['bu-a', 'bu-b'] }), expected: true },
    { name: 'another unit', row: { businessUnitId: 'bu-c' }, scopes: scopes({ objective_content_bu_ids: ['bu-a', 'bu-b'] }), expected: false },
    { name: 'unit head, Company-wide', row: { businessUnitId: null, isCompanyWide: true }, scopes: scopes({ objective_content_bu_ids: ['bu-a'] }), expected: false },
    { name: 'unit head, Company-wide row that also names a unit in scope', row: { businessUnitId: 'bu-a', isCompanyWide: true }, scopes: scopes({ objective_content_bu_ids: ['bu-a'] }), expected: false },
    { name: 'unit head, unset', row: { businessUnitId: null, isCompanyWide: false }, scopes: scopes({ objective_content_bu_ids: ['bu-a'] }), expected: false },
    { name: 'unit head, flag absent and no unit', row: {}, scopes: scopes({ objective_content_bu_ids: ['bu-a'] }), expected: false },
    { name: 'member, named unit', row: { businessUnitId: 'bu-a' }, scopes: scopes({}), expected: false },
    { name: 'structural scope alone never opens content', row: { businessUnitId: 'bu-a' }, scopes: scopes({ objective_org: true, objective_bu_ids: ['bu-a'] }), expected: false },
  ]
  it.each(cases)('$name -> $expected', ({ row, scopes: given, expected }) => {
    expect(canEditObjectiveContentForScope(row, given)).toBe(expected)
  })
})
