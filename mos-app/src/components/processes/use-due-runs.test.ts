import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { DueProcessRun, ProcessOccurrenceSummary } from '@/lib/db/processes.types'

// Hook tests mock the DAL, never a live DB.
vi.mock('@/lib/db/processes', () => ({
  listProcessOccurrenceSummaries: vi.fn(),
  listStartableProcessRuns: vi.fn(),
  canStartProcessForTeam: vi.fn(),
  canCloseProcessRun: vi.fn(),
  listProcessOccurrenceAuthorities: vi.fn(),
  startRun: vi.fn(),
}))
vi.mock('@/lib/db/cafe-opening', () => ({ listCafeViewerTeams: vi.fn() }))
import {
  listProcessOccurrenceSummaries, listStartableProcessRuns, canStartProcessForTeam, canCloseProcessRun,
  listProcessOccurrenceAuthorities, startRun,
} from '@/lib/db/processes'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

import { dueKey, narrowToViewerTeams } from './use-due-runs'
import { useProcessOccurrences } from './use-process-occurrences'

const mockOccurrences = vi.mocked(listProcessOccurrenceSummaries)
const mockStartable = vi.mocked(listStartableProcessRuns)
const mockCanStart = vi.mocked(canStartProcessForTeam)
const mockCanClose = vi.mocked(canCloseProcessRun)
const mockAuthorities = vi.mocked(listProcessOccurrenceAuthorities)
const mockStartRun = vi.mocked(startRun)
const mockViewerTeams = vi.mocked(listCafeViewerTeams)
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

function occurrenceRow(runId: string, teamId: string): ProcessOccurrenceSummary {
  return {
    run: {
      id: runId, work_line_id: 'wl-1', owning_team_id: teamId, period_key: '2026-07-17',
      caption: `Opening ${runId}`, scheduled_date: '2026-07-17', status: 'open', definition_version: 1,
      started_by: VIEWER_ID, completed_at: null, completed_by: null, cancelled_at: null,
      cancelled_by: null, cancel_reason: null,
    },
    team_name: `Team ${teamId}`,
    rollup: {
      process_run_id: runId, caption: `Opening ${runId}`, scheduled_date: '2026-07-17',
      status: 'open', total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, overdue: 0,
      pending_unresolved: 0, completion_pct: 0,
    },
  }
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
  mockOccurrences.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false })
  mockStartable.mockResolvedValue([])
  mockCanStart.mockResolvedValue(true)
  mockCanClose.mockResolvedValue(true)
  mockAuthorities.mockResolvedValue([])
  mockViewerTeams.mockResolvedValue([])
})

describe('narrowToViewerTeams', () => {
  const rows = [
    dueRow({ owning_team_id: 'team-1' }),
    dueRow({ owning_team_id: 'team-2', work_line_id: 'wl-2' }),
  ]

  it('offers only the viewer’s own Teams when they hold any', () => {
    expect(narrowToViewerTeams(rows, ['team-2']).map((r) => r.owning_team_id)).toEqual(['team-2'])
  })

  it('keeps every server-authorized row for a viewer with zero memberships (pure admin)', () => {
    expect(narrowToViewerTeams(rows, [])).toHaveLength(2)
  })

  it('keeps every row when none of the viewer’s Teams are due', () => {
    expect(narrowToViewerTeams(rows, ['team-9'])).toHaveLength(2)
  })

  it('keys a due run by work line, team and period', () => {
    expect(dueKey(dueRow())).toBe('wl-1:team-1:2026-07-17')
  })
})

describe('useProcessOccurrences', () => {
  it('batches start and close authority for one page and exposes only allowed actions', async () => {
    setAuthAs(['ops_lead'])
    mockOccurrences.mockResolvedValue({
      rows: [occurrenceRow('run-1', 'team-1'), occurrenceRow('run-2', 'team-1')],
      nextCursor: null,
      hasMore: false,
    })
    mockAuthorities.mockResolvedValue([
      { authority_kind: 'start', target_id: 'team-1', allowed: true },
      { authority_kind: 'close', target_id: 'run-1', allowed: true },
      { authority_kind: 'close', target_id: 'run-2', allowed: false },
    ])

    const { result } = renderHook(() => useProcessOccurrences('wl-1'))

    await waitFor(() => expect(result.current.closableRunIds.has('run-1')).toBe(true))
    expect(result.current.startableTeamIds).toEqual(new Set(['team-1']))
    expect(result.current.closableRunIds).toEqual(new Set(['run-1']))
    expect(mockAuthorities).toHaveBeenCalledTimes(1)
    expect(mockAuthorities).toHaveBeenCalledWith(['team-1'], ['run-1', 'run-2'])
    expect(mockCanStart).not.toHaveBeenCalled()
    expect(mockCanClose).not.toHaveBeenCalled()
  })

  it('batches authority again for a continuation page without dropping earlier actions', async () => {
    setAuthAs(['ops_lead'])
    mockOccurrences.mockResolvedValueOnce({
      rows: [occurrenceRow('run-1', 'team-1')],
      nextCursor: { id: 'run-1', scheduled_date: '2026-07-17' },
      hasMore: true,
    }).mockResolvedValueOnce({
      rows: [occurrenceRow('run-2', 'team-2')], nextCursor: null, hasMore: false,
    })
    mockAuthorities.mockImplementation(async (teamIds, runIds) => [
      ...teamIds.map((target_id) => ({ authority_kind: 'start' as const, target_id, allowed: true })),
      ...runIds.map((target_id) => ({ authority_kind: 'close' as const, target_id, allowed: true })),
    ])

    const { result } = renderHook(() => useProcessOccurrences('wl-1'))
    await waitFor(() => expect(result.current.closableRunIds.has('run-1')).toBe(true))

    await act(async () => { await result.current.loadMore() })

    expect(result.current.occurrences).toHaveLength(2)
    expect(result.current.startableTeamIds).toEqual(new Set(['team-1', 'team-2']))
    expect(result.current.closableRunIds).toEqual(new Set(['run-1', 'run-2']))
    expect(mockAuthorities).toHaveBeenNthCalledWith(1, ['team-1'], ['run-1'])
    expect(mockAuthorities).toHaveBeenNthCalledWith(2, ['team-2'], ['run-2'])
  })

  it('fails closed when the batched authority check fails without losing readable occurrences', async () => {
    setAuthAs(['ops_lead'])
    mockOccurrences.mockResolvedValue({
      rows: [occurrenceRow('run-1', 'team-1')], nextCursor: null, hasMore: false,
    })
    mockAuthorities.mockRejectedValue(new Error('authority unavailable'))

    const { result } = renderHook(() => useProcessOccurrences('wl-1'))

    await waitFor(() => expect(result.current.authorityError).toBe(true))
    expect(result.current.state).toBe('ready')
    expect(result.current.occurrences).toHaveLength(1)
    expect(result.current.startableTeamIds.size).toBe(0)
    expect(result.current.closableRunIds.size).toBe(0)
  })

  it('reads the startable runs from the server and narrows them to the viewer’s Teams', async () => {
    setAuthAs(['ops_lead'])
    mockStartable.mockResolvedValue([
      dueRow({ owning_team_id: 'team-1' }),
      dueRow({ owning_team_id: 'team-2', work_line_id: 'wl-2' }),
    ])
    mockViewerTeams.mockResolvedValue([{ id: 'team-1' }] as never)
    const { result } = renderHook(() => useProcessOccurrences('wl-1'))
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.startable.map((r) => r.owning_team_id)).toEqual(['team-1'])
  })

  it('stays inert, with no reads, when there is no work line', async () => {
    setAuthAs(['ops_lead'])
    renderHook(() => useProcessOccurrences(null))
    await act(async () => { await Promise.resolve() })
    expect(mockOccurrences).not.toHaveBeenCalled()
    expect(mockStartable).not.toHaveBeenCalled()
  })

  it('reloads when the mounted viewer changes', async () => {
    setAuthAs(['ops_lead'], 'viewer-a', 'org-1')
    mockStartable.mockResolvedValueOnce([dueRow({ work_line_id: 'wl-a' })])
      .mockResolvedValueOnce([dueRow({ work_line_id: 'wl-b' })])
    const view = renderHook(() => useProcessOccurrences('wl-1'))
    await waitFor(() => expect(view.result.current.startable[0]?.work_line_id).toBe('wl-a'))

    setAuthAs(['ops_lead'], 'viewer-b', 'org-2')
    view.rerender()

    await waitFor(() => expect(view.result.current.startable[0]?.work_line_id).toBe('wl-b'))
    expect(mockStartable).toHaveBeenCalledTimes(2)
  })

  it('shows the error state when the read fails, and retry recovers', async () => {
    setAuthAs(['ops_lead'])
    mockOccurrences.mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useProcessOccurrences('wl-1'))
    await waitFor(() => expect(result.current.state).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.state).toBe('ready'))
  })

  it('start calls startRun, fires onChanged, and refetches', async () => {
    setAuthAs(['ops_lead'])
    const row = dueRow()
    mockStartable.mockResolvedValue([row])
    mockStartRun.mockResolvedValue({ run_id: 'run-1', created: 2, pending: 1, idempotent: false })
    const onChanged = vi.fn()

    const { result } = renderHook(() => useProcessOccurrences('wl-1', onChanged))
    await waitFor(() => expect(result.current.startable).toHaveLength(1))

    await act(async () => { await result.current.start(row) })

    expect(mockStartRun).toHaveBeenCalledWith('wl-1', 'team-1', '2026-07-17')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(mockStartable).toHaveBeenCalledTimes(2)
  })

  it('start sets startError on rejection and clears it on a retried success', async () => {
    setAuthAs(['ops_lead'])
    const row = dueRow()
    mockStartable.mockResolvedValue([row])
    mockStartRun.mockRejectedValueOnce(new Error('lost race'))
    mockStartRun.mockResolvedValueOnce({ run_id: 'run-2', created: 1, pending: 0, idempotent: false })

    const { result } = renderHook(() => useProcessOccurrences('wl-1'))
    await waitFor(() => expect(result.current.startable).toHaveLength(1))

    await act(async () => { await result.current.start(row) })
    expect(result.current.startError).toBe(true)
    expect(result.current.startingKey).toBeNull()

    await act(async () => { await result.current.start(row) })
    expect(result.current.startError).toBe(false)
  })
})
