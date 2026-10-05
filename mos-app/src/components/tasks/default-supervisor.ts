// Supervisor default for a new Task: the creator's home Team's designated lead.
import { getMyTeamLeads, getPeople, type TeamLeadRow, type TeamOption, type PersonOption } from '@/lib/db/directory'

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

// The lead-authority reads never consume the Teams result — start them early so they race it (#1359).
export type HomeLeadReads = {
  leads: Promise<TeamLeadRow[]>
  people: Promise<PersonOption[]>
}

/** Pre-starts the two lead-authority reads; rejections are pre-handled so the early await in
 * loadHomeLeadId can never surface as an unhandled rejection while Teams is still in flight. */
export function startHomeLeadReads(): HomeLeadReads {
  const leads = getMyTeamLeads()
  const people = getPeople()
  leads.catch(() => {})
  people.catch(() => {})
  return { leads, people }
}

// Best effort: a failed read leaves Supervisor a blank explicit choice. getPeople lists active
// people only, so an archived lead is never offered.
export async function loadHomeLeadId(
  teams: readonly TeamOption[],
  viewerId: string,
  reads?: HomeLeadReads,
): Promise<string | null> {
  const homeId = homeTeamId(teams)
  if (!homeId) return null
  try {
    const [leadRows, activePeople] = await Promise.all([reads?.leads ?? getMyTeamLeads(), reads?.people ?? getPeople()])
    const leadId = defaultSupervisorId(leadRows, homeId, viewerId)
    return activePeople.some((person) => person.id === leadId) ? leadId : null
  } catch {
    return null
  }
}
