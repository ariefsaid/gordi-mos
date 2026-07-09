import type { TaskListRow } from '@/lib/db/tasks.types'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { raciOwner } from '@/lib/raci-member'

export type LadderObjectiveGroup = {
  key: string
  label: string
  isUnlinked: boolean
  workLines: LadderWorkLineGroup[]
}

export type LadderWorkLineGroup = {
  key: string
  label: string
  type: 'project' | 'process' | null
  isNoWorkLine: boolean
  tasks: TaskListRow[]
}

export type Ladder = LadderObjectiveGroup[]

export type BuildLadderInput = {
  objectives: ObjectiveRow[]
  workLines: WorkLineRow[]
  tasks: TaskListRow[]
  viewerId: string | null
  mine: boolean
  /**
   * Resolved group labels + catalog-resilience fallbacks (FR-321 / ADR-0021 i18n strings).
   * `untitledObjective` / `untitledWorkLine` are used when a task references a catalog row that
   * hasn't loaded yet (empty/late/failed catalog) — see `useCascadeCatalogs` non-blocking contract.
   */
  labels: {
    unlinked: string
    noWorkLine: string
    untitledObjective: string
    untitledWorkLine: string
  }
}

const UNLINKED = '__unlinked__'
const NO_WL = '__no_workline__'

/**
 * Build the objective → work_line → task ladder.
 *
 * Catalog resilience (review fix #4): a task is NEVER dropped because its objective/work_line
 * catalog entry is missing. `useCascadeCatalogs` is non-blocking and may be empty/late/failed; if a
 * task references an id that isn't in the loaded catalog, we still render the branch under a
 * fallback label (`untitledObjective` / `untitledWorkLine`) so linked tasks never vanish. Catalog
 * order is preserved; orphan ids (not in the catalog) are appended after catalog rows, and the
 * synthetic `(Unlinked)` / `No Project/Process` branches go last within their level.
 */
export function buildLadder(input: BuildLadderInput): Ladder {
  const { objectives, workLines, viewerId, mine, labels } = input
  const tasks = mine && viewerId
    ? input.tasks.filter((task) => raciOwner(task, viewerId))
    : input.tasks

  // Group tasks by their objective_id (null → UNLINKED).
  const byObjective = new Map<string, TaskListRow[]>()
  for (const task of tasks) {
    const key = task.objective_id ?? UNLINKED
    const group = byObjective.get(key) ?? []
    group.push(task)
    byObjective.set(key, group)
  }

  // Objective key order: catalog order (those that have tasks), then orphan ids the catalog
  // doesn't know (rendered under a fallback label so their tasks aren't dropped), then UNLINKED.
  const catalogObjectiveIds = objectives.map((objective) => objective.id)
  const knownObjectiveIds = new Set(catalogObjectiveIds)
  const orphanObjectiveIds = [...byObjective.keys()].filter(
    (key) => key !== UNLINKED && !knownObjectiveIds.has(key),
  )
  const objectiveKeys = [
    ...catalogObjectiveIds.filter((key) => byObjective.has(key)),
    ...orphanObjectiveIds,
  ]
  if (byObjective.has(UNLINKED)) objectiveKeys.push(UNLINKED)

  const ladder: Ladder = []
  for (const objectiveKey of objectiveKeys) {
    const objectiveTasks = byObjective.get(objectiveKey)
    // objectiveKeys only contains ids that have tasks (catalog ids filtered by byObjective.has,
    // orphans straight from byObjective.keys, UNLINKED guarded) — so this is never empty.
    if (!objectiveTasks || objectiveTasks.length === 0) continue

    // Sub-group this objective's tasks by work_line_id (null → NO_WL).
    const byWorkLine = new Map<string, TaskListRow[]>()
    for (const task of objectiveTasks) {
      const key = task.work_line_id ?? NO_WL
      const group = byWorkLine.get(key) ?? []
      group.push(task)
      byWorkLine.set(key, group)
    }

    // Work-line key order: catalog order, then orphans (fallback label), then NO_WL.
    const catalogWorkLineIds = workLines.map((workLine) => workLine.id)
    const knownWorkLineIds = new Set(catalogWorkLineIds)
    const orphanWorkLineIds = [...byWorkLine.keys()].filter(
      (key) => key !== NO_WL && !knownWorkLineIds.has(key),
    )
    const workLineKeys = [
      ...catalogWorkLineIds.filter((key) => byWorkLine.has(key)),
      ...orphanWorkLineIds,
    ]
    if (byWorkLine.has(NO_WL)) workLineKeys.push(NO_WL)

    const workLineGroups: LadderWorkLineGroup[] = []
    for (const workLineKey of workLineKeys) {
      const workLineTasks = byWorkLine.get(workLineKey)
      if (!workLineTasks) continue

      if (workLineKey === NO_WL) {
        workLineGroups.push({
          key: NO_WL,
          label: labels.noWorkLine,
          type: null,
          isNoWorkLine: true,
          tasks: workLineTasks,
        })
        continue
      }

      // Degrade to a fallback label when the catalog hasn't loaded this work_line — never drop.
      const workLine = workLines.find((item) => item.id === workLineKey)
      workLineGroups.push({
        key: workLineKey,
        label: workLine?.name ?? labels.untitledWorkLine,
        type: workLine?.type ?? null,
        isNoWorkLine: false,
        tasks: workLineTasks,
      })
    }

    if (objectiveKey === UNLINKED) {
      ladder.push({
        key: UNLINKED,
        label: labels.unlinked,
        isUnlinked: true,
        workLines: workLineGroups,
      })
      continue
    }

    // Degrade to a fallback label when the catalog hasn't loaded this objective — never drop.
    const objective = objectives.find((item) => item.id === objectiveKey)
    ladder.push({
      key: objectiveKey,
      label: objective?.name ?? labels.untitledObjective,
      isUnlinked: false,
      workLines: workLineGroups,
    })
  }

  return ladder
}
