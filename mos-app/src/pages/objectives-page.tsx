// ObjectivesPage — admin-only Objectives catalog, now Work's manage-mode (route /work/objectives
// behind RequireCapability objective.manage). Thin wrapper over the shared CatalogManager + a
// down-trace read (FR-422): each objective shows its child work_lines + the non-archived task count
// per work_line, computed over listTasks + listWorkLinesAll (no schema change — NFR-404 reuse).
import { useEffect, useState } from 'react'
import { CatalogManager, type CatalogItem, type CatalogTrace } from '@/components/catalog/catalog-manager'
import {
  listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
} from '@/lib/db/objectives'
import { listWorkLinesAll } from '@/lib/db/work-lines'
import { listTasks } from '@/lib/db/tasks'

/**
 * Down-trace resolver (FR-422). For each objective, loads non-archived tasks + work_lines once and
 * builds a Map<objectiveId, CatalogTrace> rendering "<total> tasks · W1 (n1), W2 (n2)". Best-effort
 * (a load failure leaves the trace empty — the create/rename/archive behavior is unchanged).
 */
function useObjectiveDownTrace(): (item: CatalogItem) => CatalogTrace | undefined {
  const [map, setMap] = useState<Map<string, CatalogTrace>>(new Map())
  useEffect(() => {
    let cancelled = false
    Promise.all([listTasks({}), listWorkLinesAll()])
      .then(([tasks, workLines]) => {
        if (cancelled) return
        const wlName = new Map(workLines.map((w) => [w.id, w.name]))
        // objectiveId → (workLineId → task count)
        const byObjective = new Map<string, Map<string, number>>()
        for (const task of tasks) {
          if (!task.objective_id) continue
          const inner = byObjective.get(task.objective_id) ?? new Map<string, number>()
          const wlKey = task.work_line_id ?? '__none__'
          inner.set(wlKey, (inner.get(wlKey) ?? 0) + 1)
          byObjective.set(task.objective_id, inner)
        }
        const next = new Map<string, CatalogTrace>()
        for (const [objectiveId, wlCounts] of byObjective) {
          const total = [...wlCounts.values()].reduce((sum, n) => sum + n, 0)
          if (total === 0) continue
          const named = [...wlCounts.entries()]
            .filter(([wlKey]) => wlKey !== '__none__' && wlName.has(wlKey))
            .map(([wlKey, n]) => `${wlName.get(wlKey)} (${n})`)
          const line = named.length > 0
            ? `${total} task${total === 1 ? '' : 's'} · ${named.join(', ')}`
            : `${total} task${total === 1 ? '' : 's'}`
          next.set(objectiveId, { line })
        }
        setMap(next)
      })
      .catch(() => { /* trace is best-effort — leave empty */ })
    return () => { cancelled = true }
  }, [])
  return (item: CatalogItem) => map.get(item.id)
}

export function ObjectivesPage() {
  const traceFor = useObjectiveDownTrace()
  return (
    <CatalogManager
      title="Objectives"
      subtitle="Yearly goals that work rolls up to. Admin-managed."
      noun="objective"
      load={listObjectivesAll}
      create={(name) => createObjective(name)}
      rename={renameObjective}
      setArchived={setObjectiveArchived}
      traceFor={traceFor}
    />
  )
}
