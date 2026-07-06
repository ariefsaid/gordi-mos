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
  labels: { unlinked: string; noWorkLine: string }
}

const UNLINKED = '__unlinked__'
const NO_WL = '__no_workline__'

export function buildLadder(input: BuildLadderInput): Ladder {
  const { objectives, workLines, viewerId, mine, labels } = input
  const tasks = mine && viewerId
    ? input.tasks.filter((task) => raciOwner(task, viewerId))
    : input.tasks

  const byObjective = new Map<string, TaskListRow[]>()
  for (const task of tasks) {
    const key = task.objective_id ?? UNLINKED
    const group = byObjective.get(key) ?? []
    group.push(task)
    byObjective.set(key, group)
  }

  const objectiveKeys = objectives.map((objective) => objective.id)
  if (byObjective.has(UNLINKED)) objectiveKeys.push(UNLINKED)

  const ladder: Ladder = []
  for (const objectiveKey of objectiveKeys) {
    const objectiveTasks = byObjective.get(objectiveKey)
    if (!objectiveTasks || objectiveTasks.length === 0) continue

    const byWorkLine = new Map<string, TaskListRow[]>()
    for (const task of objectiveTasks) {
      const key = task.work_line_id ?? NO_WL
      const group = byWorkLine.get(key) ?? []
      group.push(task)
      byWorkLine.set(key, group)
    }

    const workLineKeys = workLines.filter((workLine) => byWorkLine.has(workLine.id)).map((workLine) => workLine.id)
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

      const workLine = workLines.find((item) => item.id === workLineKey)
      if (!workLine) continue
      workLineGroups.push({
        key: workLine.id,
        label: workLine.name,
        type: workLine.type,
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

    const objective = objectives.find((item) => item.id === objectiveKey)
    if (!objective) continue
    ladder.push({
      key: objective.id,
      label: objective.name,
      isUnlinked: false,
      workLines: workLineGroups,
    })
  }

  return ladder
}
