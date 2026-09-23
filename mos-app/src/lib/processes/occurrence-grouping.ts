// Occurrence grouping (Step 6 / ADR-0051, B5, AC-622/FR-611). A "Process Run" is an internal
// occurrence record and NEVER UI vocabulary (spec §5) — occurrences surface only as a grouping
// caption over their generated Tasks. This is a pure partition, decoupled from the Task row shape
// so it stays independently unit-testable (the DAL supplies real Tasks; the UI supplies the
// caption lookup built from ProcessRunRow.caption / ProcessRunRollup).

/** The minimal shape this grouping needs from a Task row — decoupled from TaskListRow so the
 * function stays a pure, standalone unit (any Task carrying a nullable `process_run_id` works). */
export interface OccurrenceGroupableTask {
  id: string
  process_run_id: string | null
}

export interface OccurrenceGroup<T extends OccurrenceGroupableTask> {
  runId: string
  /** The run's caption (never the string "Process Run" — FR-611). */
  caption: string
  tasks: T[]
}

export interface OccurrenceGrouping<T extends OccurrenceGroupableTask> {
  groups: OccurrenceGroup<T>[]
  /** Ad-hoc Tasks (no `process_run_id`) — never forced into a group. */
  ungrouped: T[]
}

/** Partition `tasks` into occurrence-caption-labelled groups (AC-622). A Task with a
 * `process_run_id` not present in `captionByRunId` falls back to the raw run id as its label —
 * never the internal-only string "Process Run" (FR-611). */
export function groupTasksByOccurrence<T extends OccurrenceGroupableTask>(
  tasks: T[],
  captionByRunId: Record<string, string>,
): OccurrenceGrouping<T> {
  const tasksByRunId = new Map<string, T[]>()
  const ungrouped: T[] = []

  for (const task of tasks) {
    if (!task.process_run_id) {
      ungrouped.push(task)
      continue
    }
    const list = tasksByRunId.get(task.process_run_id) ?? []
    list.push(task)
    tasksByRunId.set(task.process_run_id, list)
  }

  const groups = Array.from(tasksByRunId.entries()).map(([runId, groupTasks]) => ({
    runId,
    caption: captionByRunId[runId] ?? runId,
    tasks: groupTasks,
  }))

  return { groups, ungrouped }
}
