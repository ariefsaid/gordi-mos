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
import { listRunRollups, listPendingTasks, listTaskDefs } from '@/lib/db/processes'
import { listRoleNames } from '@/lib/db/directory'
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
  /**
   * Design fix wave item 4 (OD-65 mockup regression) — task_def_id → the def's binding pic_role
   * NAME, for every generated_from_task_def_id in view whose def binds a Role (never a
   * person-bound def, and never a def whose role name couldn't be resolved). Backs the
   * "via <role name>" generated-ownership provenance line beside the PIC on occurrence-grouped
   * rows (desktop TaskRow + phone TaskCard).
   */
  provenanceByTaskDefId: Map<string, string>
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
    setPendingForAssign(prev => {
      const next = prev.filter(p => p.id !== pendingId)
      // Resolving the LAST pending row completes the user's job here — auto-close instead of
      // leaving an empty modal that needs a dead-end Close click (AC-630 journey).
      if (next.length === 0) setAssignRunId(null)
      return next
    })
    load() // refetch so the newly-materialized Task appears in the group
    loadRunRollups(visibleRunIds) // pendingUnresolved just dropped — refresh the roll-up counts too
  }, [load, loadRunRollups, visibleRunIds])

  const closeAssign = useCallback(() => setAssignRunId(null), [])

  // ── Design fix wave item 4 — the "via <role name>" provenance line ────────────────────────────
  const [provenanceByTaskDefId, setProvenanceByTaskDefId] = useState<Map<string, string>>(new Map())

  // The deduped set of generated_from_task_def_id values actually in view (ad-hoc Tasks, whose
  // field is null, are excluded — mirrors visibleRunIds' filter-and-dedupe shape above).
  const visibleTaskDefIds = useMemo(
    () => Array.from(new Set(
      allTasks.map(row => row.generated_from_task_def_id).filter((id): id is string => Boolean(id)),
    )).sort(),
    [allTasks],
  )

  const loadProvenance = useCallback((defIds: string[]) => {
    if (defIds.length === 0) { setProvenanceByTaskDefId(new Map()); return }
    listTaskDefs(defIds)
      .then((defs) => {
        const roleIds = Array.from(new Set(
          defs.map(def => def.pic_role_id).filter((id): id is string => Boolean(id)),
        ))
        if (roleIds.length === 0) { setProvenanceByTaskDefId(new Map()); return }
        return listRoleNames(roleIds).then((roles) => {
          const nameByRoleId = new Map(roles.map(role => [role.id, role.name]))
          const next = new Map<string, string>()
          for (const def of defs) {
            const name = def.pic_role_id ? nameByRoleId.get(def.pic_role_id) : undefined
            if (name) next.set(def.id, name)
          }
          setProvenanceByTaskDefId(next)
        })
      })
      .catch(() => {
        // Mirrors the roll-up fetch's CQ minor-1 pattern: the provenance line is a nice-to-have
        // annotation, never a blocker — keep the previous map and trace the failure.
        console.warn('[useOccurrenceGroups] provenance fetch failed — keeping previous provenance')
      })
  }, [])

  useEffect(() => {
    if (groupBy !== 'occurrence') return
    loadProvenance(visibleTaskDefIds)
  }, [groupBy, visibleTaskDefIds, loadProvenance])

  return {
    runRollups, assignRunId, pendingForAssign, pendingLoading, pendingError,
    openAssignPending, handlePendingResolved, closeAssign, provenanceByTaskDefId,
  }
}
