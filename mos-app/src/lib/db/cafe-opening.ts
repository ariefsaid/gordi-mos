import { supabase } from '@/lib/supabase'
import { getRunRollup, startRun, listDueRuns } from './processes'
import type { DueProcessRun, ProcessRunRollup, SpawnResult } from './processes.types'

// Café DAL (Step 7 / cafe-retrofit.spec.md). Resolves the "Café Opening" Process + reads today's
// opening run/roll-up + starts it — REUSES Step 6's processes.ts (startRun/listDueRuns/getRunRollup,
// Rule 11) rather than re-implementing the spawn/rollup reads. This layer NEVER sends org_id (RLS
// stamps it) and throws on any non-null PostgREST/RPC error so the UI can surface failures.

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')

/** WIB "today" as YYYY-MM-DD (fixed +7h; mirrors kitchen-log-page.wibToday). */
export function wibToday(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`
}

/** Resolve the Café Opening process by its stable work-line code (org-scoped by RLS). */
export async function getCafeOpeningProcessId(): Promise<string | null> {
  const { data, error } = await mos()
    .from('work_lines').select('id')
    .eq('type', 'process').eq('code', 'cafe_opening').limit(1).maybeSingle()
  if (error) throw new Error(`getCafeOpeningProcessId failed — ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
}

/** Resolve the branch's canonical Café Opening Team through the same shared seam that the
 * spawn/due RPCs use. Café Opening runs are stored against this Team (live kitchen first, then
 * live bar), so a viewer's primary stream Team is only the branch context, never the run owner. */
export async function getCafeOpeningTeamId(branchId: string): Promise<string | null> {
  const { data, error } = await shared().rpc('cafe_opening_team', { p_branch_id: branchId })
  if (error) throw new Error(`getCafeOpeningTeamId failed — ${error.message}`)
  return typeof data === 'string' ? data : null
}

export interface CafeOpeningTeam {
  id: string
  name: string
}

/** Resolve an authored/membership Team through its branch to the canonical Café Opening Team. */
export async function resolveCafeOpeningTeamForTeam(teamId: string): Promise<CafeOpeningTeam | null> {
  const { data: source, error: sourceError } = await shared()
    .from('teams').select('branch_id').eq('id', teamId).maybeSingle()
  if (sourceError) throw new Error(`resolveCafeOpeningTeamForTeam source failed — ${sourceError.message}`)

  const branchId = (source as { branch_id: string | null } | null)?.branch_id ?? null
  if (!branchId) return null

  const openingTeamId = await getCafeOpeningTeamId(branchId)
  if (!openingTeamId) return null

  const { data: openingTeam, error: openingError } = await shared()
    .from('teams').select('id,name').eq('id', openingTeamId).maybeSingle()
  if (openingError) throw new Error(`resolveCafeOpeningTeamForTeam opening failed — ${openingError.message}`)

  const row = openingTeam as { id?: unknown; name?: unknown } | null
  if (typeof row?.id !== 'string' || typeof row.name !== 'string') return null
  return { id: row.id, name: row.name }
}

export interface TodayOpening {
  started: boolean
  runId: string | null
  rollup: ProcessRunRollup | null
}

/** Today's (WIB) opening for a branch Team: whether it is started, its run id, and its derived
 * roll-up (FR-702/FR-710, AC-710). */
export async function getTodayOpeningForTeam(processId: string, teamId: string): Promise<TodayOpening> {
  const { data, error } = await mos()
    .from('process_runs').select('id')
    .eq('work_line_id', processId).eq('owning_team_id', teamId).eq('period_key', wibToday())
    .limit(1).maybeSingle()
  if (error) throw new Error(`getTodayOpeningForTeam failed — ${error.message}`)
  const runId = (data as { id: string } | null)?.id ?? null
  if (!runId) return { started: false, runId: null, rollup: null }
  const rollup = await getRunRollup(runId)
  return { started: true, runId, rollup }
}

/** Start today's opening for a branch Team via the Step-6 spawn RPC (FR-703, AC-711). */
export function startTodayOpening(processId: string, teamId: string): Promise<SpawnResult> {
  return startRun(processId, teamId, wibToday())
}

/** Branch Teams for which today's opening is due (not yet started) — the Café-scoped slice of
 * Step-6's due_process_runs() (AC-711 backing). */
export async function listStartableCafeTeams(processId: string): Promise<DueProcessRun[]> {
  const due = await listDueRuns()
  return due.filter(d => d.work_line_id === processId)
}
