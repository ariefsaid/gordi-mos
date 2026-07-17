import { supabase } from '@/lib/supabase'
import type { DueProcessRun, PendingTaskRow, ProcessRunRollup, ProcessRunRow, SpawnResult } from './processes.types'
import type { TaskListRow } from './tasks.types'

// Data layer for mos.process_runs + friends (Step 6 / ADR-0051). Reads/writes mos via
// supabase.schema('mos') on the existing client — same client, RLS is the authority (mirrors
// tasks.ts/signals.ts §8): this layer NEVER sends org_id (the DB default stamps it) and throws on
// any non-null PostgREST/RPC error so the UI can surface failures. Run/pending writes are
// RPC-only (no direct insert/update policy — ADR-0051 §3), so every write here is a `.rpc(...)`.

const mos = () => supabase.schema('mos')

// ── startRun / listDueRuns (B2, AC-620 backing) ──────────────────────────────

/** Start (or idempotently re-return) a process occurrence via `mos.spawn_process_run`
 * (FR-602/AC-620). `date` is the WIB target date (`YYYY-MM-DD`). */
export async function startRun(workLineId: string, teamId: string, date: string): Promise<SpawnResult> {
  const { data, error } = await mos().rpc('spawn_process_run', {
    p_work_line_id: workLineId,
    p_owning_team_id: teamId,
    p_target_date: date,
  })
  if (error) throw new Error(`startRun failed — ${error.message}`)
  return data as SpawnResult
}

/** List due (not-yet-spawned) occurrences for the viewer's authorized Teams via
 * `mos.due_process_runs()` — the scheduler-free Start surface (FR-612). */
export async function listDueRuns(): Promise<DueProcessRun[]> {
  const { data, error } = await mos().rpc('due_process_runs')
  if (error) throw new Error(`listDueRuns failed — ${error.message}`)
  return (data ?? []) as DueProcessRun[]
}

// ── listPendingTasks / resolvePendingTask (B3, AC-621 backing) ──────────────

/** List a run's unresolved ambiguity human-choice rows (OD-41, FR-605). */
export async function listPendingTasks(runId: string): Promise<PendingTaskRow[]> {
  const { data, error } = await mos()
    .from('process_run_pending_tasks')
    .select('*')
    .eq('process_run_id', runId)
    .is('resolved_at', null)
  if (error) throw new Error(`listPendingTasks failed — ${error.message}`)
  return (data ?? []) as unknown as PendingTaskRow[]
}

/** Resolve a pending item to a chosen PIC via `mos.resolve_pending_task`, which materializes
 * the Task and marks the item resolved (FR-606/AC-621). Returns the new Task id. */
export async function resolvePendingTask(pendingId: string, picPersonId: string): Promise<string> {
  const { data, error } = await mos().rpc('resolve_pending_task', {
    p_pending_id: pendingId,
    p_pic_person_id: picPersonId,
  })
  if (error) throw new Error(`resolvePendingTask failed — ${error.message}`)
  return data as string
}

// ── getRunRollup / listRunTasks / completeRun (B4) ───────────────────────────

/** Read a run's derived progress roll-up (no stored counts — ADR D9). */
export async function getRunRollup(runId: string): Promise<ProcessRunRollup> {
  const { data, error } = await mos()
    .from('process_run_rollup')
    .select('*')
    .eq('process_run_id', runId)
    .single()
  if (error) throw new Error(`getRunRollup failed — ${error.message}`)
  return data as unknown as ProcessRunRollup
}

/** List a run's generated Tasks. Reuses the canonical task shape (TaskListRow, Rule 11 — never
 * re-implement task fetching); the DB stamps `process_run_id` on spawn/resolve (ADR D10). */
export async function listRunTasks(runId: string): Promise<TaskListRow[]> {
  const { data, error } = await mos()
    .from('tasks')
    .select('*')
    .eq('process_run_id', runId)
  if (error) throw new Error(`listRunTasks failed — ${error.message}`)
  return (data ?? []) as unknown as TaskListRow[]
}

/** Mark a run complete via `mos.complete_process_run` — a deliberate human act; the run's Tasks
 * persist unchanged (FR-610). Returns the updated run row. */
export async function completeRun(runId: string): Promise<ProcessRunRow> {
  const { data, error } = await mos().rpc('complete_process_run', { p_run_id: runId })
  if (error) throw new Error(`completeRun failed — ${error.message}`)
  return data as unknown as ProcessRunRow
}
