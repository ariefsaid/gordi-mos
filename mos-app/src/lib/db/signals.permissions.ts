import { can } from '@/lib/capabilities'

// canPostTo is intentionally not mirrored here (DD-WAY-54): the composer reads the database
// destination allow-list, so client-side post authorization would drift from the server rule.

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
