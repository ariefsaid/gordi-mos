// ProjectsProcessesPage — Projects & Processes catalog, now Work's manage-mode (route
// /work/projects-processes behind RequireCapability workline.manage). The physical table is
// mos.work_lines (ADR-0015); the UI term is Project/Process. Thin wrapper over CatalogManager +
// an up-trace read (FR-422): each work_line shows its parent objective(s) + task count, inferred
// from task linkage (work_lines has no objective_id column) over listTasks + listObjectivesAll.
import { useEffect, useState } from 'react'
import { useT } from '@/i18n/use-t'
import { CatalogManager, type CatalogItem, type CatalogTrace } from '@/components/catalog/catalog-manager'
import {
  listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived,
} from '@/lib/db/work-lines'
import { listObjectivesAll } from '@/lib/db/objectives'
import { listTasks } from '@/lib/db/tasks'

import type { TagColor } from '@/components/ui/tag'

const TYPE_LABEL: Record<'project' | 'process', string> = {
  project: 'Project',
  process: 'Process',
}

// Distinct tag colors so the type is scannable at a glance (design-review Lens A/D).
const TYPE_COLOR: Record<'project' | 'process', TagColor> = {
  project: 'blue',
  process: 'sand',
}

/**
 * Up-trace resolver (FR-422). work_lines has no objective_id column, so the parent objective(s) are
 * inferred from task linkage: for each work_line, the set of objectives its non-archived tasks
 * point to, each with its task count. Loads listTasks + listObjectivesAll once; best-effort.
 */
function useWorkLineUpTrace(): (item: CatalogItem) => CatalogTrace | undefined {
  const [map, setMap] = useState<Map<string, CatalogTrace>>(new Map())
  useEffect(() => {
    let cancelled = false
    Promise.all([listTasks({}), listObjectivesAll()])
      .then(([tasks, objectives]) => {
        if (cancelled) return
        const objName = new Map(objectives.map((o) => [o.id, o.name]))
        // workLineId → (objectiveId | '' → task count). '' buckets tasks that have a work_line
        // but no parent objective (FR-422 edge case: don't drop them — surface the count).
        const NO_OBJ = ''
        const byWorkLine = new Map<string, Map<string, number>>()
        for (const task of tasks) {
          if (!task.work_line_id) continue
          const key = task.objective_id ?? NO_OBJ
          const inner = byWorkLine.get(task.work_line_id) ?? new Map<string, number>()
          inner.set(key, (inner.get(key) ?? 0) + 1)
          byWorkLine.set(task.work_line_id, inner)
        }
        const next = new Map<string, CatalogTrace>()
        for (const [workLineId, objCounts] of byWorkLine) {
          const segments = [...objCounts.entries()]
            .filter(([objId]) => objId !== NO_OBJ && objName.has(objId))
            .map(([objId, n]) => `${objName.get(objId)} (${n})`)
          const orphan = objCounts.get(NO_OBJ) ?? 0
          if (orphan > 0) segments.push(`no parent objective (${orphan})`)
          if (segments.length === 0) continue
          next.set(workLineId, { line: `Under: ${segments.join(', ')}` })
        }
        setMap(next)
      })
      .catch(() => { /* trace is best-effort — leave empty */ })
    return () => { cancelled = true }
  }, [])
  return (item: CatalogItem) => map.get(item.id)
}

export function ProjectsProcessesPage() {
  const t = useT()
  const traceFor = useWorkLineUpTrace()
  return (
    <CatalogManager
      title="Projects & Processes"
      subtitle="The work-systems that move goals. Managed by ops leads and admins."
      jobSentence={t('job.projects')}
      noun="project / process"
      nounPlural="projects & processes"
      load={async () =>
        (await listWorkLinesAll()).map((w) => ({
          id: w.id,
          name: w.name,
          archived_at: w.archived_at,
          meta: TYPE_LABEL[w.type],
          metaColor: TYPE_COLOR[w.type],
        }))
      }
      create={(name, type) => createWorkLine(name, (type as 'project' | 'process'))}
      rename={renameWorkLine}
      setArchived={setWorkLineArchived}
      traceFor={traceFor}
      typeField={{
        label: 'Type',
        options: [
          { value: 'project', label: 'Project' },
          { value: 'process', label: 'Process' },
        ],
      }}
    />
  )
}
