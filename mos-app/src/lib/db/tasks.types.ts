// Minimal hand-written types for the mos.* rows this app reads/writes (P2-1).
// Source of truth: supabase/migrations/20260611000007..9. Keep in sync by hand
// (kept separate from the shared database.types.ts, which is "shared schema only").
export type TaskStatus = 'Open' | 'In Progress' | 'Blocked' | 'Done'
export type TaskEventType =
  | 'created' | 'status_changed' | 'field_edited' | 'raci_edited' | 'archived' | 'unarchived'

export interface TaskRow {
  id: string
  org_id: string
  title: string
  business_unit_id: string
  status: TaskStatus
  responsible_person_id: string
  accountable_person_id: string
  consulted_person_ids: string[]
  informed_person_ids: string[]
  description: string | null
  due_date: string | null
  objective_id: string | null
  work_line_id: string | null
  last_activity_at: string
  archived_at: string | null
  // #752 (OD-WAY-94 r6): completion clock, guard-stamped by mos._guard_tasks on the transition
  // into 'Done' and cleared on the transition out. Nullable — an Open/In Progress/Blocked task
  // carries no completion moment. Client filters age Done rows out of My work / Team work seven
  // days after this stamp; All shows every non-archived row and ignores it. Kept OPTIONAL (not
  // just nullable) to match the process_run_id pattern above: every pre-#752 TaskListRow literal
  // stays structurally satisfiable without a cast, and PostgREST returns the field on every read.
  completed_at?: string | null
  created_by: string
  created_at: string
  updated_at: string
  // Step 6 (ADR-0051 D10, occurrence-as-tasks): occurrence provenance. Optional/nullable —
  // ALL pre-Step-6 tasks and every hand-created task carry neither column (ad-hoc Tasks stay
  // ad-hoc, FR-611). Populated only on a Task materialized by mos.spawn_process_run /
  // mos.resolve_pending_task. Kept optional (not just nullable) so this row shape stays
  // structurally satisfiable by any pre-existing TaskListRow literal without a cast.
  process_run_id?: string | null
  generated_from_task_def_id?: string | null
}
export interface ChecklistItemRow {
  id: string
  org_id: string
  task_id: string
  label: string
  is_done: boolean
  position: number
  created_at: string
  updated_at: string
}
export interface TaskEventRow {
  id: string
  org_id: string
  task_id: string
  actor_person_id: string
  event_type: TaskEventType
  from_value: string | null
  to_value: string | null
  created_at: string
}
// Raw mos.tasks row — no cross-schema embeds (PostgREST PGRST200 across schema boundary).
// R/A/BU display names are resolved client-side from the shared directory (directory.ts).
// Fix C1: dropped business_unit / responsible / accountable embedded objects.
export type TaskListRow = TaskRow
