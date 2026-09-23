import { supabase } from '@/lib/supabase'
import type { DueProcessRun, PendingTaskRow, ProcessOccurrenceSummary, ProcessRunRollup, ProcessRunRow, SpawnResult, TaskDefLookup } from './processes.types'
import type { TaskListRow } from './tasks.types'

// Data layer for mos.process_runs + friends (Step 6 / ADR-0051). Reads/writes mos via
// supabase.schema('mos') on the existing client — same client, RLS is the authority (mirrors
// tasks.ts/signals.ts §8): this layer NEVER sends org_id (the DB default stamps it) and throws on
// any non-null PostgREST/RPC error so the UI can surface failures. Run/pending writes are
// RPC-only (no direct insert/update policy — ADR-0051 §3), so every write here is a `.rpc(...)`.

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')

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

/** Resolve effective start authority for one owning Team through mos runtime policy. */
export async function canStartProcessForTeam(teamId: string): Promise<boolean> {
  const { data, error } = await mos().rpc('can_start_process_for_team', { p_team_id: teamId })
  if (error) throw new Error(`canStartProcessForTeam failed — ${error.message}`)
  return data === true
}

/** Resolve effective close authority for one Process Run through mos runtime policy. */
export async function canCloseProcessRun(runId: string): Promise<boolean> {
  const { data, error } = await mos().rpc('can_close_process_run_id', { p_run_id: runId })
  if (error) throw new Error(`canCloseProcessRun failed — ${error.message}`)
  return data === true
}

/** List due (not-yet-spawned) occurrences for the viewer's authorized Teams via
 * `mos.due_process_runs()` — the scheduler-free Start surface (FR-612). */
export async function listDueRuns(): Promise<DueProcessRun[]> {
  const { data, error } = await mos().rpc('due_process_runs')
  if (error) throw new Error(`listDueRuns failed — ${error.message}`)
  return (data ?? []) as DueProcessRun[]
}

/** List due occurrences for one Process. Reuses the canonical due RPC so Start remains subject
 * to its existing process.start + owning-Team membership gate. */
export async function listStartableProcessRuns(workLineId: string): Promise<DueProcessRun[]> {
  const rows = await listDueRuns()
  return rows.filter((row) => row.work_line_id === workLineId)
}

// ── listTaskDefs (design fix wave items 2/4 — Rule 11 shared batching helper) ───────────────────

/** Batched lookup of `mos.process_task_defs` by id — title + pic_role_id. Shared by
 * listPendingTasks' title resolution (item 2) and the Occurrence group-by's "via <role name>"
 * generated-ownership provenance line (item 4, use-occurrence-groups.ts). Returns `[]` (no network
 * call) for an empty id list. */
export async function listTaskDefs(defIds: string[]): Promise<TaskDefLookup[]> {
  if (defIds.length === 0) return []
  const { data, error } = await mos()
    .from('process_task_defs')
    .select('id,title,pic_role_id')
    .in('id', defIds)
  if (error) throw new Error(`listTaskDefs failed — ${error.message}`)
  return (data ?? []) as unknown as TaskDefLookup[]
}

// ── listPendingTasks / resolvePendingTask (B3, AC-621 backing) ──────────────

/** List a run's unresolved ambiguity human-choice rows (OD-41, FR-605). Design fix wave item 2:
 * the assign surface must NAME the step (never a bare "two people could own this" with no
 * subject) — listTaskDefs resolves each row's task-def TITLE (no schema change). */
export async function listPendingTasks(runId: string): Promise<PendingTaskRow[]> {
  const { data, error } = await mos()
    .from('process_run_pending_tasks')
    .select('*')
    .eq('process_run_id', runId)
    .is('resolved_at', null)
  if (error) throw new Error(`listPendingTasks failed — ${error.message}`)
  const rows = (data ?? []) as unknown as Omit<PendingTaskRow, 'title'>[]
  if (rows.length === 0) return []

  const defIds = Array.from(new Set(rows.map((row) => row.task_def_id)))
  const defs = await listTaskDefs(defIds)
  const titleById = new Map(defs.map((def) => [def.id, def.title]))

  return rows.map((row) => ({ ...row, title: titleById.get(row.task_def_id) ?? '' }))
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

/** Batched roll-up read for the Occurrence group-by in `/work/tasks` (Track C wiring): one
 * `.in('process_run_id', runIds)` read instead of N `getRunRollup` calls per rendered occurrence
 * group. Returns `[]` (no network call) for an empty `runIds` list. */
export async function listRunRollups(runIds: string[]): Promise<ProcessRunRollup[]> {
  if (runIds.length === 0) return []
  const { data, error } = await mos()
    .from('process_run_rollup')
    .select('*')
    .in('process_run_id', runIds)
  if (error) throw new Error(`listRunRollups failed — ${error.message}`)
  return (data ?? []) as unknown as ProcessRunRollup[]
}

/** Load a Process record's existing occurrences with their authoritative derived counts and Team
 * names. This is a read-only composition seam for Work record documents; lifecycle writes remain
 * the existing RPCs below, and generated Tasks are never edited by this loader. */
export async function listProcessOccurrenceSummaries(workLineId: string): Promise<ProcessOccurrenceSummary[]> {
  const { data: runData, error: runError } = await mos()
    .from('process_runs')
    .select('id,work_line_id,owning_team_id,period_key,caption,scheduled_date,status,definition_version,started_by,completed_at,completed_by,cancelled_at,cancelled_by,cancel_reason')
    .eq('work_line_id', workLineId)
    .order('scheduled_date', { ascending: false })
  if (runError) throw new Error(`listProcessOccurrenceSummaries runs failed — ${runError.message}`)

  const runs = (runData ?? []) as ProcessRunRow[]
  if (runs.length === 0) return []

  const runIds = runs.map((run) => run.id)
  const teamIds = Array.from(new Set(runs.map((run) => run.owning_team_id)))
  const [{ data: rollupData, error: rollupError }, { data: teamData, error: teamError }] = await Promise.all([
    mos().from('process_run_rollup').select('*').in('process_run_id', runIds),
    shared().from('teams').select('id,name').in('id', teamIds),
  ])
  if (rollupError) throw new Error(`listProcessOccurrenceSummaries rollups failed — ${rollupError.message}`)
  if (teamError) throw new Error(`listProcessOccurrenceSummaries teams failed — ${teamError.message}`)

  const rollups = (rollupData ?? []) as ProcessRunRollup[]
  const rollupByRunId = new Map(rollups.map((rollup) => [rollup.process_run_id, rollup]))
  const teamNameById = new Map(
    ((teamData ?? []) as Array<{ id: string; name: string }>).map((team) => [team.id, team.name]),
  )

  return runs.map((run) => {
    const rollup = rollupByRunId.get(run.id)
    if (!rollup) throw new Error(`listProcessOccurrenceSummaries missing rollup for ${run.id}`)
    return {
      run,
      team_name: teamNameById.get(run.owning_team_id) ?? run.owning_team_id,
      rollup,
    }
  })
}

/** Mark a run complete via `mos.complete_process_run` — a deliberate human act; the run's Tasks
 * persist unchanged (FR-610). Returns the updated run row. */
export async function completeRun(runId: string): Promise<ProcessRunRow> {
  const { data, error } = await mos().rpc('complete_process_run', { p_run_id: runId })
  if (error) throw new Error(`completeRun failed — ${error.message}`)
  return data as unknown as ProcessRunRow
}

/** Cancel an open run via `mos.cancel_process_run`. Cancellation is auditable and does not
 * mutate the run's generated Tasks (FR-610/AC-012). */
export async function cancelRun(runId: string, reason: string): Promise<ProcessRunRow> {
  const { data, error } = await mos().rpc('cancel_process_run', {
    p_run_id: runId,
    p_reason: reason,
  })
  if (error) throw new Error(`cancelRun failed — ${error.message}`)
  return data as unknown as ProcessRunRow
}
