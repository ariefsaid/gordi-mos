import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAdminPeople, listRevenueScopeOptions, listRoles, listTeams } from '@/lib/db/admin-users'
import type { AdminPersonRow, RevenueScopeOption, RoleOption, TeamOption } from '@/lib/db/admin-users.types'
import { useAdminPeople } from './use-admin-people'

vi.mock('@/lib/db/admin-users', () => ({
  listAdminPeople: vi.fn(),
  listRevenueScopeOptions: vi.fn(),
  listRoles: vi.fn(),
  listTeams: vi.fn(),
}))

const mockListAdminPeople = vi.mocked(listAdminPeople)
const mockListRevenueScopeOptions = vi.mocked(listRevenueScopeOptions)
const mockListRoles = vi.mocked(listRoles)
const mockListTeams = vi.mocked(listTeams)

const samplePerson: AdminPersonRow = {
  id: 'person-1',
  full_name: 'Ayu Person',
  email: 'ayu@example.test',
  archived_at: null,
  login: 'active',
  access_roles: ['member'],
  jabatan: [],
  revenue_scope: [],
  teams: [{ team_id: 'team-ops', is_primary: true }],
}

const updatedPerson: AdminPersonRow = {
  ...samplePerson,
  access_roles: ['member', 'supervisor'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListAdminPeople.mockResolvedValue([samplePerson])
  mockListRoles.mockResolvedValue([{ id: 'role-1', name: 'Barista' } as RoleOption])
  mockListTeams.mockResolvedValue([{ id: 'team-ops', name: 'Operations', branch_name: null, activity: null } as TeamOption])
  mockListRevenueScopeOptions.mockResolvedValue([] as RevenueScopeOption[])
})

describe('useAdminPeople', () => {
  it('loads people, roles, teams and scope options on mount', async () => {
    let hookResult!: ReturnType<typeof renderHook<ReturnType<typeof useAdminPeople>, void>>
    await act(async () => {
      hookResult = renderHook(() => useAdminPeople())
    })
    const { result } = hookResult

    await waitFor(() => expect(result.current.state).toBe('loaded'))

    expect(result.current.people).toEqual([samplePerson])
    expect(result.current.refreshError).toBeNull()
  })

  it('exposes refresh failure, retains last good rows, and re-throws the error', async () => {
    let hookResult!: ReturnType<typeof renderHook<ReturnType<typeof useAdminPeople>, void>>
    await act(async () => {
      hookResult = renderHook(() => useAdminPeople())
    })
    const { result } = hookResult
    await waitFor(() => expect(result.current.state).toBe('loaded'))

    mockListAdminPeople.mockRejectedValueOnce(new Error('network failure'))

    let threw = false
    await act(async () => {
      try {
        await result.current.refresh()
      } catch (err) {
        threw = true
        expect((err as Error).message).toBe('network failure')
      }
    })

    expect(threw).toBe(true)
    // Retains last good rows so display is not blanked
    expect(result.current.people).toEqual([samplePerson])
    // Exposes refresh failure
    expect(result.current.refreshError).toBe('network failure')

    // Subsequent successful refresh updates people and clears refresh error
    mockListAdminPeople.mockResolvedValueOnce([updatedPerson])
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.refreshError).toBeNull()
    expect(result.current.people).toEqual([updatedPerson])
  })
})
