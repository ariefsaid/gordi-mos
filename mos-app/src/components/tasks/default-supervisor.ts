// Supervisor default for a new Task: the creator's home Team's designated lead.
import { listTeamLeadAssignments } from '@/lib/db/admin-access'
import type { TeamOption } from '@/lib/db/directory'

/** Home Team = the primary membership; a viewer with exactly one Team has that one. */
export function homeTeamId(teams: readonly TeamOption[]): string | null {
  return teams.find((team) => team.isPrimary)?.id ?? (teams.length === 1 ? teams[0].id : null)
}

/** The lead to pre-fill, or null: no home Team, no lead, or the creator IS the lead. */
export function defaultSupervisorId(
  assignments: readonly { team_id: string; lead_person_id: string | null }[],
  homeId: string | null,
  viewerId: string,
): string | null {
  const lead = homeId ? assignments.find((row) => row.team_id === homeId)?.lead_person_id ?? null : null
  return lead && lead !== viewerId ? lead : null
}

/** Best effort: the Team lead list is admin-only, so any other viewer (or a failed read) gets null
 * and Supervisor stays a blank explicit choice. */
export async function loadHomeLeadId(
  teams: readonly TeamOption[],
  viewerId: string,
  canReadLeads: boolean,
): Promise<string | null> {
  const homeId = homeTeamId(teams)
  if (!canReadLeads || !homeId) return null
  try {
    return defaultSupervisorId(await listTeamLeadAssignments(), homeId, viewerId)
  } catch {
    return null
  }
}
