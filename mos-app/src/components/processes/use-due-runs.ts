// useDueRuns (Step-6 design fix wave, item 1). Owns the due-occurrence surface's data + collapse
// state so the compact trigger (rendered near the toolbar) and the expandable row list (rendered
// AFTER the Tasks table, never flooding it — design-review step-6 CRITICAL) share ONE
// fetch/scope/expand state instead of two divergent copies.
//
import type { DueProcessRun,  } from '@/lib/db/processes.types'

export function dueKey(row: DueProcessRun): string {
  return `${row.work_line_id}:${row.owning_team_id}:${row.period_key}`
}

/** A Process has no Team of its own; a run's owning Team is chosen at start. Narrow the offered
 * Teams to the viewer's own when they hold any of them, otherwise keep the server-filtered list. */
export function narrowToViewerTeams(rows: DueProcessRun[], viewerTeamIds: readonly string[]): DueProcessRun[] {
  const own = rows.filter((row) => viewerTeamIds.includes(row.owning_team_id))
  return own.length > 0 ? own : rows
}
