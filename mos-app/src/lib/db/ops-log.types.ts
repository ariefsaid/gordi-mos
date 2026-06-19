// Hand-written types for ops.log_entries (P2-3). Source of truth:
// supabase/migrations/20260612000004..5. Kept in sync by hand (mirrors tasks.types.ts).
export type LogOrigin = 'manual' | 'kitchen_app' | 'roastery_app'
export type LogEventType = 'production' | 'receiving' | 'qc' | 'follow_up' | 'other'

export interface LogEntryRow {
  id: string
  org_id: string
  business_unit_id: string
  origin: LogOrigin
  event_type: LogEventType
  title: string
  detail: string | null
  occurred_at: string
  needs_attention: boolean
  linked_task_id: string | null
  archived_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}
