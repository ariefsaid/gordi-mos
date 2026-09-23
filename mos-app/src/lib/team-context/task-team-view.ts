import type { EligibleTeam } from './types'

// Read-time Task->Team normalization (V3 Issue 8). A Task's Business Unit and Site are DERIVED from
// its executing Team; this module resolves that relation into an honest view for the shared
// RecordViewer/collection surfaces. It never fabricates a Site, never lets a Task's BU compatibility
// column silently diverge from its Team's BU, and keeps a missing Team an honest repair state
// rather than empty data.

/** The subset of a Task row this normalization needs. business_unit_id is the compatibility
 *  projection retained during the migration; it must always equal the executing Team's BU. */
interface TaskTeamSource {
  org_id: string
  business_unit_id: string
}

/** The honest, derived Team view for one Task.
 *  - valid       : Team, derived BU, derived Site are trustworthy and ready to render.
 *  - unassigned  : no team_id yet (transitional/legacy row) — show the repair state, not empty data.
 *  - bu-mismatch : the compat BU column disagrees with the Team's BU (integrity violation to flag).
 *  - cross-org   : the joined Team belongs to another org (fail closed; never trust the join). */
export type TaskTeamView =
  | { status: 'valid'; teamId: string; teamName: string; businessUnitId: string; siteId: string | null }
  | { status: 'unassigned' }
  | { status: 'bu-mismatch' }
  | { status: 'cross-org' }

/** The minimal shape Issue 5's createTaskRecordAdapter accepts as its `team?` input. */
export interface ViewerTeam {
  id: string
  label: string
}

/** Resolve a Task and its (possibly absent) executing Team into a derived view. */
export function deriveTaskTeamView(task: TaskTeamSource, team: EligibleTeam | null): TaskTeamView {
  if (!team) return { status: 'unassigned' }
  if (team.orgId !== task.org_id) return { status: 'cross-org' }
  if (team.businessUnitId !== task.business_unit_id) return { status: 'bu-mismatch' }
  return {
    status: 'valid',
    teamId: team.id,
    teamName: team.name,
    businessUnitId: team.businessUnitId,
    siteId: team.siteId,
  }
}

/**
 * Map a derived view to the RecordViewer `team?` input. Only a valid, real Team becomes a
 * TaskTeamView; every honest non-valid state maps to null so the viewer renders its own "Team not
 * assigned yet / data migration" copy rather than a fabricated Team (Issue 5 contract).
 */
export function toViewerTeam(view: TaskTeamView): ViewerTeam | null {
  return view.status === 'valid' ? { id: view.teamId, label: view.teamName } : null
}
