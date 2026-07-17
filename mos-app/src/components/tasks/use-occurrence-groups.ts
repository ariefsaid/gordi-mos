/**
 * useOccurrenceGroups (CQ IMPORTANT-2, decomposition of tasks-workspace.tsx) — owns everything
 * behind the "occurrence" group-by dimension (Step 6 / ADR-0051 Track C):
 *   - the derived per-run roll-ups (runRollups), fetched for the runs actually in view;
 *   - the assign-dialog's open/close + pending-list load state.
 *
 * Pure extraction: the behavior (including the ONE deduped visibleRunIds memo, previously
 * duplicated verbatim at two call sites in tasks-workspace.tsx) is unchanged — only the
 * ownership moved. `allTasks` and `groupBy` are the host's current data/view state; `load` is
 * the host's own task-list refetch, invoked after a pending item resolves.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { listRunRollups, listPendingTasks } from '@/lib/db/processes'
import type { ProcessRunRollup, PendingTaskRow } from '@/lib/db/processes.types'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { TasksGroupBy } from './use-tasks-view-pref'

export interface UseOccurrenceGroupsResult {
  runRollups: Map<string, ProcessRunRollup>
  assignRunId: string | null
  pendingForAssign: PendingTaskRow[]
  pendingLoading: boolean
  pendingError: boolean
  openAssignPending: (runId: string) => void
  handlePendingResolved: (taskId: string, pendingId: string) => void
  closeAssign: () => void
}

export function useOccurrenceGroups(
  allTasks: TaskListRow[],
  groupBy: TasksGroupBy,
  load: () => void,
): UseOccurrenceGroupsResult {
  const [runRollups, setRunRollups] = useState<Map<string, ProcessRunRollup>>(new Map())
  const [assignRunId, setAssignRunId] = useState<string | null>(null)
  const [pendingForAssign, setPendingForAssign] = useState<PendingTaskRow[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState(false)

  // The ONE deduped, sorted set of run ids actually in view — was duplicated verbatim at two
  // call sites (the roll-up-load effect and handlePendingResolved) before this extraction.
  const visibleRunIds = useMemo(
    () => Array.from(new Set(
      allTasks.map(row => row.process_run_id).filter((id): id is string => Boolean(id)),
    )).sort(),
    [allTasks],
  )

  const loadRunRollups = useCallback((runIds: string[]) => {
    if (runIds.length === 0) { setRunRollups(new Map()); return }
    listRunRollups(runIds)
      .then(rows => setRunRollups(new Map(rows.map(r => [r.process_run_id, r]))))
      .catch(() => {
        // CQ minor-1: keep the previous roll-ups (the header falls back to the plain
        // count/overdue grammar) but no longer swallow the failure without a trace.
        console.warn('[useOccurrenceGroups] roll-up fetch failed — keeping previous roll-ups')
      })
  }, [])

  useEffect(() => {
    if (groupBy !== 'occurrence') return
    loadRunRollups(visibleRunIds)
  }, [groupBy, visibleRunIds, loadRunRollups])

  const openAssignPending = useCallback((runId: string) => {
    setAssignRunId(runId)
    setPendingLoading(true)
    setPendingError(false)
    listPendingTasks(runId)
      .then(rows => { setPendingForAssign(rows); setPendingLoading(false) })
      .catch(() => { setPendingError(true); setPendingLoading(false) })
  }, [])

  const handlePendingResolved = useCallback((_taskId: string, pendingId: string) => {
    setPendingForAssign(prev => prev.filter(p => p.id !== pendingId))
    load() // refetch so the newly-materialized Task appears in the group
    loadRunRollups(visibleRunIds) // pendingUnresolved just dropped — refresh the roll-up counts too
  }, [load, loadRunRollups, visibleRunIds])

  const closeAssign = useCallback(() => setAssignRunId(null), [])

  return {
    runRollups, assignRunId, pendingForAssign, pendingLoading, pendingError,
    openAssignPending, handlePendingResolved, closeAssign,
  }
}
