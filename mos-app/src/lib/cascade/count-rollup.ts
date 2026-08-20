// The ONE construction of the Objective → Project/Process → Task drill (#204).
//
// Every surface that shows the three-level roll-up reads it from here: the Objectives catalog
// row, the Projects & Processes catalog row, and the Tasks "Group by Objective" view. A second
// construction of the same branches would drift from this one silently — the counts on a catalog
// row and the groups on the Tasks list would disagree and nothing would fail — so there is one
// projection and three consumers, never three projections.
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

/** Both synthetic branch names. Callers with a `t()` in hand pass translated copy instead. */
export const DEFAULT_BRANCH_LABELS = {
  unlinked: '(Unlinked)',
  noWorkLine: 'No Project/Process',
} as const

export type BranchLabels = { unlinked: string; noWorkLine: string }

/** The minimum a task must carry to be placed in the drill. */
export type BranchTask = {
  id: string
  status: TaskStatus | string
  objective_id: string | null
  work_line_id: string | null
  archived_at?: string | null
  responsible_person_id?: string | null
  accountable_person_id?: string | null
}

export type RollupTask = BranchTask & { title?: string }

/**
 * One Objective → Project/Process branch, carrying its own tasks and its count roll-up.
 *
 * EITHER half can be synthesised, and a branch can be both at once (a task with no Objective and
 * no Project/Process). The synthetic branches are the ones most likely to hold work nobody is
 * tracking, so they are first-class here — never dropped, never merged into a real branch.
 */
export type ObjectiveBranch<T extends BranchTask = RollupTask> = CountRollup & {
  /** `<objectiveId | __unlinked__>:<workLineId | __no_work_line__>` — stable across renders. */
  key: string
  objectiveId: string | null
  objectiveName: string
  workLineId: string | null
  workLineName: string
  workLineType: 'project' | 'process' | null
  /** True when this branch's Objective is the synthesised `(Unlinked)` bucket. */
  syntheticObjective: boolean
  /** True when this branch's Project/Process is the synthesised `No Project/Process` bucket. */
  syntheticWorkLine: boolean
  tasks: readonly T[]
}

export type ObjectiveInput = { id: string; name: string }
export type WorkLineInput = { id: string; name: string; type: 'project' | 'process'; objective_id?: string | null }

export type BranchInput<T extends BranchTask> = {
  objectives: readonly ObjectiveInput[]
  workLines: readonly WorkLineInput[]
  tasks: readonly T[]
  /** Localized synthetic branch copy; English defaults when the caller has no `t()`. */
  labels?: BranchLabels
  /** When supplied, retain only tasks owned by this person (responsible or accountable). */
  minePersonId?: string
  /**
   * Keep real Project/Process branches that carry no task. A catalog row wants them (its children
   * exist whether or not anyone has filed work under them yet); a Tasks list does not (an empty
   * group is noise in a list of tasks).
   */
  includeEmptyWorkLines?: boolean
}

export type CountRollupInput = Omit<BranchInput<RollupTask>, 'includeEmptyWorkLines'>

const empty = (): CountRollup => ({ done: 0, total: 0 })

/** Resolve the Objective through the direct work-line edge before the legacy Task field. */
export function resolveTaskObjectiveId(
  task: Pick<BranchTask, 'objective_id' | 'work_line_id'>,
  workLines: ReadonlyMap<string, { objective_id?: string | null }>,
): string | null {
  return (task.work_line_id ? workLines.get(task.work_line_id)?.objective_id : null) ?? task.objective_id ?? null
}

const isDone = (task: BranchTask) => task.status === 'Done'
const add = (rollup: CountRollup, task: BranchTask) => {
  rollup.total += 1
  if (isDone(task)) rollup.done += 1
}

/** Drop archived tasks, and everything the Mine filter excludes. */
function visibleTasks<T extends BranchTask>(input: Pick<BranchInput<T>, 'tasks' | 'minePersonId'>): T[] {
  return input.tasks.filter((task) => {
    if (task.archived_at) return false
    if (!input.minePersonId) return true
    return task.responsible_person_id === input.minePersonId || task.accountable_person_id === input.minePersonId
  })
}

export function branchKey(objectiveId: string | null, workLineId: string | null): string {
  return `${objectiveId ?? UNLINKED_OBJECTIVE_KEY}:${workLineId ?? NO_WORK_LINE_KEY}`
}

/**
 * THE shared projection. Returns every Objective → Project/Process branch, real and synthetic,
 * each with its tasks and its count roll-up, in a stable order: real Objectives by name first
 * (their real Project/Process branches by name, then their `No Project/Process` bucket), and the
 * `(Unlinked)` Objective bucket last.
 */
export function buildObjectiveBranches<T extends BranchTask>(input: BranchInput<T>): ObjectiveBranch<T>[] {
  const labels = input.labels ?? DEFAULT_BRANCH_LABELS
  const objectiveById = new Map(input.objectives.map((row) => [row.id, row]))
  const workLineById = new Map(input.workLines.map((row) => [row.id, row]))

  const branches = new Map<string, ObjectiveBranch<T>>()
  const branchFor = (objectiveId: string | null, workLineId: string | null): ObjectiveBranch<T> => {
    const key = branchKey(objectiveId, workLineId)
    const existing = branches.get(key)
    if (existing) return existing
    const workLine = workLineId ? workLineById.get(workLineId) : undefined
    const created: ObjectiveBranch<T> = {
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
    branches.set(key, created)
    return created
  }

  if (input.includeEmptyWorkLines) {
    for (const workLine of input.workLines) branchFor(workLine.objective_id ?? null, workLine.id)
  }

  for (const task of visibleTasks(input)) {
    const branch = branchFor(resolveTaskObjectiveId(task, workLineById), task.work_line_id ?? null)
    ;(branch.tasks as T[]).push(task)
    add(branch, task)
  }

  // Deterministic order, and the reason it is spelled out: a synthetic branch that sorted into the
  // middle of the real ones would read as a record that does not exist. Synthetics go last, at
  // both levels, so the drill reads real-work-first and the leftovers are visibly leftovers.
  return [...branches.values()].sort((a, b) =>
    Number(a.syntheticObjective) - Number(b.syntheticObjective)
    || a.objectiveName.localeCompare(b.objectiveName)
    || Number(a.syntheticWorkLine) - Number(b.syntheticWorkLine)
    || a.workLineName.localeCompare(b.workLineName))
}

/** Count-only projection for the three-level Objective → Work line → Task drill. */
export function buildCountRollup(input: CountRollupInput) {
  const tasks = visibleTasks(input)
  const objectiveById = new Map(input.objectives.map((row) => [row.id, row]))
  const workLineById = new Map(input.workLines.map((row) => [row.id, row]))
  const objectiveCounts = new Map<string, CountRollup>()
  const workLineCounts = new Map<string, CountRollup>()
  for (const objective of input.objectives) objectiveCounts.set(objective.id, empty())
  for (const workLine of input.workLines) workLineCounts.set(workLine.id, empty())
  for (const task of tasks) {
    const objectiveId = resolveTaskObjectiveId(task, workLineById)
    if (objectiveId && !objectiveCounts.has(objectiveId)) objectiveCounts.set(objectiveId, empty())
    if (task.work_line_id && !workLineCounts.has(task.work_line_id)) workLineCounts.set(task.work_line_id, empty())
    if (objectiveId) add(objectiveCounts.get(objectiveId)!, task)
    if (task.work_line_id) add(workLineCounts.get(task.work_line_id)!, task)
  }
  const labels = input.labels ?? DEFAULT_BRANCH_LABELS
  const objectives: ObjectiveRollup[] = [...objectiveCounts].map(([id, counts]) => ({
    ...(objectiveById.get(id) ?? { id, name: labels.unlinked }), ...counts,
  }))
  const workLines: WorkLineRollup[] = [...workLineCounts].map(([id, counts]) => {
    const row = workLineById.get(id)
    return {
      id, name: row?.name ?? labels.unlinked, type: row?.type ?? 'project',
      objective_id: row?.objective_id ?? null, ...counts,
    }
  })
  // The branches come from the ONE projection — the catalog rows and the Tasks groups read the
  // same construction, so a drift between them is not expressible.
  const branches = buildObjectiveBranches({ ...input, includeEmptyWorkLines: true })
  const groupsByObjective = new Map<string, ObjectiveBranch<RollupTask>[]>()
  for (const branch of branches) {
    const key = branch.objectiveId ?? UNLINKED_OBJECTIVE_KEY
    const list = groupsByObjective.get(key) ?? []
    list.push(branch)
    groupsByObjective.set(key, list)
  }
  return { objectives, workLines, branches, groupsByObjective, tasks }
}

export function formatCountRollup(count: CountRollup): string {
  return `${count.done} / ${count.total} done`
}

export const countRollupLabel = formatCountRollup
