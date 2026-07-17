import { supabase } from '@/lib/supabase'
import type { DueProcessRun, SpawnResult } from './processes.types'

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
