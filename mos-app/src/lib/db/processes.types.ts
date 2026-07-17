// Type contract for Step 6 "Occurrence-as-Tasks" (ADR-0051; docs/specs/occurrence-as-tasks.spec.md
// §2). Frozen first (Track B task B1) so the DAL + UI slices can build in parallel without waiting
// on the live schema — Track A's migrations are the source of truth this mirrors by hand (same
// convention as tasks.types.ts: kept in sync manually, no live-DB introspection).

export type CadenceKind = 'manual' | 'daily' | 'weekly' | 'monthly'
export type ProcessRunStatus = 'open' | 'completed' | 'cancelled'
export type PendingReason = 'none' | 'multiple'

/** A row from `mos.due_process_runs()` — the scheduler-free Start surface (FR-612). */
export interface DueProcessRun {
  work_line_id: string
  process_name: string
  owning_team_id: string
  team_name: string
  period_key: string
  scheduled_date: string
}

/** The `mos.spawn_process_run` RPC's return shape (jsonb). */
export interface SpawnResult {
  run_id: string
  created: number
  pending: number
  idempotent: boolean
}

/** A row from `mos.process_runs` (the thin occurrence record, ADR D4). */
export interface ProcessRunRow {
  id: string
  work_line_id: string
  owning_team_id: string
  period_key: string
  caption: string
  scheduled_date: string
  status: ProcessRunStatus
  definition_version: number
}

/** A row from `mos.process_run_rollup` (derived, no stored counts — ADR D9). */
export interface ProcessRunRollup {
  process_run_id: string
  caption: string
  scheduled_date: string
  status: ProcessRunStatus
  total: number
  open: number
  in_progress: number
  blocked: number
  done: number
  overdue: number
  pending_unresolved: number
  completion_pct: number
}

/** A row from `mos.process_run_pending_tasks` — the ambiguity human-choice queue (OD-41). */
export interface PendingTaskRow {
  id: string
  process_run_id: string
  task_def_id: string
  candidate_person_ids: string[]
  reason: PendingReason
  resolved_at: string | null
  /** Design fix wave item 2 — the pending step's task-def TITLE (mos.process_task_defs.title),
   * resolved via a second batched query in listPendingTasks (no schema change). The assign
   * surface must name the step, never just "two people could own this" with no subject. Empty
   * string if the def's title couldn't be resolved (defensive — never blocks resolution). */
  title: string
}
