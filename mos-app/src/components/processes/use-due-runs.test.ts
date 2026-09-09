import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { DueProcessRun, SpawnResult } from '@/lib/db/processes.types'

// Design fix wave item 1 (a/b): component/hook tests mock the DAL, never a live DB.
vi.mock('@/lib/db/processes', () => ({ listDueRuns: vi.fn(), startRun: vi.fn() }))
import { listDueRuns, startRun } from '@/lib/db/processes'

vi.mock('@/lib/db/signals', () => ({ listAuthorTeams: vi.fn() }))
import { listAuthorTeams } from '@/lib/db/signals'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

import { useDueRuns } from './use-due-runs'

const mockListDueRuns = vi.mocked(listDueRuns)
const mockStartRun = vi.mocked(startRun)
const mockListAuthorTeams = vi.mocked(listAuthorTeams)
const mockUseAuth = vi.mocked(useAuth)

const VIEWER_ID = '40000000-0000-0000-0000-000000000001'

function setAuthAs(accessRoles: string[], viewerId = VIEWER_ID, orgId = 'org-1') {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: {
      person: {
        id: viewerId, org_id: orgId, user_id: 'auth-user-001', full_name: 'Cahya Cafe',
        email: 'cahya@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  })
}

function dueRow(overrides: Partial<DueProcessRun> = {}): DueProcessRun {
  return {
    work_line_id: 'wl-1', process_name: 'Café Opening',
    owning_team_id: 'team-1', team_name: 'Own Team',
    period_key: '2026-07-17', scheduled_date: '2026-07-17',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListDueRuns.mockResolvedValue([])
  mockListAuthorTeams.mockResolvedValue([])
})

describe('useDueRuns (design fix wave item 1)', () => {
  it('uses authenticated state for the read and leaves process authority to the server', async () => {
    setAuthAs(['finance'])
    const { result } = renderHook(() => useDueRuns())
    expect(result.current.capable).toBe(true)
    await waitFor(() => expect(mockListDueRuns).toHaveBeenCalledTimes(1))
  })

  it('defaults to collapsed (expanded=false) for a capable viewer', async () => {
    setAuthAs(['ops_lead'])
    mockListDueRuns.mockResolvedValue([dueRow()])
    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.due).toHaveLength(1))
    expect(result.current.expanded).toBe(false)
  })

  it('toggleExpanded flips the expanded flag', async () => {
    setAuthAs(['ops_lead'])
    mockListDueRuns.mockResolvedValue([])
    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    act(() => { result.current.toggleExpanded() })
    expect(result.current.expanded).toBe(true)
    act(() => { result.current.toggleExpanded() })
    expect(result.current.expanded).toBe(false)
  })

  it('1a: keeps every server-authorized due row regardless of membership', async () => {
    setAuthAs(['ops_lead'])
    mockListDueRuns.mockResolvedValue([
      dueRow({ owning_team_id: 'team-1', team_name: 'My Team' }),
      dueRow({ owning_team_id: 'team-2', team_name: 'Someone Else Team', work_line_id: 'wl-2' }),
    ])
    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.due).toHaveLength(2)
    expect(result.current.due[0].owning_team_id).toBe('team-1')
  })

  it('1a: a capable viewer with ZERO memberships (pure admin) keeps every due row', async () => {
    setAuthAs(['admin'])
    mockListDueRuns.mockResolvedValue([
      dueRow({ owning_team_id: 'team-1' }),
      dueRow({ owning_team_id: 'team-2', work_line_id: 'wl-2' }),
    ])
    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.due).toHaveLength(2)
  })

  it('reloads server-filtered due rows when the mounted viewer changes', async () => {
    setAuthAs(['ops_lead'], 'viewer-a', 'org-1')
    mockListDueRuns.mockResolvedValueOnce([dueRow({ work_line_id: 'wl-a' })])
      .mockResolvedValueOnce([dueRow({ work_line_id: 'wl-b' })])
    const view = renderHook(() => useDueRuns())

    await waitFor(() => expect(view.result.current.due[0]?.work_line_id).toBe('wl-a'))
    setAuthAs(['ops_lead'], 'viewer-b', 'org-2')
    view.rerender()

    await waitFor(() => expect(view.result.current.due[0]?.work_line_id).toBe('wl-b'))
    expect(mockListDueRuns).toHaveBeenCalledTimes(2)
  })

  it('does not apply a client-side membership filter', async () => {
    setAuthAs(['ops_lead'])
    mockListDueRuns.mockResolvedValue([])
    renderHook(() => useDueRuns())
    await waitFor(() => expect(mockListDueRuns).toHaveBeenCalled())
    expect(mockListAuthorTeams).not.toHaveBeenCalled()
  })

  it('handleStart calls startRun, fires onStarted, and refetches the due list', async () => {
    setAuthAs(['ops_lead'])
    const row = dueRow()
    mockListDueRuns.mockResolvedValue([row])
    const spawnResult: SpawnResult = { run_id: 'run-1', created: 2, pending: 1, idempotent: false }
    mockStartRun.mockResolvedValue(spawnResult)
    const onStarted = vi.fn()

    const { result } = renderHook(() => useDueRuns(onStarted))
    await waitFor(() => expect(result.current.due).toHaveLength(1))

    await act(async () => { await result.current.handleStart(row) })

    expect(mockStartRun).toHaveBeenCalledWith('wl-1', 'team-1', '2026-07-17')
    expect(onStarted).toHaveBeenCalledWith({ ...spawnResult, workLineId: 'wl-1', teamId: 'team-1' })
    expect(mockListDueRuns).toHaveBeenCalledTimes(2)
  })

  it('preserves expansion when a same-viewer start refreshes the due list', async () => {
    setAuthAs(['ops_lead'])
    const row = dueRow()
    mockListDueRuns.mockResolvedValue([row])
    mockStartRun.mockResolvedValue({ run_id: 'run-1', created: 1, pending: 0, idempotent: false })

    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.due).toHaveLength(1))
    act(() => { result.current.toggleExpanded() })
    expect(result.current.expanded).toBe(true)

    await act(async () => { await result.current.handleStart(row) })
    await waitFor(() => expect(mockListDueRuns).toHaveBeenCalledTimes(2))
    expect(result.current.expanded).toBe(true)
  })

  it('handleStart sets startError on rejection and clears it on a retried success', async () => {
    setAuthAs(['ops_lead'])
    const row = dueRow()
    mockListDueRuns.mockResolvedValue([row])
    mockStartRun.mockRejectedValueOnce(new Error('lost race'))
    mockStartRun.mockResolvedValueOnce({ run_id: 'run-2', created: 1, pending: 0, idempotent: false })

    const { result } = renderHook(() => useDueRuns())
    await waitFor(() => expect(result.current.due).toHaveLength(1))

    await act(async () => { await result.current.handleStart(row) })
    expect(result.current.startError).toBe(true)
    expect(result.current.startingKey).toBeNull()

    await act(async () => { await result.current.handleStart(row) })
    expect(result.current.startError).toBe(false)
  })
})
