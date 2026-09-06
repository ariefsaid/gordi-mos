import { can } from '@/lib/capabilities'

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
