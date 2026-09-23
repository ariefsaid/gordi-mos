// Shared grouping types for the tasks workspace. A RenderGroup is a group ready
// to render: its display label, persistence key, leaf rows (filtered + due-sorted),
// overdue subtotal, and the "+ Add task" pre-fill query param. Kept here so the
// orchestrator (TasksWorkspace) and the body (TasksTableBody) agree on the shape.
import type { TaskListRow } from '@/lib/db/tasks.types'

export type RenderGroup = {
  key: string        // persistence/identity key (status name, person id, bu id, or work-line id)
  label: string      // display label
  rows: TaskListRow[]
  overdue: number
  prefillParam: string // e.g. "status=Blocked", "r=<personId>", "bu=<buId>"
  /**
   * Only present when groupBy === 'workline'. The work-line type for the type label.
   * null = the "No work-line" trailing group (no type tag rendered).
   */
  workLineType?: 'project' | 'process' | null
  objectiveHint?: { id: string | null; name: string }
  /**
   * Step 6 (ADR-0051, C1): only present when groupBy === 'occurrence' AND this group is a spawned
   * occurrence (not the ad-hoc-tasks catch-all group) — its derived mos.process_run_rollup counts,
   * passed straight through to GroupHeaderRow's occurrenceRollup prop (OD-P3-6).
   */
  occurrenceRollup?: { total: number; done: number; overdue: number; pendingUnresolved: number }
}
