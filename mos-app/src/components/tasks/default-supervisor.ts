// Supervisor default for a new Task: the creator's home Team's designated lead.
import { getMyTeamLeads, type TeamLeadRow, type TeamOption } from '@/lib/db/directory'

// Home Team = the primary membership; a viewer with exactly one Team has that one.
export function homeTeamId(teams: readonly TeamOption[]): string | null {
  return teams.find((team) => team.isPrimary)?.id ?? (teams.length === 1 ? teams[0].id : null)
}

// The lead to pre-fill, or null: no home Team, no lead, or the creator IS the lead.
export function defaultSupervisorId(
  leadRows: readonly TeamLeadRow[],
  homeId: string | null,
  viewerId: string,
): string | null {
  const leadId = homeId ? leadRows.find((row) => row.team_id === homeId)?.lead_person_id ?? null : null
  return leadId && leadId !== viewerId ? leadId : null
}

// Best effort: a failed read leaves Supervisor a blank explicit choice.
export async function loadHomeLeadId(teams: readonly TeamOption[], viewerId: string): Promise<string | null> {
  const homeId = homeTeamId(teams)
  if (!homeId) return null
  try {
    return defaultSupervisorId(await getMyTeamLeads(), homeId, viewerId)
  } catch {
    return null
  }
}
