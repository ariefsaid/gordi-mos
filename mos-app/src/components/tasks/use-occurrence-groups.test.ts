import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { PendingTaskRow, ProcessRunRollup } from '@/lib/db/processes.types'

// CQ IMPORTANT-2: component tests mock the DAL, never a live DB.
vi.mock('@/lib/db/processes', () => ({ listRunRollups: vi.fn(), listPendingTasks: vi.fn(), listTaskDefs: vi.fn() }))
import { listRunRollups, listPendingTasks, listTaskDefs } from '@/lib/db/processes'

// Design fix wave item 4 — the "via <role name>" provenance line's role-name batch lookup.
vi.mock('@/lib/db/directory', () => ({ listRoleNames: vi.fn() }))
import { listRoleNames } from '@/lib/db/directory'

import { useOccurrenceGroups } from './use-occurrence-groups'

const mockListRunRollups = vi.mocked(listRunRollups)
const mockListPendingTasks = vi.mocked(listPendingTasks)
const mockListTaskDefs = vi.mocked(listTaskDefs)
const mockListRoleNames = vi.mocked(listRoleNames)

function task(overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: 'task-1', title: 'A task', status: 'Open', business_unit_id: 'bu-1',
    responsible_person_id: 'p-1', accountable_person_id: 'p-1',
    due_date: null, last_activity_at: '2026-07-17T00:00:00Z', archived_at: null,
    process_run_id: null,
    ...overrides,
  } as TaskListRow
}

function rollup(runId: string, overrides: Partial<ProcessRunRollup> = {}): ProcessRunRollup {
  return {
    process_run_id: runId, caption: 'Café Opening · 17 Jul 2026',
    total: 2, done: 0, overdue: 0, pending_unresolved: 0,
    ...overrides,
  } as ProcessRunRollup
}

const pending: PendingTaskRow = {
  id: 'pending-1', process_run_id: 'run-1', task_def_id: 'def-1',
  candidate_person_ids: ['p-a', 'p-b'], reason: 'multiple', resolved_at: null,
  title: 'Bakery handover',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockListRunRollups.mockResolvedValue([])
  mockListPendingTasks.mockResolvedValue([])
  mockListTaskDefs.mockResolvedValue([])
  mockListRoleNames.mockResolvedValue([])
})

describe('useOccurrenceGroups (CQ IMPORTANT-2 decomposition)', () => {
  it('does not fetch roll-ups when groupBy is not "occurrence"', () => {
    const tasks = [task({ id: 't1', process_run_id: 'run-1' })]
    renderHook(() => useOccurrenceGroups(tasks, 'status', vi.fn()))
    expect(mockListRunRollups).not.toHaveBeenCalled()
  })

  it('fetches roll-ups for the deduped, sorted set of visible run ids when groupBy is "occurrence"', async () => {
    const tasks = [
      task({ id: 't1', process_run_id: 'run-2' }),
      task({ id: 't2', process_run_id: 'run-1' }),
      task({ id: 't3', process_run_id: 'run-1' }), // duplicate — must be deduped
      task({ id: 't4', process_run_id: null }),    // ad-hoc — must be excluded
    ]
    mockListRunRollups.mockResolvedValue([rollup('run-1'), rollup('run-2')])
    const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

    await waitFor(() => expect(mockListRunRollups).toHaveBeenCalledWith(['run-1', 'run-2']))
    await waitFor(() => expect(result.current.runRollups.get('run-1')).toBeDefined())
    expect(result.current.runRollups.get('run-2')).toBeDefined()
  })

  it('openAssignPending loads pending tasks for the run, tracking loading/error state', async () => {
    mockListPendingTasks.mockResolvedValue([pending])
    const { result } = renderHook(() => useOccurrenceGroups([], 'none', vi.fn()))

    act(() => { result.current.openAssignPending('run-1') })
    expect(result.current.assignRunId).toBe('run-1')
    expect(result.current.pendingLoading).toBe(true)
    expect(result.current.pendingError).toBe(false)

    await waitFor(() => expect(result.current.pendingLoading).toBe(false))
    expect(result.current.pendingForAssign).toEqual([pending])
    expect(mockListPendingTasks).toHaveBeenCalledWith('run-1')
  })

  it('openAssignPending sets pendingError on a listPendingTasks rejection', async () => {
    mockListPendingTasks.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useOccurrenceGroups([], 'none', vi.fn()))

    act(() => { result.current.openAssignPending('run-1') })
    await waitFor(() => expect(result.current.pendingLoading).toBe(false))
    expect(result.current.pendingError).toBe(true)
  })

  it('handlePendingResolved drops the resolved item, refetches the host list, and re-fetches roll-ups', async () => {
    const tasks = [task({ id: 't1', process_run_id: 'run-1' })]
    mockListPendingTasks.mockResolvedValue([pending, { ...pending, id: 'pending-2' }])
    const load = vi.fn()
    const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', load))

    await waitFor(() => expect(mockListRunRollups).toHaveBeenCalledTimes(1))
    act(() => { result.current.openAssignPending('run-1') })
    await waitFor(() => expect(result.current.pendingForAssign).toHaveLength(2))

    act(() => { result.current.handlePendingResolved('task-9', 'pending-1') })

    expect(result.current.pendingForAssign).toEqual([{ ...pending, id: 'pending-2' }])
    // Other pending rows remain → the dialog stays open for them.
    expect(result.current.assignRunId).toBe('run-1')
    expect(load).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mockListRunRollups).toHaveBeenCalledTimes(2))
  })

  it('handlePendingResolved auto-closes the dialog when the LAST pending row resolves (AC-630 journey — no dead-end Close click)', async () => {
    const tasks = [task({ id: 't1', process_run_id: 'run-1' })]
    mockListPendingTasks.mockResolvedValue([pending])
    const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

    act(() => { result.current.openAssignPending('run-1') })
    await waitFor(() => expect(result.current.pendingForAssign).toHaveLength(1))

    act(() => { result.current.handlePendingResolved('task-9', 'pending-1') })

    expect(result.current.pendingForAssign).toEqual([])
    expect(result.current.assignRunId).toBeNull()
  })

  it('closeAssign clears the open assign-dialog run id', async () => {
    const { result } = renderHook(() => useOccurrenceGroups([], 'none', vi.fn()))
    act(() => { result.current.openAssignPending('run-1') })
    expect(result.current.assignRunId).toBe('run-1')
    await waitFor(() => expect(result.current.pendingLoading).toBe(false))

    act(() => { result.current.closeAssign() })
    expect(result.current.assignRunId).toBeNull()
  })

  it('a roll-up fetch failure is swallowed with a console.warn (CQ minor-1) and keeps the previous roll-ups', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockListRunRollups.mockRejectedValue(new Error('rollup fetch failed'))
    const tasks = [task({ id: 't1', process_run_id: 'run-1' })]
    renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

    await waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })

  // Design fix wave item 4 (OD-65 mockup regression) — occurrence-grouped rows must show the
  // generated-ownership source ("via <role name>") beside the PIC when the task carries
  // generated_from_task_def_id and the def binds a pic_role.
  describe('provenanceByTaskDefId (item 4)', () => {
    it('does not fetch task-defs/roles when groupBy is not "occurrence"', () => {
      const tasks = [task({ id: 't1', generated_from_task_def_id: 'def-1' })]
      renderHook(() => useOccurrenceGroups(tasks, 'status', vi.fn()))
      expect(mockListTaskDefs).not.toHaveBeenCalled()
    })

    it('resolves a role-bound def to "via <role name>" for the deduped set of generated_from_task_def_id values in view', async () => {
      const tasks = [
        task({ id: 't1', process_run_id: 'run-1', generated_from_task_def_id: 'def-1' }),
        task({ id: 't2', process_run_id: 'run-1', generated_from_task_def_id: 'def-1' }), // dup — deduped
        task({ id: 't3', process_run_id: 'run-1', generated_from_task_def_id: null }), // none — excluded
      ]
      mockListTaskDefs.mockResolvedValue([{ id: 'def-1', title: 'Unlock and prep the floor', pic_role_id: 'role-1' }])
      mockListRoleNames.mockResolvedValue([{ id: 'role-1', name: 'Cafe Ops Lead' }])

      const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

      await waitFor(() => expect(mockListTaskDefs).toHaveBeenCalledWith(['def-1']))
      await waitFor(() => expect(mockListRoleNames).toHaveBeenCalledWith(['role-1']))
      await waitFor(() => expect(result.current.provenanceByTaskDefId.get('def-1')).toBe('Cafe Ops Lead'))
    })

    it('a person-bound def (no pic_role_id) never fetches role names and gets no provenance entry', async () => {
      const tasks = [task({ id: 't1', process_run_id: 'run-1', generated_from_task_def_id: 'def-2' })]
      mockListTaskDefs.mockResolvedValue([{ id: 'def-2', title: 'Bakery handover', pic_role_id: null }])

      const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

      await waitFor(() => expect(mockListTaskDefs).toHaveBeenCalled())
      expect(mockListRoleNames).not.toHaveBeenCalled()
      expect(result.current.provenanceByTaskDefId.has('def-2')).toBe(false)
    })

    it('a task-defs/role-names fetch failure is swallowed with a console.warn and never blocks the group render', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockListTaskDefs.mockRejectedValue(new Error('defs fetch failed'))
      const tasks = [task({ id: 't1', process_run_id: 'run-1', generated_from_task_def_id: 'def-1' })]

      const { result } = renderHook(() => useOccurrenceGroups(tasks, 'occurrence', vi.fn()))

      await waitFor(() => expect(warn).toHaveBeenCalled())
      expect(result.current.provenanceByTaskDefId.size).toBe(0)
      warn.mockRestore()
    })
  })
})
