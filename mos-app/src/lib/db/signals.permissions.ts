import { can } from '@/lib/capabilities'

// canPostTo is a THIN membership check over the DB destination allow-list — the eligible authoring
// Teams already loaded from mos.teams_author_can_read_back (see listReadableAuthorTeams). It never
// re-derives the server rule (DD-WAY-54), so it cannot drift from it.

export type SignalPermissionViewer = {
  personId: string
  accessRoles: readonly string[]
  leadsTeamIds: readonly string[]
}

export type SignalRetractTarget = { authorId: string; owningTeamId: string }

export function canRetract(viewer: SignalPermissionViewer, target: SignalRetractTarget): boolean {
  return viewer.personId === target.authorId
    || can(viewer.accessRoles, 'signal.retract')
    || viewer.leadsTeamIds.includes(target.owningTeamId)
}

export type SignalPostViewer = { authoringTeamIds: readonly string[] }

export function canPostTo(viewer: SignalPostViewer, team: { id: string }): boolean {
  return viewer.authoringTeamIds.includes(team.id)
}
