// What the Meeting list, page and create flow need beyond the Meeting rows: names for people and Teams,
// the viewer's own Teams (the edit rule and the new-meeting default) and the Project/Process and Objective choices.
import { getPeople, getPersonTeams, type PersonOption } from '@/lib/db/directory'
import { listTeams } from '@/lib/db/admin-users'
import { listWorkLines } from '@/lib/db/work-lines'
import { listObjectives } from '@/lib/db/objectives'

export interface MeetingContext {
  people: PersonOption[]
  teams: Array<{ id: string; name: string }>
  /** The viewer's live Team ids; the first is their primary Team when they have one. */
  viewerTeamIds: string[]
  workLines: Array<{ id: string; name: string }>
  objectives: Array<{ id: string; name: string }>
}

export async function loadMeetingContext(viewerId: string): Promise<MeetingContext> {
  const [people, teams, viewerTeams, workLines, objectives] = await Promise.all([
    getPeople(), listTeams(), getPersonTeams(viewerId), listWorkLines(), listObjectives(),
  ])
  const ordered = [...viewerTeams].sort((a, b) => Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false))
  return {
    people,
    teams: teams.map(({ id, name }) => ({ id, name })),
    viewerTeamIds: ordered.map((team) => team.id),
    workLines: workLines.map(({ id, name }) => ({ id, name })),
    objectives: objectives.map(({ id, name }) => ({ id, name })),
  }
}

export const nameOf = (rows: ReadonlyArray<{ id: string; name: string }>, id: string | null): string | null =>
  (id ? rows.find((row) => row.id === id)?.name : undefined) ?? null

/** Teams the viewer may pick as owner: their own, or all for an admin (the database allows no other); the current one stays so it still shows. */
export const pickableTeams = (ctx: MeetingContext, isAdmin: boolean, currentId: string | null) =>
  ctx.teams.filter((team) => isAdmin || team.id === currentId || ctx.viewerTeamIds.includes(team.id))
