// Shared Objective → Project/Process → Task relationship rules (#204).
// `buildCascadeGroups` groups the Tasks collection; `buildCatalogRelationProjection` preserves
// stored parents and Task contributions separately for catalog traces and linked-work panels.
// `rollUpCounts` deduplicates the Tasks in cascade groups, then applies catalog relationship rules
// so record counts and their linked-work panels agree.
//
// VOCABULARY (#204 review, finding 5): the (Objective, Project/Process) pair with its Tasks is a
// **cascade group**, never a "branch". CONTEXT.md owns Branch as a first-class domain noun — a
// physical outlet, with its own canonical catalog (`lib/db/branches.ts`) — and a repo-wide search
// for it must return one meaning. "Cascade" is code vocabulary only; it never reaches a route, a
// rail item or a UI label (CONTEXT.md §Cascade), and the user-visible copy here stays
// "No Project/Process" / "(Unlinked)".
//
// Progress is a COUNT ROLL-UP ONLY (OD-WAY-32): `done` and `total`, no measure, no target, no
// percentage. The cascade SCREEN is cut — this projection is what replaced it, living on the
// records themselves.
import type { TaskStatus } from '@/lib/db/tasks.types'

export type CountRollup = { done: number; total: number }
export type ObjectiveRollup = CountRollup & { id: string; name: string }
export type WorkLineRollup = CountRollup & { id: string; name: string; type: 'project' | 'process'; objective_id: string | null }

/** The bucket key for tasks that resolve to no Objective at all. */
export const UNLINKED_OBJECTIVE_KEY = '__unlinked__'
/** The bucket key for an Objective's tasks that carry no Project/Process. */
export const NO_WORK_LINE_KEY = '__no_work_line__'

/** Both synthetic group names. Callers with a `t()` in hand pass translated copy instead. */
export const DEFAULT_CASCADE_GROUP_LABELS = {
  unlinked: '(Unlinked)',
  noWorkLine: 'No Project/Process',
} as const

export type CascadeGroupLabels = { unlinked: string; noWorkLine: string }

/** The minimum a task must carry to be placed in the drill. */
export type CascadeTask = {
  id: string
  status: TaskStatus | string
  objective_id: string | null
  work_line_id: string | null
  archived_at?: string | null
  responsible_person_id?: string | null
  accountable_person_id?: string | null
}

export type RollupTask = CascadeTask & { title?: string }

/**
 * One (Objective, Project/Process) pair, carrying its own tasks and its count roll-up.
 *
 * EITHER half can be synthesised, and a group can be both at once (a task with no Objective and
 * no Project/Process). The synthetic groups are the ones most likely to hold work nobody is
 * tracking, so they are first-class here — never dropped, never merged into a real group.
 */
export type CascadeGroup<T extends CascadeTask = RollupTask> = CountRollup & {
  /** `<objectiveId | __unlinked__>:<workLineId | __no_work_line__>` — stable across renders. */
  key: string
  objectiveId: string | null
  objectiveName: string
  workLineId: string | null
  workLineName: string
  workLineType: 'project' | 'process' | null
  /** True when this group's Objective is the synthesised `(Unlinked)` bucket. */
  syntheticObjective: boolean
  /** True when this group's Project/Process is the synthesised `No Project/Process` bucket. */
  syntheticWorkLine: boolean
  tasks: readonly T[]
}

export type ObjectiveInput = { id: string; name: string }
export type WorkLineInput = { id: string; name: string; type: 'project' | 'process'; objective_id?: string | null }

export type CatalogRelationship = 'direct' | 'contribution' | 'unlinked'
export type CatalogRelationGroup<T extends CascadeTask = RollupTask> = CountRollup & {
  id: string
  name: string
  objectiveId: string | null
  workLineId: string | null
  workLineType: 'project' | 'process' | null
  entity: 'work-line' | 'task' | 'objective'
  relationship: CatalogRelationship
  synthetic?: 'no-work-line' | 'unlinked'
  tasks: readonly T[]
}

export type CatalogRelationProjection<T extends CascadeTask = RollupTask> = {
  byObjectiveId: ReadonlyMap<string, readonly CatalogRelationGroup<T>[]>
  byWorkLineId: ReadonlyMap<string, readonly CatalogRelationGroup<T>[]>
}

export type CascadeGroupInput<T extends CascadeTask> = {
  objectives: readonly ObjectiveInput[]
  workLines: readonly WorkLineInput[]
  tasks: readonly T[]
  /** Localized synthetic group copy; English defaults when the caller has no `t()`. */
  labels?: CascadeGroupLabels
  /** When supplied, retain only tasks owned by this person (responsible or accountable). */
  minePersonId?: string
  /**
   * Keep real Project/Process groups that carry no task. A catalog row wants them (its children
   * exist whether or not anyone has filed work under them yet); a Tasks list does not (an empty
   * group is noise in a list of tasks).
   */
  includeEmptyWorkLines?: boolean
}

/** Keep a stored parent link separate from an Objective reached through a Task. */
export function buildCatalogRelationProjection<T extends CascadeTask>(input: {
  objectives: readonly ObjectiveInput[]
  workLines: readonly WorkLineInput[]
  tasks: readonly T[]
  labels?: CascadeGroupLabels
}): CatalogRelationProjection<T> {
  const labels = input.labels ?? DEFAULT_CASCADE_GROUP_LABELS
  const objectives = new Map(input.objectives.map((objective) => [objective.id, objective]))
  const tasks = visibleTasks({ tasks: input.tasks })
  const tasksByWorkLine = new Map<string, T[]>()
  for (const task of tasks) {
    if (!task.work_line_id) continue
    tasksByWorkLine.set(task.work_line_id, [...(tasksByWorkLine.get(task.work_line_id) ?? []), task])
  }

  const byObjectiveId = new Map<string, CatalogRelationGroup<T>[]>(input.objectives.map(({ id }) => [id, []]))
  const byWorkLineId = new Map<string, CatalogRelationGroup<T>[]>(input.workLines.map(({ id }) => [id, []]))
  const group = (
    fields: Omit<CatalogRelationGroup<T>, 'done' | 'total'>,
  ): CatalogRelationGroup<T> => ({
    ...fields,
    total: fields.tasks.length,
    done: fields.tasks.filter(isDone).length,
  })
  const append = (map: Map<string, CatalogRelationGroup<T>[]>, id: string, value: CatalogRelationGroup<T>) => {
    map.set(id, [...(map.get(id) ?? []), value])
  }

  for (const workLine of input.workLines) {
    const lineTasks = tasksByWorkLine.get(workLine.id) ?? []
    const parentId = workLine.objective_id ?? null
    if (parentId) {
      const parent = objectives.get(parentId)
      const direct = group({
        id: workLine.id, name: workLine.name, objectiveId: parentId, workLineId: workLine.id,
        workLineType: workLine.type, entity: 'work-line', relationship: 'direct', tasks: lineTasks,
      })
      append(byWorkLineId, workLine.id, { ...direct, id: parentId, name: parent?.name ?? labels.unlinked, entity: 'objective' })
      append(byObjectiveId, parentId, direct)
    }

    const contributionTasks = new Map<string, T[]>()
    const unlinkedTasks: T[] = []
    for (const task of lineTasks) {
      const objectiveId = task.objective_id
      if (objectiveId && objectiveId !== parentId && objectives.has(objectiveId)) {
        contributionTasks.set(objectiveId, [...(contributionTasks.get(objectiveId) ?? []), task])
      } else if (!parentId && (!objectiveId || !objectives.has(objectiveId))) {
        unlinkedTasks.push(task)
      }
    }
    for (const [objectiveId, contributedTasks] of contributionTasks) {
      const contribution = group({
        id: workLine.id, name: workLine.name, objectiveId, workLineId: workLine.id,
        workLineType: workLine.type, entity: 'work-line', relationship: 'contribution', tasks: contributedTasks,
      })
      append(byWorkLineId, workLine.id, {
        ...contribution, id: objectiveId, name: objectives.get(objectiveId)!.name, entity: 'objective',
      })
      append(byObjectiveId, objectiveId, contribution)
    }
    if (unlinkedTasks.length > 0) {
      append(byWorkLineId, workLine.id, group({
        id: UNLINKED_OBJECTIVE_KEY, name: labels.unlinked, objectiveId: null, workLineId: workLine.id,
        workLineType: workLine.type, entity: 'objective', relationship: 'unlinked', synthetic: 'unlinked', tasks: unlinkedTasks,
      }))
    }
  }

  for (const objective of input.objectives) {
    const directTasks = tasks.filter((task) => task.objective_id === objective.id && task.work_line_id === null)
    if (directTasks.length > 0) {
      append(byObjectiveId, objective.id, group({
        id: NO_WORK_LINE_KEY, name: labels.noWorkLine, objectiveId: objective.id, workLineId: null,
        workLineType: null, entity: 'task', relationship: 'direct', synthetic: 'no-work-line', tasks: directTasks,
      }))
    }
  }

  const order = (items: CatalogRelationGroup<T>[]) => items.sort((a, b) =>
    Number(a.relationship !== 'direct') - Number(b.relationship !== 'direct')
    || Number(a.relationship === 'unlinked') - Number(b.relationship === 'unlinked')
    || a.name.localeCompare(b.name))
  for (const items of byObjectiveId.values()) order(items)
  for (const items of byWorkLineId.values()) order(items)
  return { byObjectiveId, byWorkLineId }
}

const empty = (): CountRollup => ({ done: 0, total: 0 })

/** Resolve the Objective through the direct work-line edge before the legacy Task field. */
export function resolveTaskObjectiveId(
  task: Pick<CascadeTask, 'objective_id' | 'work_line_id'>,
  workLines: ReadonlyMap<string, { objective_id?: string | null }>,
): string | null {
  return (task.work_line_id ? workLines.get(task.work_line_id)?.objective_id : null) ?? task.objective_id ?? null
}

const isDone = (task: CascadeTask) => task.status === 'Done'
const add = (rollup: CountRollup, task: CascadeTask) => {
  rollup.total += 1
  if (isDone(task)) rollup.done += 1
}

/** Drop archived tasks, and everything the Mine filter excludes. */
function visibleTasks<T extends CascadeTask>(
  input: Pick<CascadeGroupInput<T>, 'tasks' | 'minePersonId'>,
): T[] {
  return input.tasks.filter((task) => {
    if (task.archived_at) return false
    if (!input.minePersonId) return true
    return task.responsible_person_id === input.minePersonId || task.accountable_person_id === input.minePersonId
  })
}

export function cascadeGroupKey(objectiveId: string | null, workLineId: string | null): string {
  return `${objectiveId ?? UNLINKED_OBJECTIVE_KEY}:${workLineId ?? NO_WORK_LINE_KEY}`
}

/**
 * Task-collection grouping. Returns every (Objective, Project/Process) group, real and synthetic,
 * each with its tasks and its count roll-up, in a stable order: real Objectives by name first
 * (their real Project/Process groups by name, then their `No Project/Process` bucket), and the
 * `(Unlinked)` Objective bucket last.
 */
export function buildCascadeGroups<T extends CascadeTask>(input: CascadeGroupInput<T>): CascadeGroup<T>[] {
  const labels = input.labels ?? DEFAULT_CASCADE_GROUP_LABELS
  const objectiveById = new Map(input.objectives.map((row) => [row.id, row]))
  const workLineById = new Map(input.workLines.map((row) => [row.id, row]))

  const groups = new Map<string, CascadeGroup<T>>()
  const groupFor = (objectiveId: string | null, workLineId: string | null): CascadeGroup<T> => {
    const key = cascadeGroupKey(objectiveId, workLineId)
    const existing = groups.get(key)
    if (existing) return existing
    const workLine = workLineId ? workLineById.get(workLineId) : undefined
    const created: CascadeGroup<T> = {
      key,
      objectiveId,
      objectiveName: (objectiveId ? objectiveById.get(objectiveId)?.name : undefined) ?? labels.unlinked,
      workLineId,
      workLineName: workLineId ? workLine?.name ?? labels.unlinked : labels.noWorkLine,
      workLineType: workLine?.type ?? null,
      syntheticObjective: objectiveId === null,
      syntheticWorkLine: workLineId === null,
      tasks: [],
      ...empty(),
    }
    groups.set(key, created)
    return created
  }

  if (input.includeEmptyWorkLines) {
    for (const workLine of input.workLines) groupFor(workLine.objective_id ?? null, workLine.id)
  }

  for (const task of visibleTasks(input)) {
    const group = groupFor(resolveTaskObjectiveId(task, workLineById), task.work_line_id ?? null)
    ;(group.tasks as T[]).push(task)
    add(group, task)
  }

  // Deterministic order, and the reason it is spelled out: a synthetic group that sorted into the
  // middle of the real ones would read as a record that does not exist. Synthetics go last, at
  // both levels, so the drill reads real-work-first and the leftovers are visibly leftovers.
  return [...groups.values()].sort((a, b) =>
    Number(a.syntheticObjective) - Number(b.syntheticObjective)
    || a.objectiveName.localeCompare(b.objectiveName)
    || Number(a.syntheticWorkLine) - Number(b.syntheticWorkLine)
    || a.workLineName.localeCompare(b.workLineName))
}

/**
 * Per-record counts follow the same relationship rules as the linked-work panels. A task may
 * contribute to its Objective while remaining on a Project/Process with a different direct parent.
 * The direct work-line count remains tied to the stored parent, and each task is counted once per
 * Objective even when multiple linked-work groups point to it.
 */
export function rollUpCounts<T extends CascadeTask>(
  groups: readonly CascadeGroup<T>[],
  input: {
    objectives: readonly ObjectiveInput[]
    workLines: readonly WorkLineInput[]
    labels?: CascadeGroupLabels
  },
): { objectives: ObjectiveRollup[]; workLines: WorkLineRollup[] } {
  const labels = input.labels ?? DEFAULT_CASCADE_GROUP_LABELS
  const tasksById = new Map<string, T>()
  for (const group of groups) for (const task of group.tasks) tasksById.set(task.id, task)
  const relations = buildCatalogRelationProjection({
    ...input, tasks: [...tasksById.values()], labels,
  })
  const countGroups = (related: readonly CatalogRelationGroup<T>[]): CountRollup => {
    const uniqueTasks = new Map<string, T>()
    for (const group of related) for (const task of group.tasks) uniqueTasks.set(task.id, task)
    const values = [...uniqueTasks.values()]
    return { total: values.length, done: values.filter(isDone).length }
  }

  return {
    objectives: input.objectives.map((row) => ({
      ...row, ...countGroups(relations.byObjectiveId.get(row.id) ?? []),
    })),
    workLines: input.workLines.map((row) => {
      return {
        ...row, objective_id: row.objective_id ?? null,
        ...countGroups(relations.byWorkLineId.get(row.id) ?? []),
      }
    }),
  }
}

export function formatCountRollup(count: CountRollup): string {
  return `${count.done} / ${count.total} done`
}

export const countRollupLabel = formatCountRollup
