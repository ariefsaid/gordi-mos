import { supabase } from '@/lib/supabase'
import { wibToday } from '@/lib/format/date'
export { wibToday } from '@/lib/format/date'
import { getRunRollup, startRun, listDueRuns } from './processes'
import type { DueProcessRun, ProcessRunRollup, SpawnResult } from './processes.types'
import type { ProductionActivity } from './kitchen-logs.types'

// Café DAL (Step 7 / cafe-retrofit.spec.md). Resolves the "Café Opening" Process + reads today's
// opening run/roll-up + starts it — REUSES Step 6's processes.ts (startRun/listDueRuns/getRunRollup,
// Rule 11) rather than re-implementing the spawn/rollup reads. This layer NEVER sends org_id (RLS
// stamps it) and throws on any non-null PostgREST/RPC error so the UI can surface failures.

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')

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
  /** The user-facing branch context; the canonical Team id remains internal to Opening. */
  branchId: string
}

export interface CafeViewerTeam {
  id: string
  name: string
  business_unit_id: string
  site_id: string | null
  is_primary: boolean
  /** Null when this Team is not a production stream Team (e.g. an office Team). */
  branch_id: string | null
  activity: ProductionActivity | null
  /**
   * Null = open-ended. `ops.is_stream_reviewer` (the DB predicate a supervisor's decide/plan
   * write authority is checked against) admits only an open-ended membership; a finite date
   * still counts as CURRENT for this list's own effective-dated window (comment above), so a
   * caller that means reviewer/write authority must filter this field itself rather than
   * trust every row this function returns.
   */
  effective_to: string | null
}

/**
 * Current Café-relevant profile memberships. This deliberately stays beside the Café DAL rather
 * than changing Signals' owning-Team picker: Opening needs the effective-dated rule, including a
 * membership that has a finite end date, while Signals keeps its existing write-time contract.
 */
export async function listCafeViewerTeams(personId: string): Promise<CafeViewerTeam[]> {
  const today = wibToday()
  const { data: memberships, error: membershipError } = await shared()
    .from('team_memberships')
    .select('team_id,is_primary,effective_to')
    .eq('person_id', personId)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
  if (membershipError) throw new Error(`listCafeViewerTeams memberships failed — ${membershipError.message}`)

  const rows = (memberships ?? []) as { team_id: string; is_primary: boolean; effective_to: string | null }[]
  if (rows.length === 0) return []

  const { data: teams, error: teamError } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id,branch_id,activity')
    .in('id', rows.map(row => row.team_id))
    .is('archived_at', null)
  if (teamError) throw new Error(`listCafeViewerTeams teams failed — ${teamError.message}`)

  const byTeamId = new Map(rows.map(row => [row.team_id, row]))
  return ((teams ?? []) as Omit<CafeViewerTeam, 'is_primary' | 'effective_to'>[])
    .map(team => ({
      ...team,
      is_primary: byTeamId.get(team.id)?.is_primary ?? false,
      effective_to: byTeamId.get(team.id)?.effective_to ?? null,
    }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
}

/** Resolve canonical Opening Teams for multiple branches with parallel RPCs and one name lookup. */
export async function resolveCafeOpeningTeamsForBranches(
  branchIds: readonly string[],
): Promise<Map<string, CafeOpeningTeam>> {
  const ids = [...new Set(branchIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const resolved = await Promise.all(ids.map(async (branchId) =>
    [branchId, await getCafeOpeningTeamId(branchId)] as const,
  ))
  const teamIds = [...new Set(resolved.flatMap(([, teamId]) => teamId ? [teamId] : []))]
  if (teamIds.length === 0) return new Map()

  const { data, error } = await shared().from('teams').select('id,name').in('id', teamIds)
  if (error) throw new Error(`resolveCafeOpeningTeamsForBranches teams failed — ${error.message}`)
  const names = new Map(((data ?? []) as Array<{ id: string; name: string }>).map((team) => [team.id, team.name]))
  return new Map(resolved.flatMap(([branchId, teamId]) => {
    const name = teamId ? names.get(teamId) : undefined
    return teamId && name !== undefined ? [[branchId, { id: teamId, name, branchId }] as const] : []
  }))
}

/** Resolve multiple authored/membership Teams through their branches with bounded round trips. */
export async function resolveCafeOpeningTeamsForTeamIds(
  teamIds: readonly string[],
): Promise<Map<string, CafeOpeningTeam>> {
  const ids = [...new Set(teamIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await shared().from('teams').select('id,branch_id').in('id', ids)
  if (error) throw new Error(`resolveCafeOpeningTeamsForTeamIds sources failed — ${error.message}`)
  const branchByTeam = new Map(((data ?? []) as Array<{ id: string; branch_id: string | null }>)
    .filter((team): team is { id: string; branch_id: string } => team.branch_id !== null)
    .map((team) => [team.id, team.branch_id]))
  const teamsByBranch = await resolveCafeOpeningTeamsForBranches([...new Set(branchByTeam.values())])
  return new Map([...branchByTeam].flatMap(([teamId, branchId]) => {
    const team = teamsByBranch.get(branchId)
    return team ? [[teamId, team] as const] : []
  }))
}

/** Resolve an authored/membership Team through its branch to the canonical Café Opening Team. */
export async function resolveCafeOpeningTeamForTeam(teamId: string): Promise<CafeOpeningTeam | null> {
  return (await resolveCafeOpeningTeamsForTeamIds([teamId])).get(teamId) ?? null
}

/** Resolve a live branch directly to the canonical Opening Team. */
export async function resolveCafeOpeningTeamForBranch(branchId: string): Promise<CafeOpeningTeam | null> {
  return (await resolveCafeOpeningTeamsForBranches([branchId])).get(branchId) ?? null
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
