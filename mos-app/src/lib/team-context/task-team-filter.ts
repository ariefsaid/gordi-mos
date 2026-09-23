// Team-keyed Task filter/grouping projections (V3 Issue 8, AC-813 slice). These are the pure
// building blocks Issue 6's RecordCollection Task adapter consumes once mos.tasks.team_id lands:
// the collection descriptor gains a `team` filter key and a Team grouping, both keyed by canonical
// mos.tasks.id. Issue 6's plan (§8) explicitly leaves the Team filter/grouping to Issue 8, so these
// live here and will be wired into the descriptor at integration time — NOT a second collection
// engine.
//
// INTEGRATION POINT (Issue 6): pass filterTasksByTeam / groupTaskIdsByTeam into the Tasks
// CollectionAdapter.project as the Team query key + Team group projection. Do not reimplement
// search/sort/saved-view here.

/** The minimal Task projection these helpers need: a canonical id and its executing Team (null while
 *  the row is a transitional/unresolved re-home repair case). */
export interface TeamScopedTask {
  id: string
  teamId: string | null
}

/** Narrow a Task list to a selected executing Team by canonical identity. `undefined` means "no
 *  Team filter" (return all). A selected Team excludes unresolved (null-Team) rows — they belong in
 *  the honest "Team required" repair bucket, not in a Team's working set. */
export function filterTasksByTeam<T extends TeamScopedTask>(
  tasks: readonly T[],
  teamId: string | undefined,
): T[] {
  if (teamId === undefined) return [...tasks]
  return tasks.filter((task) => task.teamId === teamId)
}

/** Group canonical Task ids by executing Team, preserving input order within each group. Unresolved
 *  (null-Team) rows are bucketed under the `null` key as an explicit repair group, never dropped. */
export function groupTaskIdsByTeam(tasks: readonly TeamScopedTask[]): Map<string | null, string[]> {
  const groups = new Map<string | null, string[]>()
  for (const task of tasks) {
    const bucket = groups.get(task.teamId)
    if (bucket) bucket.push(task.id)
    else groups.set(task.teamId, [task.id])
  }
  return groups
}
