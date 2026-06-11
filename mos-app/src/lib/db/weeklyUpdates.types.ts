// Minimal hand-written types for the mos.weekly_updates rows this app reads/writes (P2-2).
// Source of truth: supabase/migrations/20260612000001..2. Kept separate from the shared
// database.types.ts (shared-schema only), mirroring tasks.types.ts.
export type WeeklyUpdateStatus = 'draft' | 'submitted'
export type ProgressMarker = 'done' | 'in_progress' | 'blocked'

export interface WeeklyUpdateRow {
  id: string
  org_id: string
  person_id: string
  week_start: string
  summary: string
  status: WeeklyUpdateStatus
  submitted_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface WeeklyUpdateItemRow {
  id: string
  org_id: string
  weekly_update_id: string
  label: string
  progress: ProgressMarker
  position: number
  created_at: string
  updated_at: string
}

// The author's update for a week: the parent row + its ordered lines.
export interface MyUpdate {
  update: WeeklyUpdateRow
  items: WeeklyUpdateItemRow[]
}

// A manager-review roster row: a team person + their update state for the selected week.
// Names/roles are resolved CLIENT-SIDE from the passed team roster (NOT a cross-schema embed).
export type TeamUpdateState = 'filed' | 'draft' | 'not_started'
export interface TeamUpdateRow {
  person_id: string
  full_name: string
  role_label: string | null
  state: TeamUpdateState
  summary_excerpt: string | null
  submitted_at: string | null
}
