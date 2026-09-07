import { supabase } from '@/lib/supabase'
import { getRunRollup, startRun } from './processes'
import type { ProcessRunRollup, SpawnResult } from './processes.types'

export type CafeOpeningBranch = {
  branch_id: string
  team_id: string
  team_name: string
  run_id: string | null
  run_status: string | null
}

// Café DAL (Step 7 / cafe-retrofit.spec.md). Resolves the "Café Opening" Process + reads today's
// opening run/roll-up + starts it — REUSES Step 6's processes.ts (startRun/getRunRollup,
// Rule 11) rather than re-implementing the spawn/rollup reads. This layer NEVER sends org_id (RLS
// stamps it) and throws on any non-null PostgREST/RPC error so the UI can surface failures.

const mos = () => supabase.schema('mos')
/** WIB "today" as YYYY-MM-DD (fixed +7h; mirrors kitchen-log-page.wibToday). */
export function wibToday(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`
}

/** Resolve the "Café Opening" process id by name (org-scoped by RLS). RATIFY-7F: name-based v1 seam
 * — a known fragility (a rename breaks it); a stable work_lines.code is a flagged follow-up. */
export async function getCafeOpeningProcessId(): Promise<string | null> {
  const { data, error } = await mos()
    .from('work_lines').select('id')
    .eq('type', 'process').eq('name', 'Café Opening').limit(1).maybeSingle()
  if (error) throw new Error(`getCafeOpeningProcessId failed — ${error.message}`)
  return (data as { id: string } | null)?.id ?? null
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

/** Branches the caller may start, retaining started openings on the page. */
export async function listCafeOpeningBranches(): Promise<CafeOpeningBranch[]> {
  const { data, error } = await mos().rpc('cafe_opening_branches')
  if (error) throw new Error(`listCafeOpeningBranches failed — ${error.message}`)
  return (data ?? []) as CafeOpeningBranch[]
}

/** The single today-opening for one branch (#789 / OD-WAY-95 (4)): the canonical opening Team is
 * resolved server-side (kitchen first, otherwise bar — `shared.cafe_opening_team`), so one
 * opening covers a branch's kitchen and bar together and any member of either sees the SAME row.
 * Returns null when the caller has no path into the branch (finance, unaffiliated — the RPC's
 * `cafe_opening_can_start` filter is the authorization mirror) or when Café Opening is not
 * configured (RATIFY-7C). This resolver is the ONE seam the Café root's door row and the Home
 * Café door both read (AC-033 pins them by module identity). */
export interface CafeOpeningForBranch {
  processId: string
  teamId: string
  runId: string | null
  rollup: ProcessRunRollup | null
}
export async function getTodayOpeningForBranch(branchId: string): Promise<CafeOpeningForBranch | null> {
  const processId = await getCafeOpeningProcessId()
  if (!processId) return null
  const rows = await listCafeOpeningBranches()
  const row = rows.find(r => r.branch_id === branchId)
  if (!row) return null
  if (!row.run_id) return { processId, teamId: row.team_id, runId: null, rollup: null }
  const rollup = await getRunRollup(row.run_id)
  return { processId, teamId: row.team_id, runId: row.run_id, rollup }
}
