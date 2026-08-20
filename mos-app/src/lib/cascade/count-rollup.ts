// The ONE construction of the Objective → Project/Process → Task drill (#204).
//
// Every surface that shows the three-level roll-up reads it from here: the Objectives catalog
// row, the Projects & Processes catalog row, and the Tasks "Group by Objective" view. A second
// construction of the same groups would drift from this one silently — the counts on a catalog
// row and the groups on the Tasks list would disagree and nothing would fail — so there is one
// projection and three consumers, never three projections. The per-record counts are DERIVED from
// that same projection (`rollUpCounts`) rather than re-walked, so the count on a catalog row and
// the count on a group inside that row's panel are arithmetic on one traversal, not two loops kept
// in step by hand.
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
 * THE shared projection. Returns every (Objective, Project/Process) group, real and synthetic,
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

/** The only shape `rollUpCounts` needs — any `CascadeGroup` satisfies it. */
type CountedGroup = CountRollup & { objectiveId: string | null; workLineId: string | null }

/**
 * Per-record counts, SUMMED from the groups the one projection already built (#204 finding 4).
 *
 * This deliberately does not touch the tasks. Walking them a second time is how the count on a
 * catalog row and the count on a group inside that row's panel became two loops that had to be
 * kept in step by hand — the same drift shape the shared projection removed one layer up.
 *
 * Pass the groups from `buildCascadeGroups({ ..., includeEmptyWorkLines: true })`: a record with no
 * work still gets a `0 / 0` entry, both from that flag and from the seed below, so an untouched
 * Objective reads as empty rather than as missing.
 */
export function rollUpCounts(
  groups: readonly CountedGroup[],
  input: {
    objectives: readonly ObjectiveInput[]
    workLines: readonly WorkLineInput[]
    labels?: CascadeGroupLabels
  },
): { objectives: ObjectiveRollup[]; workLines: WorkLineRollup[] } {
  const labels = input.labels ?? DEFAULT_CASCADE_GROUP_LABELS
  const objectiveById = new Map(input.objectives.map((row) => [row.id, row]))
  const workLineById = new Map(input.workLines.map((row) => [row.id, row]))
  const objectiveCounts = new Map<string, CountRollup>(input.objectives.map((row) => [row.id, empty()]))
  const workLineCounts = new Map<string, CountRollup>(input.workLines.map((row) => [row.id, empty()]))

  const sumInto = (counts: Map<string, CountRollup>, id: string, group: CountRollup) => {
    const entry = counts.get(id) ?? empty()
    entry.done += group.done
    entry.total += group.total
    counts.set(id, entry)
  }
  for (const group of groups) {
    if (group.objectiveId) sumInto(objectiveCounts, group.objectiveId, group)
    if (group.workLineId) sumInto(workLineCounts, group.workLineId, group)
  }

  return {
    objectives: [...objectiveCounts].map(([id, counts]) => ({
      ...(objectiveById.get(id) ?? { id, name: labels.unlinked }), ...counts,
    })),
    workLines: [...workLineCounts].map(([id, counts]) => {
      const row = workLineById.get(id)
      return {
        id, name: row?.name ?? labels.unlinked, type: row?.type ?? 'project',
        objective_id: row?.objective_id ?? null, ...counts,
      }
    }),
  }
}

export function formatCountRollup(count: CountRollup): string {
  return `${count.done} / ${count.total} done`
}

export const countRollupLabel = formatCountRollup
