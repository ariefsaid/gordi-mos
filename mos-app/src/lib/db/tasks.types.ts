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
  created_by: string
  created_at: string
  updated_at: string
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
