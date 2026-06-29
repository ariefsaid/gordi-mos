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
}
